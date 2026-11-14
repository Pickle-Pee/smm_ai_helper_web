import type { OperationId } from "@/lib/api/generated/web-api-v2.meta";
import type { WebApiV2 } from "./contract";
import { errorFromBody, WebApiError } from "./errors";
import { FIXTURE_IDS, fixtures } from "./fixtures";
import { isRequestKey } from "./request-key";
import type {
  AuthSession,
  CallOptions,
  CsrfToken,
  ErrorCode,
  ErrorResponse,
  Me,
  MessageResult,
  OrganizationList,
  Project,
  ProjectBrand,
  ProjectList,
  QueryOf,
  RequestKey,
  ResultSnapshot,
  SubmitMessageRequest,
  SubmitResponse,
  SubmittedInput,
  TelegramExchangeRequest,
  Thread,
  ThreadCreate,
  ThreadList,
  ThreadMessage,
  ThreadMessagesPage,
  UserRef,
} from "./types";

/**
 * Fixture-driven, in-memory implementation of Web API v2.
 *
 * It simulates the SERVER side of the contract (README §10) so client logic can be tested end to end:
 * idempotency by `(request_key, revision)`, `409` conflicts, one in-flight request per thread, `NEEDS_INPUT`
 * revisions, polling, the seven-day `resubmit_same_key` window, `ambiguous` only when "the core recorded it",
 * per-viewer `is_self`, tenant `404`s and snapshot read failures.
 *
 * It NEVER calls an AI model or the network. Every payload it returns is a copy of a file in
 * `docs/api/fixtures/` (re-bound to the ids of the simulated request). UI that shows these payloads must label
 * them «Пример из тестовых данных».
 */

/** How the simulated server answers the next NEW request (`submitMessage` with an unknown key). */
export type SubmitScenario =
  | "direct_result"
  | "module_result"
  | "needs_input"
  | "workflow"
  | "workflow_failed"
  | "workflow_blocked"
  | "ambiguous"
  | "running_overdue"
  | "unsupported"
  /** The server admitted and finished the request, but the response was lost as `503`. */
  | "unavailable_after_admission"
  /** `503` before anything was stored. Recovery by key finds nothing (`404`). */
  | "unavailable_before_admission"
  | "rate_limited"
  | "quota_exceeded";

/** Who is looking: the request author, or another member of the same organization with role `viewer`. */
export type FixtureViewer = "author" | "viewer_member";

export interface FixtureClientOptions {
  scenario?: SubmitScenario;
  viewer?: FixtureViewer;
  /**
   * SIMULATED SERVER clock (default: a fixed instant a few minutes after the fixture's pending request).
   * Used only by the simulated server for the seven-day window. Client code never reads it.
   */
  serverNow?: () => Date;
  /** `getMessage` reads that stay `running` before a workflow completes. */
  pollsUntilDone?: number;
  /** The next N recovery/poll reads (`getRequestByKey`, `getMessage`) answer `503 temporarily_unavailable`. */
  readOutages?: number;
  /** Overrides `created_at` of the seeded fresh `pending` request (golden case `pending-receipt-purged`). */
  pendingCreatedAt?: string;
}

/** Counters for tests: the mock has no AI, `simulatedCoreAdmissions` counts what a real core would admit. */
export interface FixtureStats {
  submitCalls: number;
  simulatedCoreAdmissions: number;
  recoveryReads: number;
  pollReads: number;
}

export const FIXTURE_SERVER_NOW = "2026-11-23T09:05:00Z";
const SAFE_PENDING_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
const VIEWER_MEMBER: UserRef = { id: 77, display_name: "Коллега (тестовые данные)", is_self: false };
const RESULT_SCENARIOS: Record<string, () => MessageResult> = {
  direct_result: fixtures.responses.messageDirect,
  module_result: fixtures.responses.messageModule,
  needs_input: fixtures.responses.messageNeedsInput,
  ambiguous: fixtures.responses.messageAmbiguous,
  unsupported: fixtures.responses.messageUnsupported,
  unavailable_after_admission: fixtures.responses.messageDirect,
};
const WORKFLOW_RESULTS: Record<string, () => MessageResult> = {
  workflow: fixtures.responses.messageStrategyCompleted,
  workflow_failed: fixtures.responses.messageRunFailed,
  workflow_blocked: fixtures.responses.messageRunBlocked,
};

