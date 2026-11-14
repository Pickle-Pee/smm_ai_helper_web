/**
 * Contract metadata for Brenvio Web API v2 (version, error catalog, operation table).
 * GENERATED FILE - DO NOT EDIT. Regenerate with `npm run generate:api`; CI runs `npm run check:api`.
 * Source: docs/api/web-api-v2.openapi.yaml (info.version 2.0.0-draft.3, sha256 10c569f9adf2d08064842e0dfde22d8d1ccf4cb4e190b91abf75c09c9d6e1a1b).
 * Generator: openapi-typescript 7.13.0.
 */

export const WEB_API_V2_CONTRACT = {
  version: "2.0.0-draft.3",
  status: "proposed",
  responseSchemaVersion: "web_api.v2",
  specSha256: "10c569f9adf2d08064842e0dfde22d8d1ccf4cb4e190b91abf75c09c9d6e1a1b",
  /** Public same-origin prefix the browser uses (servers[0].url). Paths below are native FastAPI paths. */
  publicBasePath: "/api",
} as const;

/** Projection of the root `x-error-catalog`: HTTP status and retry policy per error code. */
export const ERROR_CATALOG = {
  unauthenticated: { status: 401, retry: "reauthenticate" },
  login_token_invalid: { status: 401, retry: "never" },
  csrf_failed: { status: 403, retry: "same_request" },
  forbidden: { status: 403, retry: "never" },
  feature_disabled: { status: 403, retry: "never" },
  not_found: { status: 404, retry: "never" },
  mentor_explanation_missing: { status: 404, retry: "never" },
  request_conflict: { status: 409, retry: "never" },
  revision_conflict: { status: 409, retry: "never" },
  thread_busy: { status: 409, retry: "after_delay" },
  stale_thread: { status: 409, retry: "never" },
  stale_project: { status: 409, retry: "never" },
  idempotency_conflict: { status: 409, retry: "never" },
  confirmation_changed: { status: 409, retry: "never" },
  confirmation_unavailable: { status: 409, retry: "never" },
  telegram_identity_required: { status: 409, retry: "never" },
  import_source_missing: { status: 409, retry: "never" },
  mentor_not_applicable: { status: 409, retry: "never" },
  result_not_ready: { status: 409, retry: "after_delay" },
  result_format_unsupported: { status: 409, retry: "never" },
  result_gone: { status: 410, retry: "explicit_new_key" },
  payload_too_large: { status: 413, retry: "never" },
  invalid_request: { status: 422, retry: "never" },
  invalid_confirmation: { status: 422, retry: "never" },
  rate_limited: { status: 429, retry: "after_delay" },
  quota_exceeded: { status: 429, retry: "after_reset" },
  temporarily_unavailable: { status: 503, retry: "after_delay" },
  result_corrupted: { status: 503, retry: "never" },
  result_unreadable: { status: 503, retry: "after_delay" },
} as const;

/** Every operation of the contract: method, native path, contract status and whether it is an unsafe method. */
export const OPERATIONS = {
  exchangeTelegramLoginToken: { method: "POST", path: "/v2/auth/telegram/exchange", status: "proposed", unsafe: true },
  getCsrfToken: { method: "GET", path: "/v2/auth/csrf", status: "proposed", unsafe: false },
  logout: { method: "POST", path: "/v2/auth/logout", status: "proposed", unsafe: true },
  getMe: { method: "GET", path: "/v2/me", status: "proposed", unsafe: false },
  listTelegramHistory: { method: "GET", path: "/v2/me/telegram-history", status: "proposed", unsafe: false },
  getTelegramHistoryItem: { method: "GET", path: "/v2/me/telegram-history/{public_id}", status: "deferred", unsafe: false },
  listOrganizations: { method: "GET", path: "/v2/orgs", status: "proposed", unsafe: false },
  listProjects: { method: "GET", path: "/v2/orgs/{org_id}/projects", status: "proposed", unsafe: false },
  createProject: { method: "POST", path: "/v2/orgs/{org_id}/projects", status: "proposed", unsafe: true },
  getProject: { method: "GET", path: "/v2/projects/{project_id}", status: "proposed", unsafe: false },
  updateProject: { method: "PATCH", path: "/v2/projects/{project_id}", status: "proposed", unsafe: true },
  getProjectBrand: { method: "GET", path: "/v2/projects/{project_id}/brand", status: "proposed", unsafe: false },
  updateProjectBrand: { method: "PATCH", path: "/v2/projects/{project_id}/brand", status: "proposed", unsafe: true },
  importTelegramBrand: { method: "POST", path: "/v2/projects/{project_id}/brand/import-telegram", status: "proposed", unsafe: true },
  listThreads: { method: "GET", path: "/v2/projects/{project_id}/threads", status: "proposed", unsafe: false },
  createThread: { method: "POST", path: "/v2/projects/{project_id}/threads", status: "proposed", unsafe: true },
  getThread: { method: "GET", path: "/v2/threads/{thread_id}", status: "proposed", unsafe: false },
  removeThread: { method: "DELETE", path: "/v2/threads/{thread_id}", status: "proposed", unsafe: true },
  listThreadMessages: { method: "GET", path: "/v2/threads/{thread_id}/messages", status: "proposed", unsafe: false },
  submitMessage: { method: "POST", path: "/v2/threads/{thread_id}/messages", status: "proposed", unsafe: true },
  getRequestByKey: { method: "GET", path: "/v2/threads/{thread_id}/requests/{request_key}", status: "proposed", unsafe: false },
  getMessage: { method: "GET", path: "/v2/messages/{message_id}", status: "proposed", unsafe: false },
  getMessageResult: { method: "GET", path: "/v2/messages/{message_id}/result", status: "proposed", unsafe: false },
  getMentorExplanation: { method: "GET", path: "/v2/messages/{message_id}/mentor", status: "proposed", unsafe: false },
  createMentorExplanation: { method: "POST", path: "/v2/messages/{message_id}/mentor", status: "proposed", unsafe: true },
  listMentorQuestions: { method: "GET", path: "/v2/messages/{message_id}/mentor/questions", status: "proposed", unsafe: false },
  askMentorQuestion: { method: "POST", path: "/v2/messages/{message_id}/mentor/questions", status: "proposed", unsafe: true },
  submitChatMessage: { method: "POST", path: "/v2/threads/{thread_id}/chat-messages", status: "future", unsafe: true },
} as const;

export type ErrorRetryPolicy = (typeof ERROR_CATALOG)[keyof typeof ERROR_CATALOG]["retry"];
export type OperationId = keyof typeof OPERATIONS;
