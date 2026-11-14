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
 * 5. UNRESOLVED FENCE: while a thread has a stored request whose outcome is not established (`sending`,
 *    `unresolved`, `accepted`), `submitNew` is refused for that thread. The fence is lifted only by a reliable
 *    recovery read that reaches a durable state, or by the explicit, acknowledged `startNewRequest`, which marks
 *    the earlier keys `superseded` (kept, still recoverable by key, never deleted silently).
 * 6. Resending under the same key happens only through `resubmitSameKey`, only after the server itself returned
 *    `next_action: "resubmit_same_key"` for exactly this key and revision, and with the identical stored payload.
 * 7. A clarification keeps the key, increments the revision, keeps `message` and extends the accepted input.
 * 8. Polling follows `poll_after_ms`, re-reads after `503`, stops on any non-`poll` action, and is cancellable.
 *
 * 9. A durable store (`flush`) must commit the record before the POST; if it cannot, nothing is sent (fail closed).
 * 10. `reconcileThread` restores fences after a reload / in another tab from the store and `Thread.in_flight`, read-only.
 *
 * The default store is in memory (the public preview has no verified principal). `IndexedDbPendingRequestStore`
 * (`pending-store-idb.ts`) is the durable store for HTTP mode (docs/workspace-v2.md §4).
 */

/**
 * - `sending`     stored before the POST; the outcome is not known yet.
 * - `unresolved`  the POST outcome is unknown and recovery did not establish a state (`404`, `503`, network…).
 * - `accepted`    the server reported `pending` / `running` for this key; follow it by reading.
 * - `rejected`    the server rejected this attempt before admission (`409`, `403`, `422`, `429`, `401`…).
 * - `superseded`  the user explicitly started a new request; kept for diagnostics and later recovery reads.
 */
export type PendingRequestStatus = "sending" | "unresolved" | "accepted" | "rejected" | "superseded";

/** Statuses that block a normal new request in the same thread. */
const FENCING: ReadonlySet<PendingRequestStatus> = new Set(["sending", "unresolved", "accepted"]);

export interface PendingRequestRecord {
  threadId: string;
  requestKey: RequestKey;
  revision: number;
  /** The exact body sent (or to be sent). Frozen: a resend can never alter it. */
  payload: Readonly<SubmitMessageRequest>;
  status: PendingRequestStatus;
  /** Set when an acknowledged new request replaced this one. */
  supersededBy?: RequestKey;
  /** Project of the thread (scoping and diagnostics; never used to pick a target). */
  projectId?: string;
  /** When this record was first stored (client clock, diagnostics and retention only). */
  createdAt?: string;
  /**
   * The stored payload could not be read back (damaged or unknown record schema). The record still FENCES its
   * thread and can be recovered by key, but its payload is never resent; a server-permitted same-key resubmit
   * then uses the server's accepted `input`.
   */
  payloadUnavailable?: true;
}

/**
 * Where pending requests live between "stored" and "durable state reached".
 *
 * Reads are synchronous (served from memory). A durable implementation (`IndexedDbPendingRequestStore`) also
 * implements `flush` and `refresh`:
 * - `flush()` resolves once every earlier write is durable and REJECTS if a write failed. The coordinator awaits it
 *   after storing a new record and BEFORE the POST: if the record cannot be stored, nothing is sent (fail closed).
 * - `refresh()` reloads records written by other tabs before a new request is allowed (preflight).
 * Nothing here grants a right to resend: only the server's `resubmit_same_key` does.
 */
export interface PendingRequestStore {
  get(requestKey: RequestKey): PendingRequestRecord | undefined;
  put(record: PendingRequestRecord): void;
  delete(requestKey: RequestKey): void;
  list(): PendingRequestRecord[];
  clear(): void;
  flush?(): Promise<void>;
  refresh?(): Promise<void>;
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
   * Either way the thread stays fenced until recovery succeeds or the user acknowledges a new request.
   */
  | { kind: "unknown"; reason: "status_unavailable" | "no_visible_record"; record: PendingRequestRecord; error: WebApiError }
  /** The server rejected the request before admitting it, or a conflict (`409`, `403`, `422`, `429`, ...). */
  | { kind: "rejected"; record: PendingRequestRecord; error: WebApiError };

export type LocalSubmitGuardReason = "submission_in_progress" | "request_in_flight" | "unresolved_request";

const GUARD_TEXT: Record<LocalSubmitGuardReason, string> = {
  submission_in_progress: "A submission for this thread is already in progress",
  request_in_flight: "The thread already has a request in flight",
  unresolved_request: "The outcome of an earlier request in this thread is not resolved; recover it or explicitly start a new request",
};

export class LocalSubmitGuardError extends Error {
  constructor(
    readonly reason: LocalSubmitGuardReason,
    /** The unresolved requests that fence the thread (for `unresolved_request`). */
    readonly records: readonly PendingRequestRecord[] = [],
  ) {
    super(GUARD_TEXT[reason]);
    this.name = "LocalSubmitGuardError";
  }
}

export class RecoveryNotPermittedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecoveryNotPermittedError";
  }
}