interface RevisionRecord {
  revision: number;
  fingerprint: string;
  createdAt: string;
  scenario: SubmitScenario;
  result: MessageResult;
  pollReads: number;
}

interface RequestRecord {
  threadId: string;
  requestKey: RequestKey;
  revisions: RevisionRecord[];
  /** Seeded requests whose history is served from a fixture page instead of being rebuilt. */
  listed: boolean;
}

export class FixtureWebApiV2Client implements WebApiV2 {
  readonly transport = "fixture" as const;
  readonly stats: FixtureStats = { submitCalls: 0, simulatedCoreAdmissions: 0, recoveryReads: 0, pollReads: 0 };

  private scenario: SubmitScenario;
  private readonly viewer: FixtureViewer;
  private readonly serverNow: () => Date;
  private readonly pollsUntilDone: number;
  private readOutages: number;
  private idCounter = 0;
  private readonly projects = new Map<string, Project>();
  private readonly threads = new Map<string, Thread>();
  private readonly requests = new Map<string, RequestRecord>();
  private readonly messageIndex = new Map<string, { requestKey: string; revision: number }>();
  private readonly seededPages = new Map<string, ThreadMessagesPage>();
  private readonly damagedResults = new Map<string, ErrorCode>();
  private readonly createIdempotency = new Map<string, { threadId: string; fingerprint: string }>();

  constructor(options: FixtureClientOptions = {}) {
    this.scenario = options.scenario ?? "direct_result";
    this.viewer = options.viewer ?? "author";
    this.serverNow = options.serverNow ?? (() => new Date(FIXTURE_SERVER_NOW));
    this.pollsUntilDone = Math.max(1, options.pollsUntilDone ?? 2);
    this.readOutages = Math.max(0, options.readOutages ?? 0);
    this.seed(options.pendingCreatedAt);
  }

  /** Changes how the simulated server answers the next NEW request. */
  setScenario(scenario: SubmitScenario) {
    this.scenario = scenario;
  }

  /* ---------------- auth ---------------- */

  async exchangeTelegramLoginToken(body: TelegramExchangeRequest, options?: CallOptions): Promise<AuthSession> {
    await this.tick("exchangeTelegramLoginToken", options);
    if (body.token !== fixtures.requests.authExchange().token) throw this.error("exchangeTelegramLoginToken", 401, fixtures.errors.loginTokenInvalid());
    return this.project(fixtures.responses.authExchange());
  }

  async getCsrfToken(options?: CallOptions): Promise<CsrfToken> {
    await this.tick("getCsrfToken", options);
    return fixtures.responses.authCsrf();
  }

  async logout(options?: CallOptions): Promise<void> {
    await this.tick("logout", options);
  }

  async getMe(options?: CallOptions): Promise<Me> {
    await this.tick("getMe", options);
    const me = fixtures.responses.me();
    if (this.viewer === "viewer_member") {
      me.user = { ...me.user, id: VIEWER_MEMBER.id, display_name: VIEWER_MEMBER.display_name };
      me.memberships = me.memberships.map((m) => ({ ...m, role: "viewer" as const }));
      me.identities = [];
      me.features = { ...me.features, telegram_history: false };
    }
    return me;
  }

  /* ---------------- organizations, projects, brand ---------------- */

  async listOrganizations(options?: CallOptions): Promise<OrganizationList> {
    await this.tick("listOrganizations", options);
    const orgs = fixtures.responses.orgs();
    if (this.viewer === "viewer_member") orgs.items = orgs.items.map((m) => ({ ...m, role: "viewer" as const }));
    return orgs;
  }

  async listProjects(orgId: string, _query?: QueryOf<"listProjects">, options?: CallOptions): Promise<ProjectList> {
    await this.tick("listProjects", options);
    if (orgId !== FIXTURE_IDS.orgId) throw this.error("listProjects", 404, fixtures.errors.notFoundProject());
    const list = fixtures.responses.projectsList();
    list.items = [...this.projects.values()].map((p) => this.project(this.withRole(p)));
    return list;
  }

  async getProject(projectId: string, options?: CallOptions): Promise<Project> {
    await this.tick("getProject", options);
    const project = this.projects.get(projectId);
    if (!project) throw this.error("getProject", 404, fixtures.errors.notFoundProject());
    return this.project(this.withRole(project));
  }

