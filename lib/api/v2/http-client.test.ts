import { afterEach, describe, expect, it, vi } from "vitest";
import { WebApiV2Client, assertSameOriginBasePath, type FetchLike } from "./http-client";
import { WebApiError } from "./errors";
import { fixtures } from "./fixtures";

/* ---------------- fake fetch ---------------- */

interface Recorded {
  url: string;
  init: RequestInit;
  headers: Record<string, string>;
  body: unknown;
}

type Responder = (req: Recorded) => Response | Promise<Response>;

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", ...headers },
  });
}

function fakeFetch(...responders: Responder[]) {
  const calls: Recorded[] = [];
  let i = 0;
  const fetch: FetchLike = async (url, init) => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => (headers[k] = v));
    const rec: Recorded = { url, init, headers, body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(rec);
    const responder = responders[Math.min(i++, responders.length - 1)];
    return responder(rec);
  };
  return { fetch, calls };
}

const csrf = () => json(200, fixtures.responses.authCsrf());
const THREAD = "1d8f3c19-e153-5169-92a9-3b9968bfc847";

afterEach(() => {
  vi.useRealTimers();
});

describe("WebApiV2Client — transport policy", () => {
  it("uses same-origin /api/v2 paths, cookie credentials, no-store cache and refuses redirects", async () => {
    const { fetch, calls } = fakeFetch(() => json(200, fixtures.responses.me()));
    const client = new WebApiV2Client({ fetch });
    const me = await client.getMe();
    expect(me.user.id).toBe(42);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.url).toBe("/api/v2/me");
    expect(call.init.method).toBe("GET");
    expect(call.init.credentials).toBe("same-origin");
    expect(call.init.mode).toBe("same-origin");
    expect(call.init.cache).toBe("no-store");
    expect(call.init.redirect).toBe("error");
    expect(call.headers.accept).toBe("application/json");
    // Reads carry no CSRF token and no identity header of any kind.
    expect(call.headers["x-csrf-token"]).toBeUndefined();
  });

  it("encodes path parameters and query strings", async () => {
    const { fetch, calls } = fakeFetch(() => json(200, fixtures.responses.threadMessagesClarification()));
    await new WebApiV2Client({ fetch }).listThreadMessages("a/b?c", { limit: 20, after_seq: 0 });
    expect(calls[0].url).toBe("/api/v2/threads/a%2Fb%3Fc/messages?limit=20&after_seq=0");
  });

  it("accepts only same-origin path prefixes", () => {
    expect(assertSameOriginBasePath("/api")).toBe("/api");
    expect(assertSameOriginBasePath("/api/")).toBe("/api");
    for (const bad of ["https://evil.example/api", "//evil.example/api", "api", "/../api", "http://localhost:8000"]) {
      expect(() => assertSameOriginBasePath(bad)).toThrow();
    }
    expect(() => new WebApiV2Client({ fetch: fakeFetch().fetch, basePath: "https://api.example" })).toThrow();
  });

  it("requires an injected fetch (no implicit global)", () => {
    expect(() => new WebApiV2Client({} as never)).toThrow(/injected fetch/);
  });

  it("never sends Authorization, bot token, cookies or X-Telegram-User-ID", async () => {
    const { fetch, calls } = fakeFetch(csrf, () => json(201, fixtures.responses.threadCreated()));
    const client = new WebApiV2Client({ fetch });
    await client.createThread("a1f59d0c-9838-523f-a412-b7eeb76d5954", { kind: "copilot" }, { idempotencyKey: "0d7f3f9e-7d0e-4c1a-9d65-1f1c0f6f3a11" });
    for (const call of calls) {
      const names = Object.keys(call.headers);
      expect(names).not.toContain("authorization");
      expect(names).not.toContain("x-telegram-user-id");
      expect(names).not.toContain("cookie");
      expect(JSON.stringify(call)).not.toMatch(/BOT_BACKEND_TOKEN|telegram-user/i);
    }
    expect(calls[1].headers["idempotency-key"]).toBe("0d7f3f9e-7d0e-4c1a-9d65-1f1c0f6f3a11");
  });
});