/**
 * The pending record could not be stored durably, so the request was NOT sent (fail closed). The minted key was
 * never used on the wire; nothing was admitted.
 */
export class PendingStoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "PendingStoreError";
    if (options?.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
  }
}

/**
 * Optional cross-tab exclusivity for one thread (e.g. Web Locks). UX coordination only: the server's one in-flight
 * request per thread (`409 thread_busy`) stays authoritative. Must reject with `LocalSubmitGuardError` when the
 * lock is held elsewhere.
 */
export type ThreadLock = <T>(threadId: string, fn: () => Promise<T>) => Promise<T>;

/** Result of reconciling a thread after (re)opening it: server state first, then local unresolved records. */
export interface ReconcileReport {
  /** Latest server state of the thread's in-flight or latest request, when it could be read. */
  latest: MessageResult | null;
  /** Outcomes of read-only recovery of local records that the server did not report as in flight. */
  recovered: RequestOutcome[];
  /** Local records that still fence the thread after reconciliation. */
  fenced: PendingRequestRecord[];
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
  /** Cross-tab exclusivity per thread (optional; the server stays authoritative). */
  threadLock?: ThreadLock;
  /** Client clock for `createdAt` on records (diagnostics/retention only). */
  now?: () => Date;
}

/** Extra context recorded with a new request. */
export interface SubmitContext {
  projectId?: string;
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

  private readonly threadLock: ThreadLock | null;
  /** Record a new write replaced, kept until the write is durable (restored if it fails). */
  private readonly replaced = new Map<string, PendingRequestRecord | undefined>();
  private readonly now: () => Date;

