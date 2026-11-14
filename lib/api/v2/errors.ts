import { ERROR_CATALOG, type ErrorRetryPolicy, type OperationId } from "@/lib/api/generated/web-api-v2.meta";
import type { ErrorCode, ErrorResponse, QuotaInfo } from "./types";

/**
 * How an API call failed. One error type for both transports (HTTP and fixture), so recovery logic is
 * written once and tested against the fake transport.
 *
 * - `http`     a contract `ErrorResponse` (JSON, `kind: "ERROR"`, known `code`).
 * - `edge`     the reverse proxy (or anything that is not the /v2 app) answered: HTML/empty 502/504, non-JSON
 *              413/503, or JSON that is not an `ErrorResponse`. Treated by status, never by guessing content.
 * - `network`  fetch rejected (offline, DNS, refused redirect). The request MAY have reached the server.
 * - `timeout`  the client gave up waiting. The request MAY have reached the server.
 * - `aborted`  the caller cancelled (navigation / "stop waiting"). The request MAY have reached the server.
 * - `invalid_response`  2xx with a body that is not the expected JSON.
 */
export type WebApiErrorKind = "http" | "edge" | "network" | "timeout" | "aborted" | "invalid_response";

export interface WebApiErrorInit {
  kind: WebApiErrorKind;
  operation: OperationId;
  status: number | null;
  code: ErrorCode | null;
  requestId?: string | null;
  retryAfterSeconds?: number | null;
  quota?: QuotaInfo | null;
  cause?: unknown;
}

export class WebApiError extends Error {
  readonly kind: WebApiErrorKind;
  readonly operation: OperationId;
  /** HTTP status, `null` when no response was received. */
  readonly status: number | null;
  /** Contract error code. Edge failures are mapped by status (see `codeForEdgeStatus`); `null` = unknown. */
  readonly code: ErrorCode | null;
  /** Server correlation id (body `request_id` or `X-Request-ID`) for support. Never user data. */
  readonly requestId: string | null;
  /** Seconds from `Retry-After` / `retry_after_seconds`. Authoritative; the client never computes its own. */
  readonly retryAfterSeconds: number | null;
  /** Present only with `quota_exceeded`. */
  readonly quota: QuotaInfo | null;

  constructor(init: WebApiErrorInit) {
    super(`Web API v2 ${init.operation} failed: ${init.code ?? init.kind}${init.status ? ` (HTTP ${init.status})` : ""}`);
    this.name = "WebApiError";
    this.kind = init.kind;
    this.operation = init.operation;
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId ?? null;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
    this.quota = init.quota ?? null;
    if (init.cause !== undefined) (this as { cause?: unknown }).cause = init.cause;
  }

  /** Retry policy from the contract's `x-error-catalog`; `null` for transport failures without a code. */
  get retryPolicy(): ErrorRetryPolicy | null {
    return this.code ? ERROR_CATALOG[this.code].retry : null;
  }

  /**
   * True when the server may or may not have acted: no response, a timeout, a cancellation, an edge failure
   * or `503 temporarily_unavailable`. For `submitMessage` this means "recover by key" (read-only GET), never
   * "send again" and never "mint a new key".
   */
  get outcomeUnknown(): boolean {
    if (this.kind === "network" || this.kind === "timeout" || this.kind === "aborted") return true;
    if (this.kind === "invalid_response") return true;
    return this.code === "temporarily_unavailable";
  }
}

export function isWebApiError(value: unknown): value is WebApiError {
  return value instanceof WebApiError;
}

const KNOWN_CODES = new Set<string>(Object.keys(ERROR_CATALOG));

/** Structural check of a parsed body. Anything else is treated as an edge response. */
export function isErrorResponse(body: unknown): body is ErrorResponse {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return b.kind === "ERROR" && typeof b.code === "string" && KNOWN_CODES.has(b.code) && typeof b.request_id === "string";
}

/**
 * Error code for a response that did not come from the /v2 app (HTML or empty body, foreign JSON).
 * - 413: the edge rejected the body size before the backend saw it -> `payload_too_large` (nothing admitted).
 * - 5xx (502/503/504 ...): outcome not determined -> `temporarily_unavailable` (README §3: edge 502/504 may
 *   not be JSON and are handled as `temporarily_unavailable`).
 * - Anything else: unknown (`null`); the UI shows a generic failure and never retries a model call.
 */
export function codeForEdgeStatus(status: number): ErrorCode | null {
  if (status === 413) return "payload_too_large";
  if (status >= 500) return "temporarily_unavailable";
  return null;
}

/** Parses delta-seconds `Retry-After`. HTTP-dates are not part of the contract and are ignored. */
export function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const seconds = Number(trimmed);
  return Number.isSafeInteger(seconds) && seconds >= 1 ? seconds : null;
}

/** Builds a typed error from a contract error body (used by the fixture transport and tests). */
export function errorFromBody(operation: OperationId, status: number, body: ErrorResponse): WebApiError {
  return new WebApiError({
    kind: "http",
    operation,
    status,
    code: body.code,
    requestId: body.request_id,
    retryAfterSeconds: body.retry_after_seconds ?? null,
    quota: body.quota ?? null,
  });
}