describe("WebApiV2Client — CSRF", () => {
  it("fetches the CSRF token once and sends it on every unsafe method", async () => {
    const { fetch, calls } = fakeFetch(csrf, () => json(201, fixtures.responses.threadCreated()), () => json(201, fixtures.responses.threadCreated()));
    const client = new WebApiV2Client({ fetch });
    await client.createThread("p1", { kind: "copilot" });
    await client.createThread("p1", { kind: "copilot" });
    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      "GET /api/v2/auth/csrf",
      "POST /api/v2/projects/p1/threads",
      "POST /api/v2/projects/p1/threads",
    ]);
    const token = fixtures.responses.authCsrf().csrf_token;
    expect(calls[1].headers["x-csrf-token"]).toBe(token);
    expect(calls[2].headers["x-csrf-token"]).toBe(token);
    expect(calls[1].headers["content-type"]).toBe("application/json");
  });

  it("uses the token from the login exchange and does not send CSRF on the exchange itself", async () => {
    const { fetch, calls } = fakeFetch(() => json(200, fixtures.responses.authExchange()), () => json(201, fixtures.responses.threadCreated()));
    const client = new WebApiV2Client({ fetch });
    const session = await client.exchangeTelegramLoginToken(fixtures.requests.authExchange());
    await client.createThread("p1", { kind: "copilot" });
    expect(calls[0].headers["x-csrf-token"]).toBeUndefined();
    expect(calls[1].headers["x-csrf-token"]).toBe(session.csrf_token);
  });

  it("after 403 csrf_failed refreshes the token and repeats the identical request exactly once", async () => {
    const { fetch, calls } = fakeFetch(
      csrf,
      () => json(403, fixtures.errors.csrfFailed()),
      () => json(200, { ...fixtures.responses.authCsrf(), csrf_token: "B".repeat(43) }),
      () => json(200, fixtures.responses.messageDirect()),
    );
    const client = new WebApiV2Client({ fetch });
    const body = fixtures.requests.calculation();
    const res = await client.submitMessage(THREAD, body);
    expect(res.httpStatus).toBe(200);
    const posts = calls.filter((c) => c.init.method === "POST");
    expect(posts).toHaveLength(2);
    expect(posts[0].body).toEqual(posts[1].body);
    expect(posts[1].headers["x-csrf-token"]).toBe("B".repeat(43));
  });

  it("does not loop on a second csrf_failed", async () => {
    const { fetch, calls } = fakeFetch(csrf, () => json(403, fixtures.errors.csrfFailed()), csrf, () => json(403, fixtures.errors.csrfFailed()));
    const client = new WebApiV2Client({ fetch });
    await expect(client.submitMessage(THREAD, fixtures.requests.calculation())).rejects.toMatchObject({ code: "csrf_failed", status: 403 });
    expect(calls.filter((c) => c.init.method === "POST")).toHaveLength(2);
  });

  it("logout clears the in-memory token; logout without a session sends no token", async () => {
    const { fetch, calls } = fakeFetch(() => new Response(null, { status: 204 }), csrf, () => new Response(null, { status: 204 }));
    const client = new WebApiV2Client({ fetch });
    await client.logout();
    expect(calls[0].headers["x-csrf-token"]).toBeUndefined();
    await client.getCsrfToken();
    await client.logout();
    expect(calls[2].headers["x-csrf-token"]).toBe(fixtures.responses.authCsrf().csrf_token);
  });
});