  async getProjectBrand(projectId: string, options?: CallOptions): Promise<ProjectBrand> {
    await this.tick("getProjectBrand", options);
    const project = this.projects.get(projectId);
    if (!project) throw this.error("getProjectBrand", 404, fixtures.errors.notFoundProject());
    return this.project(project.brand);
  }

  /* ---------------- workspace ---------------- */

  async listThreads(projectId: string, _query?: QueryOf<"listThreads">, options?: CallOptions): Promise<ThreadList> {
    await this.tick("listThreads", options);
    if (!this.projects.has(projectId)) throw this.error("listThreads", 404, fixtures.errors.notFoundProject());
    const items = [...this.threads.values()]
      .filter((t) => t.project_id === projectId)
      .map((t) => this.threadDto(t.id))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));
    return { schema_version: "web_api.v2", items: items.map((t) => this.project(t)), next_cursor: null };
  }

  async createThread(projectId: string, body: ThreadCreate, options?: CallOptions & { idempotencyKey?: string }): Promise<Thread> {
    await this.tick("createThread", options);
    if (!this.projects.has(projectId)) throw this.error("createThread", 404, fixtures.errors.notFoundProject());
    if (this.viewer !== "author") throw this.error("createThread", 403, fixtures.errors.forbidden());
    if (body.kind !== "copilot") throw this.error("createThread", 403, fixtures.errors.featureDisabled());
    const fingerprint = canonicalJson(body);
    if (options?.idempotencyKey) {
      const prior = this.createIdempotency.get(options.idempotencyKey);
      if (prior && prior.fingerprint !== fingerprint) throw this.error("createThread", 409, syntheticError("idempotency_conflict"));
      if (prior) return this.project(this.threadDto(prior.threadId));
    }
    const now = this.serverNow().toISOString();
    const thread: Thread = {
      ...fixtures.responses.threadCreated(),
      id: this.mintId(),
      project_id: projectId,
      title: body.title ?? "Новый запрос",
      created_at: now,
      updated_at: now,
      last_seq: 0,
      in_flight: null,
    };
    this.threads.set(thread.id, thread);
    if (options?.idempotencyKey) this.createIdempotency.set(options.idempotencyKey, { threadId: thread.id, fingerprint });
    return this.project(this.threadDto(thread.id));
  }

  async getThread(threadId: string, options?: CallOptions): Promise<Thread> {
    await this.tick("getThread", options);
    if (!this.threads.has(threadId)) throw this.error("getThread", 404, fixtures.errors.notFoundThread());
    return this.project(this.threadDto(threadId));
  }

  async listThreadMessages(threadId: string, query?: QueryOf<"listThreadMessages">, options?: CallOptions): Promise<ThreadMessagesPage> {
    await this.tick("listThreadMessages", options);
    if (!this.threads.has(threadId)) throw this.error("listThreadMessages", 404, fixtures.errors.notFoundThread());
    const seeded = this.seededPages.get(threadId);
    const items: ThreadMessage[] = seeded ? structuredClone(seeded.items) : [];
    for (const record of this.requests.values()) {
      if (record.threadId !== threadId || !record.listed) continue;
      for (const rev of record.revisions) {
        const result = this.evaluate(record, rev);
        items.push(result.user_message);
        if (result.assistant_message) items.push(result.assistant_message);
      }
    }
    items.sort((a, b) => a.seq - b.seq);
    const after = query?.after_seq;
    const visible = after === undefined ? items : items.filter((m) => m.seq > after);
    return this.project({ schema_version: "web_api.v2", thread: this.threadDto(threadId), items: visible, prev_before_seq: null });
  }

  async submitMessage(threadId: string, body: SubmitMessageRequest, options?: CallOptions): Promise<SubmitResponse> {
    await this.tick("submitMessage", options);
    this.stats.submitCalls += 1;
    const thread = this.threads.get(threadId);
    if (!thread) throw this.error("submitMessage", 404, fixtures.errors.notFoundThread());
    if (this.viewer !== "author") throw this.error("submitMessage", 403, fixtures.errors.forbidden());
    if (thread.kind !== "copilot") throw this.error("submitMessage", 403, fixtures.errors.featureDisabled());
    if (!isRequestKey(body.request_key) || !Number.isInteger(body.revision) || body.revision < 1 || body.revision > 20 || !body.message?.trim()) {
      throw this.error("submitMessage", 422, fixtures.errors.invalidRequest());
    }
    // Limits are evaluated before anything is stored or admitted (README §9.1).
    if (this.scenario === "rate_limited") throw this.error("submitMessage", 429, fixtures.errors.rateLimited());
    if (this.scenario === "quota_exceeded") throw this.error("submitMessage", 429, fixtures.errors.quotaExceeded());

    const { request_key: requestKey, revision, ...input } = body;
    const fingerprint = canonicalJson(input);
    const existing = this.requests.get(requestKey);

    if (existing) {
      if (existing.threadId !== threadId) throw this.error("submitMessage", 409, fixtures.errors.requestConflict());
      const latest = existing.revisions[existing.revisions.length - 1];
      const rev = existing.revisions.find((r) => r.revision === revision);
      if (rev) {
        if (rev.fingerprint !== fingerprint) throw this.error("submitMessage", 409, fixtures.errors.requestConflict());
        const current = this.evaluate(existing, rev);
        // Safe re-admission: only a recent `pending` request whose receipt was verified absent (rechecked here).
        if (rev === latest && current.state === "pending" && current.next_action === "resubmit_same_key") {
          this.admit(existing, rev, rev.scenario);
        }
        return this.submitResponse(this.evaluate(existing, rev));
      }
      if (revision !== latest.revision + 1) throw this.error("submitMessage", 409, fixtures.errors.revisionConflict());
      const latestResult = this.evaluate(existing, latest);
      if (latestResult.state !== "needs_input" || latestResult.user_message.text !== input.message) {
        throw this.error("submitMessage", 409, fixtures.errors.revisionConflict());
      }
      if (this.inFlight(threadId)) throw this.error("submitMessage", 409, fixtures.errors.threadBusy());
      latestResult.user_message.is_latest_revision = false;
      const next = this.newRevision(existing, revision, fingerprint, input, "needs_input");
      next.result = this.rebind(fixtures.responses.messageClarificationCompleted(), existing, next, input);
      this.stats.simulatedCoreAdmissions += 1;
      return this.submitResponse(next.result);
    }

    if (revision !== 1) throw this.error("submitMessage", 409, fixtures.errors.revisionConflict());
    if (this.inFlight(threadId)) throw this.error("submitMessage", 409, fixtures.errors.threadBusy());
    if (this.scenario === "unavailable_before_admission") {
      throw this.error("submitMessage", 503, fixtures.errors.temporarilyUnavailable());
    }
    const record: RequestRecord = { threadId, requestKey, revisions: [], listed: true };
    this.requests.set(requestKey, record);
    const rev = this.newRevision(record, 1, fingerprint, input, this.scenario);
    this.admit(record, rev, this.scenario);
    if (this.scenario === "unavailable_after_admission") {
      throw this.error("submitMessage", 503, fixtures.errors.temporarilyUnavailable());
    }
    return this.submitResponse(rev.result);
  }

  async getRequestByKey(threadId: string, requestKey: RequestKey, options?: CallOptions): Promise<MessageResult> {
    await this.tick("getRequestByKey", options);
    this.stats.recoveryReads += 1;
    this.consumeOutage("getRequestByKey");
    const record = this.requests.get(requestKey);
    // Author only: another member's key is indistinguishable from an unknown key.
    if (!record || record.threadId !== threadId || this.viewer !== "author" || !this.threads.has(threadId)) {
      throw this.error("getRequestByKey", 404, fixtures.errors.notFoundRun());
    }
    const latest = record.revisions[record.revisions.length - 1];
    return this.project(this.advanceWorkflow(record, latest, false));
  }

  async getMessage(messageId: string, options?: CallOptions): Promise<MessageResult> {
    await this.tick("getMessage", options);
    this.stats.pollReads += 1;
    this.consumeOutage("getMessage");
    const ref = this.messageIndex.get(messageId);
    const record = ref && this.requests.get(ref.requestKey);
    const rev = record?.revisions.find((r) => r.revision === ref?.revision);
    if (!record || !rev) throw this.error("getMessage", 404, fixtures.errors.notFoundRun());
    return this.project(this.advanceWorkflow(record, rev, true));
  }

  async getMessageResult(messageId: string, options?: CallOptions): Promise<ResultSnapshot> {
    await this.tick("getMessageResult", options);
    const damaged = this.damagedResults.get(messageId);
    if (damaged === "result_format_unsupported") throw this.error("getMessageResult", 409, fixtures.errors.resultFormatUnsupported());
    if (damaged === "result_corrupted") throw this.error("getMessageResult", 503, fixtures.errors.resultCorrupted());
    if (damaged) throw this.error("getMessageResult", 503, syntheticError(damaged));
    const ref = this.messageIndex.get(messageId);
    const record = ref && this.requests.get(ref.requestKey);
    const rev = record?.revisions.find((r) => r.revision === ref?.revision);
    if (!record || !rev) throw this.error("getMessageResult", 404, fixtures.errors.notFoundRun());
    const result = this.evaluate(record, rev);
    if (result.state === "pending" || result.state === "running") throw this.error("getMessageResult", 409, syntheticError("result_not_ready"));
    if (!result.assistant_message?.result) throw this.error("getMessageResult", 410, fixtures.errors.resultGone());
    return this.project(result.assistant_message.result);
  }

  /* ---------------- simulated server internals ---------------- */

  private seed(pendingCreatedAt?: string) {
    for (const p of fixtures.responses.projectsList().items) this.projects.set(p.id, p);
    for (const t of fixtures.responses.threadsList().items) this.threads.set(t.id, t);

    // Histories served verbatim from fixture pages (durable snapshots; no receipt involved).
    for (const page of [
      fixtures.responses.threadMessagesReopen(),
      fixtures.responses.threadMessagesClarification(),
      fixtures.responses.threadMessagesFormatUnsupported(),
    ]) {
      this.seededPages.set(page.thread.id, page);
      if (!this.threads.has(page.thread.id)) this.threads.set(page.thread.id, page.thread);
    }
    for (const item of fixtures.responses.threadMessagesFormatUnsupported().items) {
      if (item.role === "assistant" && item.result_status === "format_unsupported") this.damagedResults.set(item.id, "result_format_unsupported");
    }
    this.damagedResults.set(FIXTURE_IDS.corruptedResultMessageId, "result_corrupted");
    this.damagedResults.set(FIXTURE_IDS.unreadableResultMessageId, "result_unreadable");

    // Requests reachable by key / message id. `listed: false` = their history comes from a page above.
    const seededRequests: [() => MessageResult, boolean, SubmitScenario][] = [
      [fixtures.responses.messageStrategyCompleted, false, "workflow"],
      [fixtures.responses.messageDirect, true, "direct_result"],
      [fixtures.responses.messageModule, true, "module_result"],
      [fixtures.responses.messageRunFailed, true, "workflow_failed"],
      [fixtures.responses.messageRunBlocked, true, "workflow_blocked"],
      [fixtures.responses.messageAmbiguous, true, "ambiguous"],
      [fixtures.responses.messageRunningOverdue, true, "running_overdue"],
      [fixtures.responses.messageExpired, true, "direct_result"],
      [fixtures.responses.messagePendingResubmit, true, "module_result"],
      [fixtures.responses.messageUnsupported, true, "unsupported"],
    ];
    for (const [load, listed, scenario] of seededRequests) {
      const result = load();
      if (result.state === "pending" && pendingCreatedAt) result.user_message.created_at = pendingCreatedAt;
      const um = result.user_message;
      const { message, ...rest } = um.input ?? { message: um.text };
      const record: RequestRecord = { threadId: result.thread_id, requestKey: um.request_key, revisions: [], listed };
      record.revisions.push({
        revision: um.revision,
        fingerprint: canonicalJson({ message, ...rest }),
        createdAt: um.created_at,
        scenario,
        result,
        pollReads: 0,
      });
      this.requests.set(um.request_key, record);
      this.index(result, um.request_key, um.revision);
      if (!this.threads.has(result.thread_id)) {
        this.threads.set(result.thread_id, {
          ...fixtures.responses.threadCreated(),
          id: result.thread_id,
          title: um.text.slice(0, 200),
          created_at: um.created_at,
          updated_at: result.assistant_message?.created_at ?? um.created_at,
          last_seq: result.assistant_message?.seq ?? um.seq,
          in_flight: null,
        });
      }
    }
  }

  private newRevision(record: RequestRecord, revision: number, fingerprint: string, input: SubmittedInput, scenario: SubmitScenario) {
    const rev: RevisionRecord = {
      revision,
      fingerprint,
      createdAt: this.serverNow().toISOString(),
      scenario,
      result: this.rebind(fixtures.responses.messagePendingResubmit(), record, { revision, createdAt: this.serverNow().toISOString() }, input),
      pollReads: 0,
    };
    // A stored-but-not-yet-admitted request is `pending`; `admit` replaces it.
    rev.result.next_action = "none";
    record.revisions.push(rev);
    return rev;
  }

  /** Simulated core admission. Counts what a real core would admit; never calls a model. */
  private admit(record: RequestRecord, rev: RevisionRecord, scenario: SubmitScenario) {
    this.stats.simulatedCoreAdmissions += 1;
    const input = rev.result.user_message.input ?? { message: rev.result.user_message.text };
    let template: MessageResult;
    if (scenario in WORKFLOW_RESULTS || scenario === "running_overdue") template = fixtures.responses.messageWorkflowStarted();
    else template = (RESULT_SCENARIOS[scenario] ?? fixtures.responses.messageDirect)();
    rev.result = this.rebind(template, record, rev, input);
  }

  /** Server view of a revision: applies the seven-day `pending` rule (never inferring `ambiguous`). */
  private evaluate(record: RequestRecord, rev: RevisionRecord): MessageResult {
    const result = rev.result;
    if (result.state === "pending") {
      const age = this.serverNow().getTime() - Date.parse(result.user_message.created_at);
      if (age >= 0 && age < SAFE_PENDING_RETRY_MS) {
        result.next_action = "resubmit_same_key";
      } else {
        // Window closed: prior execution cannot be ruled out. Never re-admitted, never regenerated.
        result.state = "expired";
        result.next_action = "start_new_request";
        result.user_message.state = "expired";
        result.user_message.state_reason = "recovery_window_elapsed";
      }
    }
    return result;
  }

  /** Polling progression of a running workflow. `running_overdue` stays running: age never means `ambiguous`. */
  private advanceWorkflow(record: RequestRecord, rev: RevisionRecord, countRead: boolean): MessageResult {
    const result = this.evaluate(record, rev);
    if (result.state !== "running") return result;
    if (rev.scenario === "running_overdue") {
      const overdue = this.rebind(fixtures.responses.messageRunningOverdue(), record, rev, result.user_message.input ?? { message: result.user_message.text });
      rev.result = overdue;
      return overdue;
    }
    const done = WORKFLOW_RESULTS[rev.scenario];
    if (!done) return result;
    if (countRead) rev.pollReads += 1;
    if (rev.pollReads < this.pollsUntilDone) {
      const running = this.rebind(fixtures.responses.messageWorkflowRunning(), record, rev, result.user_message.input ?? { message: result.user_message.text });
      rev.result = running;
      return running;
    }
    rev.result = this.rebind(done(), record, rev, result.user_message.input ?? { message: result.user_message.text });
    return rev.result;
  }

  /** Re-binds a fixture response to the simulated request: ids, key, revision, thread and accepted input. */
  private rebind(template: MessageResult, record: RequestRecord, rev: Pick<RevisionRecord, "revision" | "createdAt">, input: SubmittedInput): MessageResult {
    const thread = this.threads.get(record.threadId)!;
    const prior = record.revisions.find((r) => r.revision === rev.revision)?.result;
    const userId = prior?.user_message.id ?? this.mintId();
    const userSeq = prior?.user_message.seq ?? ++thread.last_seq;
    const result = structuredClone(template);
    result.thread_id = record.threadId;
    result.project_id = thread.project_id;
    result.user_message = {
      ...result.user_message,
      id: userId,
      thread_id: record.threadId,
      seq: userSeq,
      created_at: prior?.user_message.created_at ?? rev.createdAt,
      request_key: record.requestKey,
      revision: rev.revision,
      is_latest_revision: true,
      text: input.message,
      input: structuredClone(input),
    };
    if (result.assistant_message) {
      const assistantId = prior?.assistant_message?.id ?? this.mintId();
      const assistantSeq = prior?.assistant_message?.seq ?? ++thread.last_seq;
      result.assistant_message = {
        ...result.assistant_message,
        id: assistantId,
        thread_id: record.threadId,
        seq: assistantSeq,
        reply_to: userId,
        request_key: record.requestKey,
        revision: rev.revision,
      };
      const snapshot = result.assistant_message.result;
      if (snapshot) {
        snapshot.message_id = assistantId;
        snapshot.provenance = { ...snapshot.provenance, request_key: record.requestKey, revision: rev.revision };
      }
    }
    thread.updated_at = result.assistant_message?.created_at ?? result.user_message.created_at;
    this.index(result, record.requestKey, rev.revision);
    return result;
  }

  private index(result: MessageResult, requestKey: string, revision: number) {
    this.messageIndex.set(result.user_message.id, { requestKey, revision });
    if (result.assistant_message) this.messageIndex.set(result.assistant_message.id, { requestKey, revision });
  }

  private inFlight(threadId: string): RevisionRecord | null {
    for (const record of this.requests.values()) {
      if (record.threadId !== threadId) continue;
      const latest = record.revisions[record.revisions.length - 1];
      const state = this.evaluate(record, latest).state;
      if (state === "pending" || state === "running") return latest;
    }
    return null;
  }

  private threadDto(threadId: string): Thread {
    const base = structuredClone(this.threads.get(threadId)!);
    const busy = this.inFlight(threadId);
    base.in_flight = busy
      ? {
          message_id: busy.result.user_message.id,
          request_key: busy.result.user_message.request_key,
          revision: busy.revision,
          state: busy.result.state === "pending" ? "pending" : "running",
          started_at: busy.result.user_message.created_at,
        }
      : null;
    base.permissions = { can_submit: this.viewer === "author" && !busy, can_remove: this.viewer === "author" };
    return base;
  }

  private withRole(project: Project): Project {
    if (this.viewer === "author") return project;
    return { ...project, role: "viewer", permissions: { can_edit: false, can_submit: false, can_import_telegram_brand: false } };
  }

  private submitResponse(result: MessageResult): SubmitResponse {
    return { httpStatus: result.state === "running" ? 202 : 200, result: this.project(result) };
  }

  /**
   * Per-viewer projection (README §11.1): every `UserRef.is_self` is computed for the caller; author-only
   * next actions become `wait_for_author` for other members. Stored data is never modified.
   */
  private project<T>(value: T): T {
    const viewerId = this.viewer === "author" ? FIXTURE_IDS.authorUserId : VIEWER_MEMBER.id;
    const copy = structuredClone(value);
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      const obj = node as Record<string, unknown>;
      if (typeof obj.id === "number" && "is_self" in obj && "display_name" in obj) obj.is_self = obj.id === viewerId;
      if (this.viewer !== "author" && (obj.next_action === "resubmit_same_key" || obj.next_action === "answer_clarification")) {
        obj.next_action = "wait_for_author";
      }
      Object.values(obj).forEach(walk);
    };
    walk(copy);
    return copy;
  }

  private consumeOutage(operation: OperationId) {
    if (this.readOutages > 0) {
      this.readOutages -= 1;
      throw this.error(operation, 503, fixtures.errors.temporarilyUnavailable());
    }
  }

  private async tick(operation: OperationId, options?: CallOptions) {
    await Promise.resolve();
    if (options?.signal?.aborted) throw new WebApiError({ kind: "aborted", operation, status: null, code: null });
  }

  private error(operation: OperationId, status: number, body: ErrorResponse) {
    return errorFromBody(operation, status, body);
  }

  private mintId(): string {
    this.idCounter += 1;
    return `00000000-0000-4000-8000-${this.idCounter.toString(16).padStart(12, "0")}`;
  }
}

/** Error bodies for codes the fixture set has no file for. Same envelope, clearly synthetic request id. */
function syntheticError(code: ErrorCode): ErrorResponse {
  return { schema_version: "web_api.v2", kind: "ERROR", code, request_id: `req_fixture_mock_${code}`.slice(0, 64) };
}

/** Canonical JSON (sorted keys) used as the simulated server's payload fingerprint. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
