import type {
  AuthSession,
  CallOptions,
  CsrfToken,
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
  TelegramExchangeRequest,
  Thread,
  ThreadCreate,
  ThreadList,
  ThreadMessagesPage,
} from "./types";

/**
 * The Web API v2 operations the frontend uses in F1, implemented by two transports:
 *
 * - `FixtureWebApiV2Client` (`transport: "fixture"`): in-memory, deterministic, built from
 *   `docs/api/fixtures/`. The ONLY transport the app can select in F1.
 * - `WebApiV2Client` (`transport: "http"`): same-origin `/api/v2/*`. Tested with an injected fake `fetch`;
 *   not wired into the app (see `lib/api/v2/mode.ts`).
 *
 * Not in this interface (left unconnected on purpose, see docs/api-client.md): project/brand writes,
 * Telegram brand import, thread removal, mentor, Telegram history and the FUTURE web chat.
 */
export interface WebApiV2 {
  readonly transport: "fixture" | "http";

  /* auth */
  exchangeTelegramLoginToken(body: TelegramExchangeRequest, options?: CallOptions): Promise<AuthSession>;
  getCsrfToken(options?: CallOptions): Promise<CsrfToken>;
  logout(options?: CallOptions): Promise<void>;
  getMe(options?: CallOptions): Promise<Me>;

  /* organizations, projects, brand (read) */
  listOrganizations(options?: CallOptions): Promise<OrganizationList>;
  listProjects(orgId: string, query?: QueryOf<"listProjects">, options?: CallOptions): Promise<ProjectList>;
  getProject(projectId: string, options?: CallOptions): Promise<Project>;
  getProjectBrand(projectId: string, options?: CallOptions): Promise<ProjectBrand>;

  /* workspace */
  listThreads(projectId: string, query?: QueryOf<"listThreads">, options?: CallOptions): Promise<ThreadList>;
  createThread(projectId: string, body: ThreadCreate, options?: CallOptions & { idempotencyKey?: string }): Promise<Thread>;
  getThread(threadId: string, options?: CallOptions): Promise<Thread>;
  listThreadMessages(threadId: string, query?: QueryOf<"listThreadMessages">, options?: CallOptions): Promise<ThreadMessagesPage>;
  /** The only operation that can start AI work. Never retried automatically by any caller. */
  submitMessage(threadId: string, body: SubmitMessageRequest, options?: CallOptions): Promise<SubmitResponse>;
  /** Read-only recovery by client key (author only). Never generates, never mints a key. */
  getRequestByKey(threadId: string, requestKey: RequestKey, options?: CallOptions): Promise<MessageResult>;
  /** Polling endpoint; read-only towards the core. */
  getMessage(messageId: string, options?: CallOptions): Promise<MessageResult>;
  getMessageResult(messageId: string, options?: CallOptions): Promise<ResultSnapshot>;
}