describe("WebApiV2Client — typed errors", () => {
  it.each([
    [401, fixtures.errors.unauthenticated(), "unauthenticated", "reauthenticate"],
    [403, fixtures.errors.forbidden(), "forbidden", "never"],
    [404, fixtures.errors.notFoundProject(), "not_found", "never"],
    [409, fixtures.errors.threadBusy(), "thread_busy", "after_delay"],
    [409, fixtures.errors.requestConflict(), "request_conflict", "never"],
    [422, fixtures.errors.invalidRequest(), "invalid_request", "never"],
  ])("HTTP %i → %s", async (status, body, code, retry) => {
    const { fetch } = fakeFetch(() => json(status, body, { "X-Request-ID": body.request_id }));
    const err = await new WebApiV2Client({ fetch }).getProject("p1").catch((e) => e);
    expect(err).toBeInstanceOf(WebApiError);
    expect(err).toMatchObject({ kind: "http", status, code, requestId: body.request_id, operation: "getProject" });
    expect(err.retryPolicy).toBe(retry);
  });

  it("401 drops the CSRF token and notifies the app", async () => {
    const onUnauthenticated = vi.fn();
    const { fetch, calls } = fakeFetch(csrf, () => json(401, fixtures.errors.unauthenticated()), csrf, () => json(201, fixtures.responses.threadCreated()));
    const client = new WebApiV2Client({ fetch, onUnauthenticated });
    await expect(client.createThread("p1", { kind: "copilot" })).rejects.toMatchObject({ code: "unauthenticated" });
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    await client.createThread("p1", { kind: "copilot" });
    expect(calls[2].url).toBe("/api/v2/auth/csrf"); // token re-fetched after the session ended
  });

  it("429 quota_exceeded carries Retry-After and resets_at and is never retried", async () => {
    const body = fixtures.errors.quotaExceeded();
    const { fetch, calls } = fakeFetch(csrf, () => json(429, body, { "Retry-After": "41400" }));
    const err = await new WebApiV2Client({ fetch }).submitMessage(THREAD, fixtures.requests.strategy()).catch((e) => e);
    expect(err).toMatchObject({ code: "quota_exceeded", status: 429, retryAfterSeconds: 41400, retryPolicy: "after_reset" });
    expect(err.quota?.resets_at).toBe(body.quota?.resets_at);
    expect(err.outcomeUnknown).toBe(false);
    expect(calls.filter((c) => c.init.method === "POST")).toHaveLength(1);
  });

  it("429 rate_limited prefers the body value and falls back to the Retry-After header", async () => {
    const { fetch } = fakeFetch(() => json(429, { ...fixtures.errors.rateLimited(), retry_after_seconds: null }, { "Retry-After": "12" }));
    const err = await new WebApiV2Client({ fetch }).getMe().catch((e) => e);
    expect(err).toMatchObject({ code: "rate_limited", retryAfterSeconds: 12 });
  });

  it("503 temporarily_unavailable on submit is an unknown outcome and is NOT retried", async () => {
    const { fetch, calls } = fakeFetch(csrf, () => json(503, fixtures.errors.temporarilyUnavailable(), { "Retry-After": "10" }));
    const err = await new WebApiV2Client({ fetch }).submitMessage(THREAD, fixtures.requests.strategy()).catch((e) => e);
    expect(err).toMatchObject({ kind: "http", code: "temporarily_unavailable", status: 503, retryAfterSeconds: 10, requestId: "req_fixture_0015" });
    expect(err.outcomeUnknown).toBe(true);
    expect(calls.filter((c) => c.init.method === "POST")).toHaveLength(1);
  });

  it("HTML 502 from the reverse proxy → edge temporarily_unavailable with the proxy request id", async () => {
    const { fetch } = fakeFetch(
      () => new Response("<html><body>502 Bad Gateway</body></html>", { status: 502, headers: { "Content-Type": "text/html", "X-Request-ID": "edge-req-1234" } }),
    );
    const err = await new WebApiV2Client({ fetch }).getMessage("m1").catch((e) => e);
    expect(err).toMatchObject({ kind: "edge", status: 502, code: "temporarily_unavailable", requestId: "edge-req-1234" });
    expect(err.outcomeUnknown).toBe(true);
  });

  it("empty 504 and non-JSON 503 are temporarily_unavailable; non-JSON 413 is payload_too_large", async () => {
    const empty504 = await new WebApiV2Client({ fetch: fakeFetch(() => new Response(null, { status: 504 })).fetch }).getMe().catch((e) => e);
    expect(empty504).toMatchObject({ kind: "edge", code: "temporarily_unavailable", status: 504 });
    const text503 = await new WebApiV2Client({ fetch: fakeFetch(() => new Response("Service Unavailable", { status: 503 })).fetch }).getMe().catch((e) => e);
    expect(text503).toMatchObject({ kind: "edge", code: "temporarily_unavailable" });
    const big = await new WebApiV2Client({ fetch: fakeFetch(csrf, () => new Response("<h1>413</h1>", { status: 413, headers: { "Content-Type": "text/html" } })).fetch })
      .submitMessage(THREAD, fixtures.requests.strategy())
      .catch((e) => e);
    expect(big).toMatchObject({ kind: "edge", code: "payload_too_large", status: 413 });
    expect(big.outcomeUnknown).toBe(false);
  });

  it("foreign JSON error bodies (not ErrorResponse) are classified by status only", async () => {
    const err = await new WebApiV2Client({ fetch: fakeFetch(() => json(404, { detail: "Not Found" })).fetch }).getMe().catch((e) => e);
    expect(err).toMatchObject({ kind: "edge", status: 404, code: null });
  });

  it("network failures are typed and mean 'outcome unknown'", async () => {
    const fetch: FetchLike = async () => {
      throw new TypeError("Failed to fetch");
    };
    const err = await new WebApiV2Client({ fetch }).getMe().catch((e) => e);
    expect(err).toMatchObject({ kind: "network", status: null, code: null });
    expect(err.outcomeUnknown).toBe(true);
  });

  it("a 2xx body that is not JSON, or has a foreign schema_version, is invalid_response", async () => {
    const html = await new WebApiV2Client({ fetch: fakeFetch(() => new Response("<html/>", { status: 200, headers: { "Content-Type": "text/html" } })).fetch })
      .getMe()
      .catch((e) => e);
    expect(html).toMatchObject({ kind: "invalid_response", status: 200 });
    const v3 = await new WebApiV2Client({ fetch: fakeFetch(() => json(200, { ...fixtures.responses.me(), schema_version: "web_api.v3" })).fetch })
      .getMe()
      .catch((e) => e);
    expect(v3).toMatchObject({ kind: "invalid_response" });
  });

  it("rejects 2xx JSON that is not a /v2 envelope (missing schema_version, arrays)", async () => {
    for (const body of [{ foo: 1 }, [], [fixtures.responses.me()], { ...fixtures.responses.me(), schema_version: undefined }]) {
      const err = await new WebApiV2Client({ fetch: fakeFetch(() => json(200, body)).fetch }).getMe().catch((e) => e);
      expect(err).toMatchObject({ kind: "invalid_response", status: 200, operation: "getMe" });
    }
    const submit = await new WebApiV2Client({ fetch: fakeFetch(csrf, () => json(200, { foo: 1 })).fetch })
      .submitMessage(THREAD, fixtures.requests.strategy())
      .catch((e) => e);
    expect(submit).toMatchObject({ kind: "invalid_response", operation: "submitMessage" });
    expect(submit.outcomeUnknown).toBe(true); // recovered by key, never resent
  });

  it("validates the snapshot envelope of getMessageResult (it has no top-level schema_version)", async () => {
    const ok = await new WebApiV2Client({ fetch: fakeFetch(() => json(200, fixtures.responses.resultSnapshotRun())).fetch }).getMessageResult("m1");
    expect(ok.result_kind).toBe("RUN");
    for (const body of [{ foo: 1 }, [], fixtures.responses.me(), { ...fixtures.responses.resultSnapshotRun(), envelope_version: 2 }]) {
      const err = await new WebApiV2Client({ fetch: fakeFetch(() => json(200, body)).fetch }).getMessageResult("m1").catch((e) => e);
      expect(err).toMatchObject({ kind: "invalid_response", operation: "getMessageResult" });
    }
  });

  it("maps 200 and 202 of submitMessage", async () => {
    const { fetch } = fakeFetch(csrf, () => json(202, fixtures.responses.messageWorkflowStarted()));
    const res = await new WebApiV2Client({ fetch }).submitMessage(THREAD, fixtures.requests.strategy());
    expect(res.httpStatus).toBe(202);
    expect(res.result.next_action).toBe("poll");
  });
});

