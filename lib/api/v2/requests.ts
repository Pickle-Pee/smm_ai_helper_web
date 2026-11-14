import type { WebApiV2 } from "./contract";
import { isWebApiError, WebApiError } from "./errors";
import { createRequestKey, type RequestKeySource } from "./request-key";
import type { BusinessContext, MessageResult, RequestKey, SubmitMessageRequest, SubmittedInput, SubmitResponse, Thread } from "./types";

/**
 * Client side of the request lifecycle (README §10). The server is authoritative: this module never decides
 * that a request is `ambiguous`, `expired` or safe to resend; it follows `state` / `next_action` only.
 *
 * Guarantees (each covered by `requests.test.ts`):
 * 1. A new request gets a fresh `w-<uuidv7>` key and its payload is frozen and stored BEFORE the POST.
 * 2. One local submission per thread at a time (double click / second call is refused locally), and no new
 *    request while the server reports one `pending`/`running` in the thread.
 * 3. A lost/unknown outcome (network, timeout, edge 502/504, `503`) is recovered with a read-only
 *    `getRequestByKey`. The POST is NEVER repeated automatically.
 * 4. `404` on recovery is "no visible record", NOT proof the model did not run: no resend.
 * 5. Resending under the same key happens only through `resubmitSameKey`, only after the server itself returned
 *    `next_action: "resubmit_same_key"` for exactly this key and revision, and with the identical stored payload.
 * 6. A clarification keeps the key, increments the revision, keeps `message` and extends the accepted input.
 * 7. A new key after `ambiguous` / `expired` / overdue / unknown outcome exists only behind
 *    `startNewRequest(..., { acknowledgeMayRegenerate: true })` (an explicit, warned user action).
 * 8. Polling follows `poll_after_ms`, re-reads after `503`, stops on any non-`poll` action, and is cancellable.
 */

export interface PendingRequestRecord {
  threadId: string;
  requestKey: RequestKey;
  revision: number;
  /** The exact body sent (or to be sent). Frozen: a resend can never alter it. */
  payload: Readonly<SubmitMessageRequest>;
}

/**
 * Where pending requests live between "stored" and "durable state reached". F1 ships the in-memory store only;
 * the IndexedDB store (README §10 item 2) is part of switching HTTP on. Nothing here grants a right to resend:
 * only the server's `resubmit_same_key` does.
 */
export interface PendingRequestStore {
  get(requestKey: RequestKey): PendingRequestRecord | undefined;
  put(record: PendingRequestRecord): void;
  delete(requestKey: RequestKey): void;
  list(): PendingRequestRecord[];
  clear(): void;
}

export class MemoryPendingRequestStore implements PendingRequestStore {
  private readonly items = new Map<string, PendingRequestRecord>();
  get(key: RequestKey) {
    return this.items.get(key);
  }
  put(record: PendingRequestRecord) {
    this.items.set(record.requestKey, record);
  }
  delete(key: RequestKey) {
    this.items.delete(key);
  }
  list() {
    return [...this.items.values()];
  }
  clear() {
    this.items.clear();
  }
}

/** What the caller (UI) gets back. Exactly one of three shapes; never a guess. */
export type RequestOutcome =
  /** The server reported a state. Follow `result.next_action`. */
  | { kind: "state"; result: MessageResult; httpStatus?: 200 | 202 }
  /**
   * The outcome is not known. `status_unavailable`: the status could not be read (retry the READ later).
   * `no_visible_record`: recovery returned `404`; the model may still have run, so nothing is resent.
   */
  | { kind: "unknown"; reason: "status_unavailable" | "no_visible_record"; record: PendingRequestRecord; error: WebApiError }
  /** The server rejected the request before admitting it, or a conflict (`409`, `403`, `422`, `429`, ...). */
  | { kind: "rejected"; record: PendingRequestRecord; error: WebApiError };

export class LocalSubmitGuardError extends Error {
  constructor(readonly reason: "submission_in_progress" | "request_in_flight") {
    super(reason === "submission_in_progress" ? "A submission for this thread is already in progress" : "The thread already has a request in flight");
    this.name = "LocalSubmitGuardError";
  }
}

export class RecoveryNotPermittedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecoveryNotPermittedError";
  }
}

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

export const defaultSleep: Sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

export interface RequestCoordinatorOptions {
  store?: PendingRequestStore;
  keySource?: RequestKeySource;
  sleep?: Sleep;
  /** Delay before re-reading after `503` without `Retry-After`. */
  defaultRetryAfterMs?: number;
}

