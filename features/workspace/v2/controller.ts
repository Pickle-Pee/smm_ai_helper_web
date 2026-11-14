import type { WebApiV2 } from "@/lib/api/v2/contract";
import { isWebApiError, WebApiError } from "@/lib/api/v2/errors";
import type { SubmitScenario } from "@/lib/api/v2/fixture-client";
import { selectPendingRequestStore, type PendingStoreSelection } from "@/lib/api/v2/pending-store";
import {
  presentError,
  presentExecution,
  presentResultError,
  presentSnapshot,
  presentThreadMessage,
  presentThreadSummary,
  presentWorkspaceProject,
  type ExecutionView,
  type ThreadMessageView,
  type ThreadSummaryView,
  type WorkspaceProjectView,
} from "@/lib/api/v2/presenters";
import {
  LocalSubmitGuardError,
  PendingStoreError,
  RecoveryNotPermittedError,
  RequestCoordinator,
  isLateReply,
  type PendingRequestStatus,
  type RequestOutcome,
  type Sleep,
  type ThreadLock,
} from "@/lib/api/v2/requests";
import type { BusinessContext, MessageResult, SubmittedInput, Thread } from "@/lib/api/v2/types";

/**
 * AI Workspace controller (F2): the ONLY place where the Workspace talks to Web API v2.
 *
 * - Reads (`listOrganizations`, `listProjects`, `listThreads`, `getThread`, `listThreadMessages`,
 *   `getMessageResult`) go to the injected `WebApiV2` (fixture transport in the app).
 * - Everything that can start, continue or recover AI work goes through `RequestCoordinator` — submit, clarify,
 *   same-key resubmit, acknowledged new request, recovery by key, `in_flight` reconciliation and polling.
 *   This module never calls `submitMessage` / `getRequestByKey` itself (source-policy test).
 * - State handed to React is view models from `lib/api/v2/presenters.ts`; DTOs stay private here.
 *
 * Framework-agnostic (subscribe / getSnapshot) so it is testable without React and survives page navigation.
 */

export type LoadStatus = "idle" | "loading" | "ready" | "error";

export interface RequestErrorView {
  text: string;
  code: string | null;
  status: number | null;
  requestId: string | null;
  retryAfterSeconds: number | null;
  resetsAt: string | null;
}

export type RequestPhase =
  /** Nothing in progress in this tab. */
  | "idle"
  /** POST (or recovery read after it) in progress. */
  | "submitting"
  /** Server reported `pending`/`running`; following it by reading. */
  | "waiting"
  /** Last request reached a durable server state (`execution` says which). */
  | "settled"
  /** POST outcome unknown and recovery did not establish a state. The thread is fenced. */
  | "unknown"
  /** The server rejected the attempt before admission (409/403/422/429…). Nothing was admitted. */
  | "rejected"
  /** Refused locally (double click, unresolved request, request in flight, storage unavailable). Nothing sent. */
  | "refused";

export interface ThreadRequestView {
  phase: RequestPhase;
  /** Server-reported state of the thread's latest request (verbatim via presenter). */
  execution: ExecutionView | null;
  /** A polling loop is active for this thread (only the open thread polls). */
  polling: boolean;
  /** The user stopped waiting. The server request was NOT cancelled. */
  stoppedWaiting: boolean;
  unknown: { reason: "status_unavailable" | "no_visible_record"; text: string } | null;
  error: RequestErrorView | null;
  /** Local refusal reason. */
  refusal: { reason: LocalSubmitGuardError["reason"] | "store_unavailable" | "not_permitted"; text: string } | null;
  /** Keys still fencing this thread locally (diagnostics only; never shown as content). */
  fencedKeys: { requestKey: string; revision: number; status: PendingRequestStatus }[];
  /** The user's own text of the latest unconfirmed request (from the stored, immutable payload). */
  pendingMessage: string | null;
}

export interface ThreadDetailView {
  status: "loading" | "ready" | "error" | "not_found";
  messages: ThreadMessageView[];
  request: ThreadRequestView;
}

export interface WorkspaceV2State {
  status: LoadStatus;
  /** Where pending requests live. `transient` in the public preview (no verified user). */
  storeKind: PendingStoreSelection["kind"];
  orgId: string | null;
  projects: WorkspaceProjectView[];
  threads: ThreadSummaryView[];
  details: Readonly<Record<string, ThreadDetailView>>;
  /** A thread is being created (double-click guard for "send" on a new conversation). */
  creating: boolean;
  createError: RequestErrorView | null;
}