describe("WebApiV2Client — cancellation and timeouts", () => {
  const hanging: FetchLike = (_url, init) =>
    new Promise((_, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });

  it("caller abort → kind aborted", async () => {
    const controller = new AbortController();
    const pending = new WebApiV2Client({ fetch: hanging }).getMessage("m1", { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: "aborted", code: null });
  });

  it("an already-aborted signal sends nothing", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn(hanging);
    await expect(new WebApiV2Client({ fetch }).getMe({ signal: controller.signal })).rejects.toMatchObject({ kind: "aborted" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("read timeout → kind timeout (outcome unknown)", async () => {
    vi.useFakeTimers();
    const pending = new WebApiV2Client({ fetch: hanging, timeoutMs: 1000 }).getMessage("m1").catch((e) => e);
    await vi.advanceTimersByTimeAsync(1001);
    const err = await pending;
    expect(err).toMatchObject({ kind: "timeout" });
    expect(err.outcomeUnknown).toBe(true);
  });

  it("submit uses its own longer timeout (edge allows 330 s)", async () => {
    vi.useFakeTimers();
    let posted = false;
    const fetch: FetchLike = (url, init) => {
      if (url.endsWith("/auth/csrf")) return Promise.resolve(csrf());
      posted = true;
      return hanging(url, init);
    };
    const client = new WebApiV2Client({ fetch, timeoutMs: 1000 });
    const pending = client.submitMessage(THREAD, fixtures.requests.strategy()).catch((e) => e);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(posted).toBe(true);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(330_000);
    expect(await pending).toMatchObject({ kind: "timeout", operation: "submitMessage" });
  });
});