const DURABLE_STATES = new Set<MessageResult["state"]>([
  "needs_input",
  "completed",
  "completed_with_limitations",
  "blocked",
  "failed",
  "ambiguous",
  "expired",
  "unsupported",
]);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
}

export class RequestCoordinator {
  readonly store: PendingRequestStore;
  private readonly keySource: RequestKeySource;
  private readonly sleep: Sleep;
  private readonly defaultRetryAfterMs: number;
  /** Threads with a submission in progress in THIS tab (double-submit guard). */
  private readonly submitting = new Set<string>();
  /** Last server state seen per thread, used for the "one in-flight request per thread" guard. */
  private readonly lastState = new Map<string, MessageResult>();

  constructor(
    private readonly api: WebApiV2,
    options: RequestCoordinatorOptions = {},
  ) {
    this.store = options.store ?? new MemoryPendingRequestStore();
    this.keySource = options.keySource ?? {};
    this.sleep = options.sleep ?? defaultSleep;
    this.defaultRetryAfterMs = options.defaultRetryAfterMs ?? 5_000;
  }

  /** Submits a NEW request (fresh key, revision 1). */
  async submitNew(threadId: string, input: SubmittedInput): Promise<RequestOutcome> {
    this.assertCanStart(threadId);
    const record = this.persist({ ...input, request_key: createRequestKey(this.keySource), revision: 1 }, threadId);
    return this.guarded(threadId, () => this.send(record));
  }

  /**
   * Answers `NEEDS_INPUT`: SAME key, revision + 1, SAME message; the accepted input is extended with the answer.
   * Allowed only when the server said `answer_clarification` for the latest revision.
   */
  async answerClarification(
    previous: MessageResult,
    answer: { context?: BusinessContext; confirmation?: SubmitMessageRequest["confirmation"] },
  ): Promise<RequestOutcome> {
    const um = previous.user_message;
    if (previous.state !== "needs_input" || previous.next_action !== "answer_clarification" || !um.is_latest_revision) {
      throw new RecoveryNotPermittedError("A clarification can only answer the latest NEEDS_INPUT revision of the author");
    }
    const accepted: SubmittedInput = um.input ?? { message: um.text };
    const payload: SubmitMessageRequest = {
      ...structuredClone(accepted),
      request_key: um.request_key,
      revision: um.revision + 1,
      message: accepted.message,
    };
    if (answer.context) payload.context = { ...accepted.context, ...answer.context };
    if (answer.confirmation !== undefined) payload.confirmation = answer.confirmation;
    const threadId = previous.thread_id;
    if (this.submitting.has(threadId)) throw new LocalSubmitGuardError("submission_in_progress");
    const record = this.persist(payload, threadId);
    return this.guarded(threadId, () => this.send(record));
  }

  /**
   * Resends the stored payload under the SAME key. Permitted only when `serverSaid` is the server's own answer
   * for this key and revision with `next_action: "resubmit_same_key"`. The payload comes from the store (or,
   * on another device, from the server's accepted `input`), never from the UI.
   */
  async resubmitSameKey(serverSaid: MessageResult): Promise<RequestOutcome> {
    const um = serverSaid.user_message;
    if (serverSaid.next_action !== "resubmit_same_key" || serverSaid.state !== "pending") {
      throw new RecoveryNotPermittedError("The server has not permitted a resubmission under this key");
    }
    const stored = this.store.get(um.request_key);
    const payload: SubmitMessageRequest =
      stored && stored.revision === um.revision
        ? structuredClone(stored.payload) as SubmitMessageRequest
        : { ...(structuredClone(um.input) ?? { message: um.text }), request_key: um.request_key, revision: um.revision };
    if (this.submitting.has(serverSaid.thread_id)) throw new LocalSubmitGuardError("submission_in_progress");
    const record = this.persist(payload, serverSaid.thread_id);
    return this.guarded(serverSaid.thread_id, () => this.send(record));
  }

  /**
   * Explicit "start a new request" after `ambiguous`, `expired`, an overdue run or an unknown outcome. Mints a
   * NEW key. Requires the caller to acknowledge that the model may generate again (shown to the user).
   */
  async startNewRequest(threadId: string, input: SubmittedInput, ack: { acknowledgeMayRegenerate: true }): Promise<RequestOutcome> {
    if (ack?.acknowledgeMayRegenerate !== true) throw new RecoveryNotPermittedError("Starting a new request must be explicitly acknowledged");
    const last = this.lastState.get(threadId);
    if (last && (last.state === "pending" || last.state === "running") && !last.running_overdue) {
      throw new LocalSubmitGuardError("request_in_flight");
    }
    if (this.submitting.has(threadId)) throw new LocalSubmitGuardError("submission_in_progress");
    const record = this.persist({ ...input, request_key: createRequestKey(this.keySource), revision: 1 }, threadId);
    return this.guarded(threadId, () => this.send(record));
  }