export interface WorkspaceV2Simulation {
  /** Fixture-only: how the simulated server answers the next new request of a thread. */
  setThreadScenario(threadId: string, scenario: SubmitScenario): void;
}

export interface WorkspaceV2ControllerOptions {
  api: WebApiV2;
  /** Defaults to the transient (memory) store: there is no verified principal before real sessions exist. */
  pendingStore?: PendingStoreSelection;
  simulation?: WorkspaceV2Simulation | null;
  sleep?: Sleep;
  threadLock?: ThreadLock;
  /** Idempotency keys for `createThread`. */
  newId?: () => string;
}

const EMPTY_REQUEST: ThreadRequestView = {
  phase: "idle",
  execution: null,
  polling: false,
  stoppedWaiting: false,
  unknown: null,
  error: null,
  refusal: null,
  fencedKeys: [],
  pendingMessage: null,
};

const GUARD_TEXT: Record<LocalSubmitGuardError["reason"], string> = {
  submission_in_progress: "Запрос уже отправляется. Повторное нажатие ничего не отправит.",
  request_in_flight: "В этом диалоге уже выполняется запрос. Дождитесь результата.",
  unresolved_request:
    "Исход предыдущего запроса в этом диалоге не подтверждён. Проверьте его статус или явно начните новый запрос — автоматически ничего не отправляется.",
};
const STORE_TEXT = "Не удалось надёжно сохранить запрос перед отправкой, поэтому он не отправлен.";
const UNKNOWN_TEXT: Record<"status_unavailable" | "no_visible_record", string> = {
  status_unavailable:
    "Ответ на запрос потерян, а статус пока прочитать не удалось. Запрос не отправляется повторно — проверьте статус позже.",
  no_visible_record:
    "Сервис не нашёл запись об этом запросе. Это не доказывает, что генерация не запускалась, поэтому запрос не отправляется повторно.",
};

function errorView(error: WebApiError): RequestErrorView {
  return { ...presentError(error), code: error.code, status: error.status };
}

function toWebApiError(error: unknown): WebApiError | null {
  return isWebApiError(error) ? error : null;
}

function defaultNewId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  throw new Error("crypto.randomUUID is required");
}

export class WorkspaceV2Controller {
  readonly coordinator: RequestCoordinator;
  private state: WorkspaceV2State;
  private readonly listeners = new Set<() => void>();
  private readonly api: WebApiV2;
  private readonly simulation: WorkspaceV2Simulation | null;
  private readonly newId: () => string;
  /** Latest server answer per thread (DTO, private): needed to clarify / resubmit / start over. */
  private readonly latest = new Map<string, MessageResult>();
  /** Thread DTOs (private). */
  private readonly threadDtos = new Map<string, Thread>();
  private readonly polls = new Map<string, AbortController>();
  private readonly loads = new Map<string, AbortController>();
  private openThreadId: string | null = null;
  private startPromise: Promise<void> | null = null;
  private disposed = false;

  constructor(options: WorkspaceV2ControllerOptions) {
    this.api = options.api;
    this.simulation = options.simulation ?? null;
    this.newId = options.newId ?? defaultNewId;
    this.coordinator = new RequestCoordinator(options.api, {
      store: options.pendingStore?.store,
      sleep: options.sleep,
      threadLock: options.threadLock,
    });
    this.state = {
      status: "idle",
      storeKind: options.pendingStore?.kind ?? "transient",
      orgId: null,
      projects: [],
      threads: [],
      details: {},
      creating: false,
      createError: null,
    };
  }