  constructor(
    private readonly api: WebApiV2,
    options: RequestCoordinatorOptions = {},
  ) {
    this.store = options.store ?? new MemoryPendingRequestStore();
    this.keySource = options.keySource ?? {};
    this.sleep = options.sleep ?? defaultSleep;
    this.defaultRetryAfterMs = options.defaultRetryAfterMs ?? 5_000;
    this.threadLock = options.threadLock ?? null;
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Submits a NEW request (fresh key, revision 1). Refused while the thread has an unresolved request.
   * Preflight (local guard, other tabs' records, unresolved fence) runs BEFORE a key is minted.
   */
  async submitNew(threadId: string, input: SubmittedInput, context: SubmitContext = {}): Promise<RequestOutcome> {
    return this.guarded(threadId, async () => {
      await this.refreshStore();
      this.assertCanStart(threadId);
      const record = this.persist({ ...input, request_key: createRequestKey(this.keySource), revision: 1 }, threadId, context.projectId);
      await this.ensureDurable(record);
      return this.send(record);
    });
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
    return this.guarded(threadId, async () => {
      await this.refreshStore();
      this.assertCanStart(threadId, um.request_key);
      const record = this.persist(payload, threadId, previous.project_id);
      await this.ensureDurable(record);
      return this.send(record);
    });
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
    const threadId = serverSaid.thread_id;
    return this.guarded(threadId, async () => {
      await this.refreshStore();
      const stored = this.store.get(um.request_key);
      const payload: SubmitMessageRequest =
        stored && stored.revision === um.revision && !stored.payloadUnavailable
          ? (structuredClone(stored.payload) as SubmitMessageRequest)
          : { ...(structuredClone(um.input) ?? { message: um.text }), request_key: um.request_key, revision: um.revision };
      this.assertCanStart(threadId, um.request_key);
      const record = this.persist(payload, threadId, serverSaid.project_id);
      await this.ensureDurable(record);
      return this.send(record);
    });
  }

  /**
   * Explicit "start a new request" after `ambiguous`, `expired`, an overdue run or an unknown outcome. Mints a
   * NEW key. Requires the caller to acknowledge that the model may generate again (shown to the user). This is
   * the ONLY way past the unresolved fence: earlier unresolved keys of the thread are marked `superseded`
   * (with `supersededBy`) and stay in the store, still recoverable by key.
   */
  async startNewRequest(
    threadId: string,
    input: SubmittedInput,
    ack: { acknowledgeMayRegenerate: true },
    context: SubmitContext = {},
  ): Promise<RequestOutcome> {
    if (ack?.acknowledgeMayRegenerate !== true) throw new RecoveryNotPermittedError("Starting a new request must be explicitly acknowledged");
    return this.guarded(threadId, async () => {
      await this.refreshStore();
      const last = this.lastState.get(threadId);
      if (last && (last.state === "pending" || last.state === "running") && !last.running_overdue) {
        throw new LocalSubmitGuardError("request_in_flight");
      }
      const requestKey = createRequestKey(this.keySource);
      const priors = this.unresolvedRequests(threadId);
      const record = this.persist({ ...input, request_key: requestKey, revision: 1 }, threadId, context.projectId);
      // If the new record cannot be stored, nothing is sent and the earlier keys keep fencing the thread.
      await this.ensureDurable(record);
      // Superseded keys stay stored and recoverable by key; they are never deleted silently.
      for (const prior of priors) this.setStatus(prior.requestKey, "superseded", requestKey);
      return this.send(record);
    });
  }

  /**
   * Read-only recovery by key. Never POSTs, never mints a key. A durable state lifts the fence; `pending` /
   * `running` keep it (as `accepted`); a failed read keeps it (as `unresolved`).
   */
  async recover(record: Pick<PendingRequestRecord, "threadId" | "requestKey" | "revision" | "payload">, signal?: AbortSignal): Promise<RequestOutcome> {
    const known = (): PendingRequestRecord =>
      this.store.get(record.requestKey) ?? { ...record, status: "unresolved" };
    try {
      const result = await this.api.getRequestByKey(record.threadId, record.requestKey, { signal });
      this.observe(result);
      return { kind: "state", result };
    } catch (error) {
      const err = toWebApiError(error);
      this.markUnresolved(record.requestKey);
      if (err.code === "not_found" && err.status === 404) return { kind: "unknown", reason: "no_visible_record", record: known(), error: err };
      if (err.outcomeUnknown) return { kind: "unknown", reason: "status_unavailable", record: known(), error: err };
      return { kind: "rejected", record: known(), error: err };
    }
  }

  /** Stored requests of a thread whose outcome is not established; they fence `submitNew`. */
  unresolvedRequests(threadId: string): PendingRequestRecord[] {
    return this.store.list().filter((r) => r.threadId === threadId && FENCING.has(r.status));
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

  /** Read-only status read of one message (e.g. the latest request of a reopened thread). Never generates. */
  async inspect(messageId: string, signal?: AbortSignal): Promise<MessageResult> {
    const result = await this.api.getMessage(messageId, { signal });
    this.observe(result);
    return result;
  }

  /**
   * After a reload, on another tab or when a thread is (re)opened: reconciles local records with the server,
   * READ-ONLY. Never POSTs, never mints a key.
   * 1. `Thread.in_flight` (server truth) is followed by a read; a matching local record becomes `accepted`.
   * 2. Otherwise the latest request (`latestMessageId`, when known) is read so `ambiguous` / `expired` /
   *    `needs_input` fences and next actions are restored.
   * 3. Every other local record that still fences the thread is recovered by key. A failed read keeps it
   *    `unresolved`: nothing is resent automatically.
   */
  async reconcileThread(thread: Thread, options: { latestMessageId?: string | null; signal?: AbortSignal } = {}): Promise<ReconcileReport> {
    const { signal } = options;
    await this.refreshStore();
    // This tab is submitting in the thread right now: the live submission owns its record and state.
    if (this.submitting.has(thread.id)) return { latest: null, recovered: [], fenced: this.unresolvedRequests(thread.id) };
    let latest: MessageResult | null = null;
    try {
      if (thread.in_flight) latest = await this.followInFlight(thread, signal);
      else if (options.latestMessageId) latest = await this.inspect(options.latestMessageId, signal);
    } catch (error) {
      const err = toWebApiError(error);
      if (err.kind === "aborted" || signal?.aborted) throw err;
      // An unreadable status is not a reason to do anything; local records below still fence the thread.
    }
    const seenKey = latest?.user_message.request_key ?? null;
    const recovered: RequestOutcome[] = [];
    for (const record of this.unresolvedRequests(thread.id)) {
      if (record.requestKey === seenKey) continue;
      if (signal?.aborted) break;
      recovered.push(await this.recover(record, signal));
    }
    return { latest, recovered, fenced: this.unresolvedRequests(thread.id) };
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

  /**
   * `exceptKey`: a same-key continuation (clarification, server-permitted resubmit) of that request is allowed;
   * any OTHER unresolved request in the thread still fences it.
   */
  private assertCanStart(threadId: string, exceptKey?: RequestKey) {
    const last = this.lastState.get(threadId);
    if (last && (last.state === "pending" || last.state === "running") && last.user_message.request_key !== exceptKey) {
      throw new LocalSubmitGuardError("request_in_flight");
    }
    // `ambiguous` / `expired`: the server says only an explicit, warned new request may follow (README §10 item 6).
    if (!exceptKey && last && (last.state === "ambiguous" || last.state === "expired")) {
      throw new LocalSubmitGuardError("unresolved_request");
    }
    const fenced = this.unresolvedRequests(threadId).filter((r) => r.requestKey !== exceptKey);
    if (fenced.length) throw new LocalSubmitGuardError("unresolved_request", fenced);
  }

  private persist(payload: SubmitMessageRequest, threadId: string, projectId?: string): PendingRequestRecord {
    const prior = this.store.get(payload.request_key);
    const resolvedProject = projectId ?? prior?.projectId;
    const record: PendingRequestRecord = deepFreeze({
      threadId,
      requestKey: payload.request_key,
      revision: payload.revision,
      payload: structuredClone(payload),
      status: "sending",
      createdAt: prior?.createdAt ?? this.now().toISOString(),
      ...(resolvedProject ? { projectId: resolvedProject } : {}),
    });
    this.store.put(record);
    this.replaced.set(record.requestKey, prior);
    return record;
  }

  /**
   * Waits until the stored record is durable. If the store cannot write it, the record is withdrawn (it was never
   * sent) and `PendingStoreError` is thrown: no POST without a stored record (fail closed).
   */
  private async ensureDurable(record: PendingRequestRecord) {
    if (!this.store.flush) return;
    try {
      await this.store.flush();
      this.replaced.delete(record.requestKey);
    } catch (cause) {
      // Restore what was there before (an earlier fencing record keeps fencing); a brand-new record is withdrawn.
      const prior = this.replaced.get(record.requestKey);
      if (prior) this.store.put(prior);
      else this.store.delete(record.requestKey);
      throw new PendingStoreError("The request could not be stored durably; it was not sent", { cause });
    }
  }

  /** Picks up records other tabs wrote. A failed refresh keeps the cached records (never fewer fences). */
  private async refreshStore() {
    if (!this.store.refresh) return;
    try {
      await this.store.refresh();
    } catch {
      /* keep the cache: it only ever errs towards fencing */
    }
  }

  /** Records are immutable: a status change stores a new frozen record with the same frozen payload. */
  private setStatus(requestKey: RequestKey, status: PendingRequestStatus, supersededBy?: RequestKey) {
    const current = this.store.get(requestKey);
    if (!current || current.status === status) return;
    this.store.put(deepFreeze({ ...current, status, ...(supersededBy ? { supersededBy } : {}) }));
  }

  /** A failed recovery read keeps (or makes) the request unresolved, unless the user already superseded it. */
  private markUnresolved(requestKey: RequestKey) {
    const current = this.store.get(requestKey);
    if (current && current.status !== "superseded") this.setStatus(requestKey, "unresolved");
  }

  private async guarded(threadId: string, fn: () => Promise<RequestOutcome>): Promise<RequestOutcome> {
    // Synchronous check-and-set: a second click in the same tick is refused before anything else happens.
    if (this.submitting.has(threadId)) throw new LocalSubmitGuardError("submission_in_progress");
    this.submitting.add(threadId);
    try {
      return await (this.threadLock ? this.threadLock(threadId, fn) : fn());
    } finally {
      this.submitting.delete(threadId);
    }
  }

  /** True while this tab is submitting in the thread (UI hint). */
  isSubmitting(threadId: string): boolean {
    return this.submitting.has(threadId);
  }

  /** One POST. On an unknown outcome: read-only recovery. Never a second POST. */
  private async send(record: PendingRequestRecord): Promise<RequestOutcome> {
    let response: SubmitResponse;
    try {
      response = await this.api.submitMessage(record.threadId, record.payload as SubmitMessageRequest);
    } catch (error) {
      const err = toWebApiError(error);
      // 503 / network / timeout / edge: the request may or may not have been admitted. Read, never resend.
      if (err.outcomeUnknown) {
        this.setStatus(record.requestKey, "unresolved");
        return this.recover(record);
      }
      this.setStatus(record.requestKey, "rejected");
      return { kind: "rejected", record: this.store.get(record.requestKey) ?? record, error: err };
    }
    this.observe(response.result);
    return { kind: "state", result: response.result, httpStatus: response.httpStatus };
  }

  private observe(result: MessageResult) {
    this.lastState.set(result.thread_id, result);
    const key = result.user_message.request_key;
    if (DURABLE_STATES.has(result.state)) {
      this.store.delete(key);
    } else {
      // pending / running: the server knows the request; it keeps fencing the thread until it is durable.
      const current = this.store.get(key);
      if (current && current.status !== "superseded") this.setStatus(key, "accepted");
    }
  }
}

function toWebApiError(error: unknown): WebApiError {
  if (isWebApiError(error)) return error;
  return new WebApiError({ kind: "network", operation: "submitMessage", status: null, code: null, cause: error });
}
