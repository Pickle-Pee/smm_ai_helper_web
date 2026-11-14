import { OPERATIONS, WEB_API_V2_CONTRACT, type OperationId } from "@/lib/api/generated/web-api-v2.meta";
import type { WebApiV2 } from "./contract";
import { codeForEdgeStatus, isErrorResponse, parseRetryAfter, WebApiError, type WebApiErrorKind } from "./errors";
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
 * HTTP transport for Brenvio Web API v2.
 *
 * NOT CONNECTED IN F1. Nothing in the app constructs this class (`lib/api/v2/mode.ts` only returns the fixture
 * transport, and a test fails if app code imports this module). It is exercised exclusively with an injected
 * fake `fetch`. Enabling it is a separate, reviewed step (docs/api-client.md, "Switching HTTP on").
 *
 * Security properties (all covered by tests):
 * - same-origin only: the base path must be a path (`/api`), never an absolute or protocol-relative URL;
 * - `credentials: "same-origin"`, `cache: "no-store"`, `redirect: "error"`, `mode: "same-origin"`;
 * - identity is the HttpOnly session cookie set by the server; the client never reads or writes cookies;
 * - `X-CSRF-Token` (kept in memory only) on every unsafe method once a session exists;
 * - no `Authorization`, bot token or `X-Telegram-User-ID` header can ever be sent;
 * - `submitMessage` is never retried, except the single same-request repeat after `403 csrf_failed`, which the
 *   contract marks as rejected before anything was stored or admitted.
 */

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface WebApiV2ClientOptions {
  /** Injected `fetch`. Required: there is no implicit global so tests and future wiring are explicit. */
  fetch: FetchLike;
  /** Same-origin public prefix. Defaults to `servers[0].url` of the contract (`/api`). */
  basePath?: string;
  /** Timeout for reads and ordinary writes. */
  timeoutMs?: number;
  /**
   * Timeout for `submitMessage`. DIRECT and single-module results are computed inside the request, bounded by
   * the backend `GRAPH_TIMEOUT_SECONDS` (300 s); the edge route allows 330 s (README §3).
   */
  submitTimeoutMs?: number;
  /** Called after any `401`. The app decides what "sign in again" means; the client only drops its CSRF token. */
  onUnauthenticated?: () => void;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_SUBMIT_TIMEOUT_MS = 330_000;

/** Headers a browser must never send to /v2 (AGENTS.md, README §4). Checked on every request. */
const FORBIDDEN_HEADERS = ["authorization", "x-telegram-user-id", "x-bot-token", "x-bot-backend-token", "cookie"];

type QueryValue = string | number | boolean | null | undefined;

interface CallSpec {
  path?: Record<string, string>;
  query?: Record<string, QueryValue>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** `empty` for 204 operations. */
  expect?: "json" | "empty";
  /**
   * Shape check of a 2xx JSON body. `web_api` (default): an object whose required `schema_version` is
   * `web_api.v2`. `snapshot`: a `ResultSnapshot` object (`envelope_version: 1` + string `result_kind`; it has no
   * top-level `schema_version`). Not a full schema validation: it rejects bodies that are not /v2 envelopes.
   */
  envelope?: "web_api" | "snapshot";
  /** Retry once after `403 csrf_failed` (contract retry policy `same_request`). */
  csrfRetry?: boolean;
}

interface CallResult<T> {
  status: number;
  data: T;
}

export function assertSameOriginBasePath(basePath: string): string {
  if (!/^\/(?!\/)[A-Za-z0-9._~\-/]*$/.test(basePath) || basePath.includes("..")) {
    throw new Error(`Web API v2 base path must be a same-origin path like "/api", got "${basePath}"`);
  }
  return basePath.replace(/\/+$/, "");
}

export class WebApiV2Client implements WebApiV2 {
  readonly transport = "http" as const;
  private readonly fetchImpl: FetchLike;
  private readonly basePath: string;
  private readonly timeoutMs: number;
  private readonly submitTimeoutMs: number;
  private readonly onUnauthenticated?: () => void;
  /** Session-bound CSRF token. Memory only: never persisted, never logged. */
  private csrfToken: string | null = null;
  private csrfInFlight: Promise<string> | null = null;

  constructor(options: WebApiV2ClientOptions) {
    if (typeof options?.fetch !== "function") throw new Error("WebApiV2Client requires an injected fetch");
    this.fetchImpl = options.fetch;
    this.basePath = assertSameOriginBasePath(options.basePath ?? WEB_API_V2_CONTRACT.publicBasePath);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.submitTimeoutMs = options.submitTimeoutMs ?? DEFAULT_SUBMIT_TIMEOUT_MS;
    this.onUnauthenticated = options.onUnauthenticated;
  }

  /* ---------------- auth ---------------- */

  async exchangeTelegramLoginToken(body: TelegramExchangeRequest, options?: CallOptions): Promise<AuthSession> {
    // No session yet, therefore no CSRF token; the server checks Origin / Sec-Fetch-Site instead.
    const { data } = await this.call<AuthSession>("exchangeTelegramLoginToken", { body, signal: options?.signal });
    this.csrfToken = data.csrf_token;
    return data;
  }

  async getCsrfToken(options?: CallOptions): Promise<CsrfToken> {
    const { data } = await this.call<CsrfToken>("getCsrfToken", { signal: options?.signal });
    this.csrfToken = data.csrf_token;
    return data;
  }

  async logout(options?: CallOptions): Promise<void> {
    try {
      await this.call<void>("logout", { signal: options?.signal, expect: "empty" });
    } finally {
      this.csrfToken = null;
    }
  }

  async getMe(options?: CallOptions): Promise<Me> {
    return (await this.call<Me>("getMe", { signal: options?.signal })).data;
  }

  /* ---------------- organizations, projects, brand ---------------- */

  async listOrganizations(options?: CallOptions): Promise<OrganizationList> {
    return (await this.call<OrganizationList>("listOrganizations", { signal: options?.signal })).data;
  }

  async listProjects(orgId: string, query?: QueryOf<"listProjects">, options?: CallOptions): Promise<ProjectList> {
    return (await this.call<ProjectList>("listProjects", { path: { org_id: orgId }, query, signal: options?.signal })).data;
  }

  async getProject(projectId: string, options?: CallOptions): Promise<Project> {
    return (await this.call<Project>("getProject", { path: { project_id: projectId }, signal: options?.signal })).data;
  }

  async getProjectBrand(projectId: string, options?: CallOptions): Promise<ProjectBrand> {
    return (await this.call<ProjectBrand>("getProjectBrand", { path: { project_id: projectId }, signal: options?.signal })).data;
  }

  /* ---------------- workspace ---------------- */

  async listThreads(projectId: string, query?: QueryOf<"listThreads">, options?: CallOptions): Promise<ThreadList> {
    return (await this.call<ThreadList>("listThreads", { path: { project_id: projectId }, query, signal: options?.signal })).data;
  }

  async createThread(projectId: string, body: ThreadCreate, options?: CallOptions & { idempotencyKey?: string }): Promise<Thread> {
    const headers = options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined;
    return (await this.call<Thread>("createThread", { path: { project_id: projectId }, body, headers, signal: options?.signal })).data;
  }

  async getThread(threadId: string, options?: CallOptions): Promise<Thread> {
    return (await this.call<Thread>("getThread", { path: { thread_id: threadId }, signal: options?.signal })).data;
  }

  async listThreadMessages(threadId: string, query?: QueryOf<"listThreadMessages">, options?: CallOptions): Promise<ThreadMessagesPage> {
    return (await this.call<ThreadMessagesPage>("listThreadMessages", { path: { thread_id: threadId }, query, signal: options?.signal })).data;
  }

  async submitMessage(threadId: string, body: SubmitMessageRequest, options?: CallOptions): Promise<SubmitResponse> {
    const { status, data } = await this.call<MessageResult>("submitMessage", {
      path: { thread_id: threadId },
      body,
      signal: options?.signal,
      timeoutMs: this.submitTimeoutMs,
    });
    if (status !== 200 && status !== 202) {
      throw new WebApiError({ kind: "invalid_response", operation: "submitMessage", status, code: null });
    }
    return { httpStatus: status, result: data };
  }

  async getRequestByKey(threadId: string, requestKey: RequestKey, options?: CallOptions): Promise<MessageResult> {
    return (
      await this.call<MessageResult>("getRequestByKey", {
        path: { thread_id: threadId, request_key: requestKey },
        signal: options?.signal,
      })
    ).data;
  }

  async getMessage(messageId: string, options?: CallOptions): Promise<MessageResult> {
    return (await this.call<MessageResult>("getMessage", { path: { message_id: messageId }, signal: options?.signal })).data;
  }

  async getMessageResult(messageId: string, options?: CallOptions): Promise<ResultSnapshot> {
    return (await this.call<ResultSnapshot>("getMessageResult", { path: { message_id: messageId }, signal: options?.signal, envelope: "snapshot" })).data;
  }

  /* ---------------- transport ---------------- */

  private async ensureCsrfToken(signal?: AbortSignal): Promise<string> {
    if (this.csrfToken) return this.csrfToken;
    if (!this.csrfInFlight) {
      this.csrfInFlight = this.getCsrfToken({ signal })
        .then((t) => t.csrf_token)
        .finally(() => {
          this.csrfInFlight = null;
        });
    }
    return this.csrfInFlight;
  }

  private buildUrl(operation: OperationId, spec: CallSpec): string {
    const template: string = OPERATIONS[operation].path;
    const path = template.replace(/\{([a-z_]+)\}/g, (_, name: string) => {
      const value = spec.path?.[name];
      if (value === undefined || value === "") throw new Error(`Missing path parameter "${name}" for ${operation}`);
      return encodeURIComponent(value);
    });
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(spec.query ?? {})) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    const query = qs.toString();
    return `${this.basePath}${path}${query ? `?${query}` : ""}`;
  }

  private async call<T>(operation: OperationId, spec: CallSpec): Promise<CallResult<T>> {
    const op = OPERATIONS[operation];
    const headers: Record<string, string> = { Accept: "application/json", ...spec.headers };
    if (spec.body !== undefined) headers["Content-Type"] = "application/json";

    if (op.unsafe && operation !== "exchangeTelegramLoginToken") {
      if (operation === "logout") {
        // Logout is idempotent and valid without a session; use a token only when we have one.
        if (this.csrfToken) headers["X-CSRF-Token"] = this.csrfToken;
      } else {
        headers["X-CSRF-Token"] = await this.ensureCsrfToken(spec.signal);
      }
    }
    assertNoForbiddenHeaders(headers);

    try {
      return await this.send<T>(operation, spec, headers);
    } catch (error) {
      if (
        error instanceof WebApiError &&
        error.code === "csrf_failed" &&
        op.unsafe &&
        spec.csrfRetry !== false &&
        operation !== "exchangeTelegramLoginToken"
      ) {
        // Rejected before anything was stored or admitted: fetch a fresh token and repeat ONCE.
        this.csrfToken = null;
        const token = await this.ensureCsrfToken(spec.signal);
        return this.send<T>(operation, { ...spec, csrfRetry: false }, { ...headers, "X-CSRF-Token": token });
      }
      throw error;
    }
  }

  private async send<T>(operation: OperationId, spec: CallSpec, headers: Record<string, string>): Promise<CallResult<T>> {
    const op = OPERATIONS[operation];
    const url = this.buildUrl(operation, spec);
    const timeoutMs = spec.timeoutMs ?? this.timeoutMs;
    // Cancelled before sending: nothing leaves the browser.
    if (spec.signal?.aborted) throw new WebApiError({ kind: "aborted", operation, status: null, code: null });

    const controller = new AbortController();
    let cause: "timeout" | "caller" | null = null;
    const onCallerAbort = () => {
      cause = "caller";
      controller.abort(spec.signal?.reason);
    };
    if (spec.signal?.aborted) onCallerAbort();
    else spec.signal?.addEventListener("abort", onCallerAbort, { once: true });
    const timer = setTimeout(() => {
      cause = cause ?? "timeout";
      controller.abort(new Error("timeout"));
    }, timeoutMs);

    const fail = (kind: WebApiErrorKind, extra: Partial<ConstructorParameters<typeof WebApiError>[0]> = {}) =>
      new WebApiError({ kind, operation, status: null, code: null, ...extra });

    try {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: op.method,
          headers,
          body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
          credentials: "same-origin",
          mode: "same-origin",
          cache: "no-store",
          redirect: "error",
          signal: controller.signal,
        });
      } catch (error) {
        if (cause === "caller") throw fail("aborted", { cause: error });
        if (cause === "timeout") throw fail("timeout", { cause: error });
        throw fail("network", { cause: error });
      }

      let text: string;
      try {
        text = await response.text();
      } catch (error) {
        if (cause === "caller") throw fail("aborted", { status: response.status, cause: error });
        if (cause === "timeout") throw fail("timeout", { status: response.status, cause: error });
        throw fail("network", { status: response.status, cause: error });
      }

      const headerRequestId = response.headers.get("x-request-id");
      const headerRetryAfter = parseRetryAfter(response.headers.get("retry-after"));
      const parsed = parseJson(text, response.headers.get("content-type"));

      if (response.ok) {
        if (spec.expect === "empty") return { status: response.status, data: undefined as T };
        if (!parsed.ok || !isEnvelope(parsed.value, spec.envelope ?? "web_api")) {
          throw fail("invalid_response", { status: response.status, requestId: headerRequestId });
        }
        return { status: response.status, data: parsed.value as T };
      }

      if (response.status === 401) {
        this.csrfToken = null;
        this.onUnauthenticated?.();
      }

      if (parsed.ok && isErrorResponse(parsed.value)) {
        const body = parsed.value;
        throw new WebApiError({
          kind: "http",
          operation,
          status: response.status,
          code: body.code,
          requestId: body.request_id ?? headerRequestId,
          retryAfterSeconds: body.retry_after_seconds ?? headerRetryAfter,
          quota: body.quota ?? null,
        });
      }

      // Not a /v2 error body: reverse proxy page, empty 502/504, or foreign JSON. Classified by status only.
      throw new WebApiError({
        kind: "edge",
        operation,
        status: response.status,
        code: codeForEdgeStatus(response.status),
        requestId: headerRequestId,
        retryAfterSeconds: headerRetryAfter,
      });
    } finally {
      clearTimeout(timer);
      spec.signal?.removeEventListener("abort", onCallerAbort);
    }
  }
}

/** Minimal envelope check for 2xx bodies: a plain object of the expected /v2 envelope, never an array. */
export function isEnvelope(value: unknown, kind: "web_api" | "snapshot"): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  if (kind === "snapshot") return obj.envelope_version === 1 && typeof obj.result_kind === "string" && !("schema_version" in obj);
  return obj.schema_version === WEB_API_V2_CONTRACT.responseSchemaVersion;
}

function parseJson(text: string, contentType: string | null): { ok: true; value: unknown } | { ok: false } {
  if (!text) return { ok: false };
  const looksJson = contentType?.toLowerCase().includes("json") ?? false;
  if (!looksJson) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function assertNoForbiddenHeaders(headers: Record<string, string>) {
  for (const name of Object.keys(headers)) {
    if (FORBIDDEN_HEADERS.includes(name.toLowerCase())) {
      throw new Error(`Header "${name}" must never be sent from the browser to Web API v2`);
    }
  }
}