  /* ---------------- external store ---------------- */

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): WorkspaceV2State => this.state;

  private set(patch: Partial<WorkspaceV2State> | ((s: WorkspaceV2State) => Partial<WorkspaceV2State>)) {
    if (this.disposed) return;
    const next = typeof patch === "function" ? patch(this.state) : patch;
    this.state = { ...this.state, ...next };
    this.listeners.forEach((l) => l());
  }

  private setDetail(threadId: string, fn: (d: ThreadDetailView) => Partial<ThreadDetailView>) {
    this.set((s) => {
      const current = s.details[threadId] ?? { status: "loading" as const, messages: [], request: EMPTY_REQUEST };
      return { details: { ...s.details, [threadId]: { ...current, ...fn(current) } } };
    });
  }

  private setRequest(threadId: string, patch: Partial<ThreadRequestView>) {
    const fenced = this.coordinator.unresolvedRequests(threadId);
    const fencedKeys = fenced.map((r) => ({ requestKey: r.requestKey, revision: r.revision, status: r.status }));
    const pendingMessage = this.latestFencedInput(threadId)?.message ?? null;
    this.setDetail(threadId, (d) => ({ request: { ...d.request, ...patch, fencedKeys, pendingMessage } }));
  }

  /** The stored (frozen) input of the most recent fencing request, without key/revision. */
  private latestFencedInput(threadId: string): SubmittedInput | null {
    const records = this.coordinator
      .unresolvedRequests(threadId)
      .filter((r) => !r.payloadUnavailable)
      .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
    const last = records.at(-1);
    if (!last) return null;
    const { request_key: _k, revision: _r, ...input } = structuredClone(last.payload) as SubmittedInput & { request_key?: string; revision?: number };
    return input;
  }

  /* ---------------- projects & threads ---------------- */

  /** Loads organizations → projects → thread summaries once. Message history is NOT loaded here. */
  start(): Promise<void> {
    this.startPromise ??= this.load();
    return this.startPromise;
  }

  reload(): Promise<void> {
    this.startPromise = this.load();
    return this.startPromise;
  }

  private async load() {
    this.set({ status: "loading" });
    try {
      const orgs = await this.api.listOrganizations();
      const orgId = orgs.items[0]?.organization.id ?? null;
      if (!orgId) {
        this.set({ status: "ready", orgId: null, projects: [], threads: [] });
        return;
      }
      const projects = (await this.api.listProjects(orgId)).items;
      const lists = await Promise.all(projects.map((p) => this.api.listThreads(p.id)));
      const threads = lists.flatMap((l) => l.items);
      threads.forEach((t) => this.threadDtos.set(t.id, t));
      this.set({
        status: "ready",
        orgId,
        projects: projects.map(presentWorkspaceProject),
        threads: threads.map(presentThreadSummary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      });
    } catch {
      this.set({ status: "error" });
    }
  }

  projectById(projectId: string | null | undefined): WorkspaceProjectView | null {
    if (!projectId) return null;
    return this.state.projects.find((p) => p.project.id === projectId) ?? null;
  }

  private upsertSummary(dto: Thread) {
    this.threadDtos.set(dto.id, dto);
    const view = presentThreadSummary(dto);
    this.set((s) => ({
      threads: [view, ...s.threads.filter((t) => t.id !== dto.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    }));
  }

  /**
   * Opens a thread: loads its history (lazily, on open) and reconciles its request state READ-ONLY
   * (`in_flight`, latest request, local unresolved records). Only the open thread polls.
   */
  async openThread(threadId: string): Promise<void> {
    if (this.openThreadId && this.openThreadId !== threadId) this.stopPolling(this.openThreadId);
    this.openThreadId = threadId;
    this.loads.get(threadId)?.abort();
    const ctrl = new AbortController();
    this.loads.set(threadId, ctrl);
    const signal = ctrl.signal;
    const known = this.state.details[threadId];
    if (!known || known.status !== "ready") this.setDetail(threadId, () => ({ status: "loading" }));
    try {
      const thread = await this.api.getThread(threadId, { signal });
      this.upsertSummary(thread);
      const page = await this.api.listThreadMessages(threadId, undefined, { signal });
      const messages = page.items.map(presentThreadMessage);
      this.setDetail(threadId, (d) => ({ status: "ready", messages: mergeMessages(d.messages, messages) }));
      const latestUser = [...page.items].reverse().find((m) => m.role === "user");
      const report = await this.coordinator.reconcileThread(thread, { latestMessageId: latestUser?.id ?? null, signal });
      if (signal.aborted) return;
      for (const outcome of report.recovered) this.applyOutcome(threadId, outcome);
      if (report.latest) this.applyResult(threadId, report.latest, { fromReconcile: true });
      else this.setRequest(threadId, {});
      if (report.fenced.length && !report.latest && !this.coordinator.isSubmitting(threadId)) {
        this.setRequest(threadId, { phase: "unknown", unknown: this.state.details[threadId]?.request.unknown ?? { reason: "status_unavailable", text: UNKNOWN_TEXT.status_unavailable } });
      }
    } catch (error) {
      if (signal.aborted) return;
      const err = toWebApiError(error);
      if (err?.status === 404 && err.code === "not_found") this.setDetail(threadId, () => ({ status: "not_found", messages: [] }));
      else this.setDetail(threadId, () => ({ status: "error" }));
    } finally {
      if (this.loads.get(threadId) === ctrl) this.loads.delete(threadId);
    }
  }

  /** Leaving a thread (or the page): stop waiting. The server request is NOT cancelled. */
  closeThread() {
    if (this.openThreadId) {
      this.stopPolling(this.openThreadId);
      this.loads.get(this.openThreadId)?.abort();
    }
    this.openThreadId = null;
  }

  /* ---------------- requests (all through RequestCoordinator) ---------------- */

  /**
   * Creates a Copilot thread in `projectId` (fixture project ids only) and submits the first request in it.
   * Returns the new thread id immediately after creation so the UI can navigate; the request continues.
   */
  async createThreadAndSubmit(options: { projectId: string; text: string; scenario?: SubmitScenario }): Promise<{ threadId: string } | { error: RequestErrorView }> {
    const text = options.text.trim();
    const project = this.projectById(options.projectId);
    if (!text || !project) return { error: { text: "Выберите проект из тестовых данных.", code: null, status: null, requestId: null, retryAfterSeconds: null, resetsAt: null } };
    if (!project.canSubmit) return { error: { text: "Недостаточно прав: роль наблюдателя не может отправлять запросы.", code: "forbidden", status: null, requestId: null, retryAfterSeconds: null, resetsAt: null } };
    if (this.state.creating) return { error: { text: GUARD_TEXT.submission_in_progress, code: null, status: null, requestId: null, retryAfterSeconds: null, resetsAt: null } };
    this.set({ creating: true, createError: null });
    let thread: Thread;
    try {
      thread = await this.api.createThread(options.projectId, { kind: "copilot", title: titleFromText(text) }, { idempotencyKey: this.newId() });
    } catch (error) {
      const err = toWebApiError(error);
      const view = err ? errorView(err) : { text: "Не удалось создать диалог.", code: null, status: null, requestId: null, retryAfterSeconds: null, resetsAt: null };
      this.set({ creating: false, createError: view });
      return { error: view };
    }
    this.upsertSummary(thread);
    this.setDetail(thread.id, () => ({ status: "ready", messages: [] }));
    this.set({ creating: false });
    void this.submit(thread.id, text, options.scenario);
    return { threadId: thread.id };
  }

  /** A normal new request (new key). Refused while the thread is fenced. */
  async submit(threadId: string, text: string, scenario?: SubmitScenario): Promise<void> {
    const message = text.trim();
    if (!message) return;
    const projectId = this.threadDtos.get(threadId)?.project_id;
    if (!this.canSubmitInProject(projectId)) {
      this.setRequest(threadId, { refusal: { reason: "not_permitted", text: "Недостаточно прав: роль наблюдателя не может отправлять запросы." } });
      return;
    }
    if (scenario) this.simulation?.setThreadScenario(threadId, scenario);
    await this.run(threadId, () => this.coordinator.submitNew(threadId, { message }, { projectId }));
  }

  /** Answers `NEEDS_INPUT`: same key, next revision, same message (coordinator enforces it). */
  async answerClarification(threadId: string, answer: { context?: BusinessContext; confirmStatementIds?: string[] }): Promise<void> {
    const previous = this.latest.get(threadId);
    if (!previous) return;
    const snapshotId = clarificationSnapshotId(previous);
    const confirmation =
      answer.confirmStatementIds?.length && snapshotId
        ? { snapshot_id: snapshotId, statement_ids: [...new Set(answer.confirmStatementIds)], confirmed: true as const, reference: "Подтверждаю: это описание нашего продукта" }
        : undefined;
    await this.run(threadId, () => this.coordinator.answerClarification(previous, { context: answer.context, confirmation }));
  }

  /** Only when the SERVER said `resubmit_same_key` for the latest request. Same key, identical payload. */
  async resubmitSameKey(threadId: string): Promise<void> {
    const previous = this.latest.get(threadId);
    if (!previous) return;
    await this.run(threadId, () => this.coordinator.resubmitSameKey(previous));
  }

  /**
   * Explicit, confirmed "start a new request" (NEW key) after `ambiguous`, `expired`, an unknown outcome or a
   * failure. The caller must pass the acknowledgement the user gave in the warning dialog. If the earlier request
   * is still running (overdue), the new request goes to a NEW thread of the same project (the server allows one
   * in-flight request per thread). Earlier keys stay stored as `superseded`.
   */
  async startNewRequest(
    threadId: string,
    input: { text?: string },
    ack: { acknowledgeMayRegenerate: true },
    scenario?: SubmitScenario,
  ): Promise<{ threadId: string } | null> {
    if (ack?.acknowledgeMayRegenerate !== true) return null;
    const latest = this.latest.get(threadId);
    // The original request: the server's accepted input, else the stored payload of the unconfirmed request.
    const original: SubmittedInput | null = this.latestFencedInput(threadId) ?? latest?.user_message.input ?? null;
    const message = (input.text ?? original?.message ?? "").trim();
    if (!message) return null;
    const payload: SubmittedInput = input.text ? { message } : { ...(original ? structuredClone(original) : {}), message };
    const projectId = this.threadDtos.get(threadId)?.project_id;
    if (!this.canSubmitInProject(projectId) || !projectId) return null;
    let target = threadId;
    if (latest && (latest.state === "running" || latest.state === "pending")) {
      const created = await this.api.createThread(projectId, { kind: "copilot", title: titleFromText(message) }, { idempotencyKey: this.newId() });
      this.upsertSummary(created);
      this.setDetail(created.id, () => ({ status: "ready", messages: [] }));
      target = created.id;
    }
    if (scenario) this.simulation?.setThreadScenario(target, scenario);
    await this.run(target, () => this.coordinator.startNewRequest(target, payload, ack, { projectId }));
    return { threadId: target };
  }

  /** "Check status": read-only recovery of every fenced key. Never sends, never mints a key. */
  async checkStatus(threadId: string): Promise<void> {
    const records = this.coordinator.unresolvedRequests(threadId);
    this.setRequest(threadId, { phase: "submitting", refusal: null });
    let last: RequestOutcome | null = null;
    for (const record of records) {
      last = await this.coordinator.recover(record);
      this.applyOutcome(threadId, last);
    }
    if (!last) {
      const latest = this.latest.get(threadId);
      if (latest) await this.resumeWaiting(threadId);
      else this.setRequest(threadId, { phase: "idle" });
    }
  }

  /** Stops waiting in this browser. Does not cancel, repeat or reclassify the request. */
  stopWaiting(threadId: string) {
    this.stopPolling(threadId);
    this.setRequest(threadId, { stoppedWaiting: true });
  }

  /** Resumes following the latest request by reading its status. */
  async resumeWaiting(threadId: string) {
    const latest = this.latest.get(threadId);
    if (!latest) return;
    this.setRequest(threadId, { stoppedWaiting: false });
    try {
      const result = await this.coordinator.inspect(latest.user_message.id);
      this.applyResult(threadId, result);
    } catch (error) {
      const err = toWebApiError(error);
      if (err) this.setRequest(threadId, { error: errorView(err) });
    }
  }

  /** Re-reads a stored result snapshot (`getMessageResult`). Read-only; failures become result states. */
  async openResult(threadId: string, messageId: string): Promise<void> {
    try {
      const snapshot = await this.api.getMessageResult(messageId);
      this.replaceResult(threadId, messageId, presentSnapshot(snapshot));
    } catch (error) {
      const err = toWebApiError(error);
      const view = err ? presentResultError(err) : null;
      if (view) this.replaceResult(threadId, messageId, view);
      else if (err) this.setRequest(threadId, { error: errorView(err) });
    }
  }

  /** Stops every poll and load (navigation away / unmount). Server requests keep running. */
  stopAll() {
    for (const id of [...this.polls.keys()]) this.stopPolling(id);
    for (const ctrl of this.loads.values()) ctrl.abort();
    this.loads.clear();
    this.openThreadId = null;
  }

  dispose() {
    this.stopAll();
    this.disposed = true;
    this.listeners.clear();
  }

  /** Whether a normal new request may be sent in this thread (UI enablement; the coordinator re-checks). */
  canStartNormalRequest(threadId: string): boolean {
    const detail = this.state.details[threadId];
    const projectId = this.threadDtos.get(threadId)?.project_id;
    if (!this.canSubmitInProject(projectId)) return false;
    if (this.coordinator.isSubmitting(threadId) || this.coordinator.unresolvedRequests(threadId).length) return false;
    const status = detail?.request.execution?.status;
    return !(status === "pending" || status === "running" || status === "running_overdue" || status === "ambiguous" || status === "expired");
  }

  /* ---------------- internals ---------------- */

  private canSubmitInProject(projectId: string | undefined): boolean {
    return !!projectId && !!this.projectById(projectId)?.canSubmit;
  }

  private async run(threadId: string, op: () => Promise<RequestOutcome>) {
    this.setRequest(threadId, { phase: "submitting", error: null, refusal: null, unknown: null, stoppedWaiting: false });
    try {
      this.applyOutcome(threadId, await op());
    } catch (error) {
      if (error instanceof LocalSubmitGuardError) {
        // A second click while the first is in flight must not erase the first one's progress.
        const phase = error.reason === "submission_in_progress" ? "submitting" : error.reason === "unresolved_request" ? this.fencedPhase(threadId) : "refused";
        this.setRequest(threadId, { phase, refusal: { reason: error.reason, text: GUARD_TEXT[error.reason] } });
      } else if (error instanceof PendingStoreError) {
        this.setRequest(threadId, { phase: "refused", refusal: { reason: "store_unavailable", text: STORE_TEXT } });
      } else if (error instanceof RecoveryNotPermittedError) {
        this.setRequest(threadId, { phase: "refused", refusal: { reason: "not_permitted", text: "Это действие сейчас недоступно для запроса." } });
      } else {
        const err = toWebApiError(error);
        this.setRequest(threadId, { phase: "rejected", error: err ? errorView(err) : null });
      }
    }
  }

  private fencedPhase(threadId: string): RequestPhase {
    const status = this.state.details[threadId]?.request.execution?.status;
    if (status === "ambiguous" || status === "expired") return "settled";
    return this.coordinator.unresolvedRequests(threadId).length ? "unknown" : "refused";
  }

  private applyOutcome(threadId: string, outcome: RequestOutcome) {
    if (outcome.kind === "state") {
      this.applyResult(threadId, outcome.result);
      return;
    }
    // A late answer about a request the user already replaced must not overwrite the newer request's state.
    if (outcome.record.status === "superseded") {
      this.setRequest(threadId, {});
      return;
    }
    if (outcome.kind === "unknown") {
      this.setRequest(threadId, {
        phase: "unknown",
        unknown: { reason: outcome.reason, text: UNKNOWN_TEXT[outcome.reason] },
        error: errorView(outcome.error),
      });
      return;
    }
    this.setRequest(threadId, { phase: "rejected", error: errorView(outcome.error) });
  }

  private applyResult(threadId: string, result: MessageResult, options: { fromReconcile?: boolean } = {}) {
    const items = [presentThreadMessage(result.user_message), ...(result.assistant_message ? [presentThreadMessage(result.assistant_message)] : [])];
    this.setDetail(threadId, (d) => ({ status: d.status === "loading" ? "ready" : d.status, messages: mergeMessages(d.messages, items) }));
    // Late reply about an earlier request: its messages go into the history, but it never becomes the thread's
    // current request state (no state overwrite, no polling, no in-flight change).
    if (isLateReply(this.latest.get(threadId), result)) {
      this.setRequest(threadId, {});
      return;
    }
    this.latest.set(threadId, result);
    const execution = presentExecution(result);
    const waiting = result.state === "pending" || result.state === "running";
    const fenced = this.coordinator.unresolvedRequests(threadId).filter((r) => r.requestKey !== result.user_message.request_key);
    this.setRequest(threadId, {
      phase: waiting ? "waiting" : fenced.length ? "unknown" : "settled",
      execution,
      ...(fenced.length ? {} : { unknown: null }),
      ...(options.fromReconcile ? {} : { error: null }),
    });
    const dto = this.threadDtos.get(threadId);
    if (dto) {
      this.upsertSummary({
        ...dto,
        // Never move a thread back in time (fixture timestamps are canned).
        updated_at: [dto.updated_at, result.assistant_message?.created_at ?? result.user_message.created_at].sort().at(-1)!,
        in_flight: waiting
          ? { message_id: result.user_message.id, request_key: result.user_message.request_key, revision: result.user_message.revision, state: result.state as "pending" | "running", started_at: result.user_message.created_at }
          : null,
      });
    }
    if (result.next_action === "poll" && threadId === this.openThreadId && !this.state.details[threadId]?.request.stoppedWaiting) {
      void this.startPolling(threadId, result.user_message.id);
    }
  }

  private async startPolling(threadId: string, messageId: string) {
    if (this.polls.has(threadId)) return; // never two loops for one thread
    const ctrl = new AbortController();
    this.polls.set(threadId, ctrl);
    this.setRequest(threadId, { polling: true });
    try {
      const final = await this.coordinator.poll(messageId, {
        signal: ctrl.signal,
        onUpdate: (r) => {
          if (!ctrl.signal.aborted && r.next_action !== "poll") return; // final state applied below
          if (!ctrl.signal.aborted) this.applyResultWithoutPolling(threadId, r);
        },
      });
      if (this.polls.get(threadId) === ctrl) this.polls.delete(threadId);
      this.setRequest(threadId, { polling: false });
      this.applyResult(threadId, final);
    } catch (error) {
      if (this.polls.get(threadId) === ctrl) this.polls.delete(threadId);
      this.setRequest(threadId, { polling: false });
      const err = toWebApiError(error);
      if (!ctrl.signal.aborted && err && err.kind !== "aborted") this.setRequest(threadId, { error: errorView(err) });
    }
  }

  private applyResultWithoutPolling(threadId: string, result: MessageResult) {
    const saved = this.openThreadId;
    this.openThreadId = null; // suppress re-entrant polling start
    try {
      this.applyResult(threadId, result);
    } finally {
      this.openThreadId = saved;
    }
  }

  private stopPolling(threadId: string) {
    const ctrl = this.polls.get(threadId);
    if (!ctrl) return;
    ctrl.abort();
    this.polls.delete(threadId);
    this.setRequest(threadId, { polling: false });
  }

  private replaceResult(threadId: string, messageId: string, view: Extract<ThreadMessageView, { role: "assistant" }>["result"]) {
    this.setDetail(threadId, (d) => ({
      messages: d.messages.map((m) => (m.role === "assistant" && m.id === messageId ? { ...m, result: view } : m)),
    }));
  }
}

function clarificationSnapshotId(result: MessageResult): string | null {
  const snapshot = result.assistant_message?.result;
  if (snapshot?.result_kind !== "NEEDS_INPUT") return null;
  return snapshot.presentation.payload.owned_site?.snapshot_id ?? null;
}

/** Merges server messages into the list by id (server wins), keeps `seq` order, marks superseded revisions. */
export function mergeMessages(current: ThreadMessageView[], incoming: ThreadMessageView[]): ThreadMessageView[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  const merged = [...byId.values()].sort((a, b) => a.seq - b.seq);
  const latestRevision = new Map<string, number>();
  for (const m of merged) if (m.role === "user") latestRevision.set(m.requestKey, Math.max(latestRevision.get(m.requestKey) ?? 0, m.revision));
  return merged.map((m) => (m.role === "user" && m.isLatestRevision && m.revision < (latestRevision.get(m.requestKey) ?? 0) ? { ...m, isLatestRevision: false } : m));
}

export function titleFromText(text: string, max = 56): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

/** App wiring: the fixture transport (only mode in F2) with the transient pending store of the public preview. */
export async function createAppWorkspaceController(api: WebApiV2): Promise<WorkspaceV2Controller> {
  const pendingStore = await selectPendingRequestStore({ principal: null });
  const simulation = isSimulation(api) ? api : null;
  return new WorkspaceV2Controller({ api, pendingStore, simulation });
}

function isSimulation(api: WebApiV2): api is WebApiV2 & WorkspaceV2Simulation {
  return api.transport === "fixture" && typeof (api as Partial<WorkspaceV2Simulation>).setThreadScenario === "function";
}