  /** Read-only recovery by key. Never POSTs, never mints a key. */
  async recover(record: Pick<PendingRequestRecord, "threadId" | "requestKey" | "revision" | "payload">, signal?: AbortSignal): Promise<RequestOutcome> {
    const full = record as PendingRequestRecord;
    try {
      const result = await this.api.getRequestByKey(record.threadId, record.requestKey, { signal });
      this.observe(result);
      return { kind: "state", result };
    } catch (error) {
      const err = toWebApiError(error);
      if (err.code === "not_found" && err.status === 404) return { kind: "unknown", reason: "no_visible_record", record: full, error: err };
      if (err.outcomeUnknown) return { kind: "unknown", reason: "status_unavailable", record: full, error: err };
      return { kind: "rejected", record: full, error: err };
    }
  }

  /**
   * After a reload (or on another device): follows `Thread.in_flight` with a read instead of submitting again.
   */
  async followInFlight(thread: Thread, signal?: AbortSignal): Promise<MessageResult | null> {
    if (!thread.in_flight) return null;
    const result = await this.api.getMessage(thread.in_flight.message_id, { signal });
    this.observe(result);
    return result;
  }

  /**
   * Polls `getMessage` while the server says `poll`. Read-only. Re-reads after `503` (honouring `Retry-After`).
   * Never stops on its own because of elapsed time: only the server ends polling, or the caller via `signal`.
   */
  async poll(messageId: string, options: { signal?: AbortSignal; onUpdate?: (result: MessageResult) => void } = {}): Promise<MessageResult> {
    const { signal, onUpdate } = options;
    for (;;) {
      let result: MessageResult;
      try {
        result = await this.api.getMessage(messageId, { signal });
      } catch (error) {
        const err = toWebApiError(error);
        if (err.kind === "aborted" || signal?.aborted) throw err;
        if (!err.outcomeUnknown) throw err;
        await this.sleep(err.retryAfterSeconds ? err.retryAfterSeconds * 1000 : this.defaultRetryAfterMs, signal);
        continue;
      }
      this.observe(result);
      onUpdate?.(result);
      if (result.next_action !== "poll") return result;
      await this.sleep(result.poll_after_ms ?? this.defaultRetryAfterMs, signal);
    }
  }

  /** Last state observed for a thread (UI hint for the local guard). */
  lastStateOf(threadId: string): MessageResult | undefined {
    return this.lastState.get(threadId);
  }

  /* ---------------- internals ---------------- */

  private assertCanStart(threadId: string) {
    if (this.submitting.has(threadId)) throw new LocalSubmitGuardError("submission_in_progress");
    const last = this.lastState.get(threadId);
    if (last && (last.state === "pending" || last.state === "running")) throw new LocalSubmitGuardError("request_in_flight");
  }

  private persist(payload: SubmitMessageRequest, threadId: string): PendingRequestRecord {
    const record: PendingRequestRecord = deepFreeze({
      threadId,
      requestKey: payload.request_key,
      revision: payload.revision,
      payload: structuredClone(payload),
    });
    this.store.put(record);
    return record;
  }

  private async guarded(threadId: string, fn: () => Promise<RequestOutcome>): Promise<RequestOutcome> {
    if (this.submitting.has(threadId)) throw new LocalSubmitGuardError("submission_in_progress");
    this.submitting.add(threadId);
    try {
      return await fn();
    } finally {
      this.submitting.delete(threadId);
    }
  }

  /** One POST. On an unknown outcome: read-only recovery. Never a second POST. */
  private async send(record: PendingRequestRecord): Promise<RequestOutcome> {
    let response: SubmitResponse;
    try {
      response = await this.api.submitMessage(record.threadId, record.payload as SubmitMessageRequest);
    } catch (error) {
      const err = toWebApiError(error);
      // 503 / network / timeout / edge: the request may or may not have been admitted. Read, never resend.
      if (err.outcomeUnknown) return this.recover(record);
      return { kind: "rejected", record, error: err };
    }
    this.observe(response.result);
    return { kind: "state", result: response.result, httpStatus: response.httpStatus };
  }

  private observe(result: MessageResult) {
    this.lastState.set(result.thread_id, result);
    if (DURABLE_STATES.has(result.state)) this.store.delete(result.user_message.request_key);
  }
}

function toWebApiError(error: unknown): WebApiError {
  if (isWebApiError(error)) return error;
  return new WebApiError({ kind: "network", operation: "submitMessage", status: null, code: null, cause: error });
}
