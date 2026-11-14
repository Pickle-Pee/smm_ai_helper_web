# Web API v2 client (F1) — typed transport, fixture adapter, mock-only

> **Status: F1, mock-only.** The deployed Brenvio preview never sends a request to `/api/v2` and never calls an AI
> model. The HTTP client exists and is tested against a fake `fetch`, but nothing in the app can select it.
> Contract: [`docs/api/web-api-v2.openapi.yaml`](api/web-api-v2.openapi.yaml) (`2.0.0-draft.3`, **proposed** —
> no `/v2` route exists in the backend). Task: [#9](https://github.com/Pickle-Pee/smm_ai_helper_web/issues/9) ·
> architecture [#6](https://github.com/Pickle-Pee/smm_ai_helper_web/issues/6) · contract
> [#7](https://github.com/Pickle-Pee/smm_ai_helper_web/issues/7) · epic
> [smm_ai_helper#158](https://github.com/Pickle-Pee/smm_ai_helper/issues/158).

## 1. What exists now

| Piece | File | State |
| --- | --- | --- |
| Generated DTO types (OpenAPI 3.1 → TS) | `lib/api/generated/web-api-v2.ts` | generated, drift-checked in CI |
| Generated contract metadata (version, error catalog, operations) | `lib/api/generated/web-api-v2.meta.ts` | generated, drift-checked in CI |
| Named aliases over generated types | `lib/api/v2/types.ts` | aliases only, no hand-written DTOs |
| Transport interface | `lib/api/v2/contract.ts` | `WebApiV2` |
| HTTP transport | `lib/api/v2/http-client.ts` | `WebApiV2Client`, **not connected**, fake-`fetch` tests only |
| Fixture transport | `lib/api/v2/fixture-client.ts` + `fixtures.ts` | `FixtureWebApiV2Client`, the only app mode |
| Typed errors | `lib/api/v2/errors.ts` | `WebApiError` (`http` / `edge` / `network` / `timeout` / `aborted` / `invalid_response`) |
| Request lifecycle | `lib/api/v2/requests.ts` | `RequestCoordinator`: keys, revisions, recovery, polling |
| Request keys | `lib/api/v2/request-key.ts` | `w-<uuidv7>` |
| DTO → UI mappers | `lib/api/v2/presenters.ts` | projects, threads, results, execution states, errors |
| Read adapter for the existing UI client | `lib/api/v2/read-adapter.ts` | ready, not wired (app keeps `createMockApiClient`) |
| Mode selection | `lib/api/v2/mode.ts` | always `fixture` |
| Demo UI | Settings → «Web API v2 · примеры» (`features/workspace/contract-demo/*`, `ContractDemoPanel`, `ContractResultCard`) | in-memory, labelled «Пример из тестовых данных» |

Unchanged on purpose: the read-only UI `ApiClient` (`lib/api/contracts.ts`), the mock dataset, all feature stores and
their **local** mutations (create/edit project, local messages, result status, checklists), Dashboard, AI Workspace,
Projects, Documents, navigation, Preview banner, `noindex`.

```mermaid
flowchart LR
  subgraph UI[Brenvio UI]
    Stores[feature stores<br/>local mutations] -->|read| ApiClient
    Demo[Settings → Web API v2 · примеры]
  end
  ApiClient[ApiClient<br/>lib/api/contracts.ts] --> Mock[createMockApiClient<br/>(app today)]
  ApiClient -.F2+.-> Adapter[createWebApiV2ReadAdapter]
  Demo --> Coord[RequestCoordinator] --> V2{{WebApiV2}}
  Adapter -.-> V2
  V2 --> Fixture[FixtureWebApiV2Client<br/>docs/api/fixtures]
  V2 -. not selectable in F1 .-> Http[WebApiV2Client<br/>same-origin /api/v2]
  Presenters[presenters.ts<br/>DTO → UI models] --- Demo
  Presenters --- Adapter
```

## 2. Type generation

* Source of truth: `docs/api/web-api-v2.openapi.yaml`. Generator: `openapi-typescript` **7.13.0** (exact devDependency,
  locked in `package-lock.json`), YAML parser `yaml` 2.8.1.
* `npm run generate:api` → `scripts/generate-api-types.mjs` writes both generated files. Output is deterministic:
  no timestamps, LF endings (`.gitattributes`), and the banner carries the YAML `info.version` and the sha256 of the
  YAML (normalized to LF), so even comment-only contract edits are detected.
* `npm run check:api` regenerates in memory and fails on any difference (runs in CI and in `contract-safety.test.ts`).
* Nullable fields (`type: [x, 'null']`, `oneOf … {type: 'null'}`) become `T | null`; `const` fields become literal
  types, so `ResultSnapshot` (`result_kind`) and `ThreadMessage` (`role`) are discriminated unions.
* UI code never imports generated types: components get view models from `presenters.ts`.

Workflow after a contract change: edit the YAML (C-series PR) → `npm run generate:api` → fix type errors in adapters
and presenters → commit YAML and generated files together.

## 3. `WebApiV2Client` (HTTP, not connected)

| Property | Behaviour |
| --- | --- |
| Origin | base path must be a same-origin path (`/api`, from `servers[0]`); absolute or protocol-relative URLs are rejected |
| `fetch` | injected (constructor option); there is no implicit global |
| Credentials | `credentials: "same-origin"`, `mode: "same-origin"`, `cache: "no-store"`, `redirect: "error"`; the session is the server's HttpOnly cookie, the client never touches cookies |
| CSRF | token kept in memory only; fetched via `getCsrfToken` before the first unsafe call (or taken from the login exchange); sent as `X-CSRF-Token` on POST/PATCH/DELETE; after `403 csrf_failed` a fresh token is fetched and the identical request is repeated **once** (contract: rejected before admission) |
| Forbidden headers | `Authorization`, `Cookie`, `X-Telegram-User-ID`, bot-token headers — every request is checked, the client throws |
| Timeouts | 30 s default; `submitMessage` 330 s (backend `GRAPH_TIMEOUT_SECONDS` 300 s + edge margin); caller `AbortSignal` supported; an already-aborted signal sends nothing |
| Errors | contract `ErrorResponse` → `kind: "http"` with `code`, `status`, `requestId` (body or `X-Request-ID`), `retryAfterSeconds` (body or `Retry-After`), `quota` |
| Reverse proxy | non-JSON / foreign bodies → `kind: "edge"`, classified by status only: 5xx (HTML/empty 502, 504, text 503) → `temporarily_unavailable`; 413 → `payload_too_large` |
| 401 | drops the CSRF token and calls `onUnauthenticated` |
| Retries | none, except the single CSRF repeat. `WebApiError.outcomeUnknown` tells callers to *read* the state |

## 4. `FixtureWebApiV2Client` (the app's only transport)

An in-memory simulation of the **server** side of the contract, seeded from `docs/api/fixtures/` (deep copies,
re-bound to the ids/key/revision of the simulated request). It never calls a model or the network.

* Options: `scenario` (how the next new request is answered), `viewer` (`author` / `viewer_member`), `serverNow`
  (simulated server clock), `pollsUntilDone`, `readOutages` (503 on the next N reads), `pendingCreatedAt`.
* Scenarios: `direct_result`, `module_result`, `needs_input`, `workflow` (+ `_failed`, `_blocked`), `ambiguous`,
  `running_overdue`, `unsupported`, `unavailable_after_admission`, `unavailable_before_admission`, `rate_limited`,
  `quota_exceeded`.
* Server rules it models: idempotent replay by `(request_key, revision)`; `409 request_conflict` (changed payload,
  key reused in another thread); `409 revision_conflict`; `409 thread_busy` (one in-flight request per thread);
  `NEEDS_INPUT` → revision + 1 with the same key and message; the seven-day `pending` window (fresh → `resubmit_same_key`,
  ≥ 7 days → `expired / recovery_window_elapsed`, never re-admitted); `ambiguous` only from the scenario ("the core
  recorded it"), never by age; per-viewer `is_self`; `wait_for_author` for other members; tenant `404`s identical to
  unknown ids; `403` for a viewer; snapshot read failures `409 result_format_unsupported`, `503 result_corrupted`,
  `503 result_unreadable`, `409 result_not_ready`, `410 result_gone`.
* `stats.simulatedCoreAdmissions` counts what a real core would admit — the tests use it to prove that recovery,
  replays and stale requests never cause a second generation.

## 5. Request lifecycle (`RequestCoordinator`)

1. **New request:** fresh `w-<uuidv7>` key, revision 1; the payload is deep-frozen and stored (in memory in F1)
   **before** the POST; removed once a durable state is reached.
2. **Double submit:** a second submit for the same thread while one is in progress is refused locally; a new
   request while the server reports `pending`/`running` is refused; other tabs are stopped by `409 thread_busy`.
3. **Unknown outcome** (network, timeout, edge 5xx, `503`): read-only `getRequestByKey`. **No second POST.**
4. **`404` on recovery** → `unknown / no_visible_record`. Not proof that the model did not run (C0 fix): nothing is
   resent; only an explicit new request is possible.
5. **`resubmitSameKey`** only with the server's own `next_action: "resubmit_same_key"` for that key/revision, with
   the identical stored payload (or the server's accepted `input` on another device).
6. **Clarification:** same key, `revision + 1`, same `message`, accepted input extended with the answer.
7. **New key** only via `startNewRequest(..., { acknowledgeMayRegenerate: true })` — an explicit, warned user action
   after `ambiguous`, `expired`, an overdue run or an unknown outcome.
8. **Polling:** `getMessage` every `poll_after_ms` while `next_action === "poll"`; `503` → wait `Retry-After` and
   re-read; cancellable via `AbortSignal`; never stops or changes state because of elapsed time. After a reload,
   `followInFlight(thread)` reads `Thread.in_flight` instead of submitting again.
9. `429 rate_limited` / `quota_exceeded` are returned as `rejected` and never retried automatically (the contract
   would allow one bounded `rate_limited` retry; F1 leaves it to an explicit user action).

## 6. Result presentation

`presentSnapshot` / `presentAssistantMessage` render content from `presentation.payload` only. `stored`
(schema version, payload hash, writer), `provenance` (source, run, key, revision, `author_user_id`, timestamps) and
the per-viewer `author` (`is_self`) are returned in a separate `meta` object and are never mixed into content.
`format_unsupported`, `corrupted` and `unreadable` (from `result_status` or the matching `getMessageResult` errors)
are separate view states without content. Copilot kinds are mapped to existing `ResultBlock`s (metrics, tables,
lists, callouts); a FUTURE `CHAT_REPLY` is `not_presentable`.

## 7. Tests

| Area | File |
| --- | --- |
| Codegen drift + metadata vs YAML; mock-only mode; no network; source policy (no HTTP-client import, no `/api/v2` literals, no secrets / Telegram identity headers) | `lib/api/v2/contract-safety.test.ts` |
| HTTP client with fake `fetch`: URLs, cookie/CSRF policy, 401/403/404/409/422/429/503, edge HTML/empty 5xx, 413, network, timeout, abort, invalid responses, no submit retry | `lib/api/v2/http-client.test.ts` |
| Idempotency, double submit, one in-flight per thread, `NEEDS_INPUT` revisions, 503 recovery, `404` ≠ proof, no auto re-call, stale pending (golden `pending-receipt-purged`), polling & cancel, `in_flight` after reload | `lib/api/v2/requests.test.ts` |
| Fixture invariants, auth/org/project/brand, tenant `404`s, two viewers (`is_self`), viewer `403`, history reopen, snapshot failures | `lib/api/v2/fixture-client.test.ts` |
| DTO → UI mappers, stored vs presentation separation, unavailable states, execution states, error texts, request keys | `lib/api/v2/presenters.test.ts` |
| Every demo example runs without network; demo results are labelled; Settings panel states mock-only mode | `features/workspace/contract-demo/contract-demo.test.tsx` |

Run locally:

```bash
npm run check:api
npm test
python -m venv .venv-contract && .venv-contract/bin/pip install -r docs/api/tools/requirements.txt
.venv-contract/bin/python docs/api/tools/check_contract.py
# optional, read-only cross-check of `existing` DTOs against the backend baseline:
.venv-contract/bin/python docs/api/tools/check_contract.py --backend-repo ../smm_ai_helper --backend-ref 76b6c1b
```

CI (`.github/workflows/frontend.yml`): `npm run check:api` in the build job; a `contract` job runs
`check_contract.py` and the backend cross-check against the pinned baseline `76b6c1b` (read-only checkout).

## 8. Missing backend endpoints

Every operation in the contract is **proposed**; none is implemented in `Pickle-Pee/smm_ai_helper@master`
(`76b6c1b` at the time of F1: no `/v2` router, no `ExecutionStore.peek`). Needed before HTTP can be switched on,
by stage (README §17–§18 of the contract):

| Stage | Endpoints / capability |
| --- | --- |
| B1–B2 | `users`/`external_identities`/`web_sessions`, `POST /v2/auth/telegram/exchange`, `GET /v2/auth/csrf`, `POST /v2/auth/logout`, `GET /v2/me`, bot `POST /internal/identity/web-login-link` |
| B3–B4 | `GET /v2/orgs`, projects list/get/create/patch, brand get/patch/import; `execute_for_owner`, owner-id readers |
| B5 | threads list/create/get, `POST/GET /v2/threads/{id}/messages`, `GET …/requests/{key}`, `GET /v2/messages/{id}`; read-only `ExecutionStore.peek` (OQ-9) |
| B6 | `GET /v2/messages/{id}/result`, snapshot materialization, frozen decoders/upcasters, thread removal |
| later | mentor (B3b), Telegram history (B11), web chat (B9/F7), team orgs (B10), email login (B2e), documents (DOC epics) |

## 9. Switching HTTP on — prerequisites (a separate, reviewed PR)

Nothing below is done in F1. The switch must be its own PR that changes `lib/api/v2/mode.ts`, wires
`createWebApiV2ReadAdapter` / `RequestCoordinator` into the stores, and updates `contract-safety.test.ts`.

1. Backend B1–B6 deployed behind `WEB_API_ENABLED`, matching this contract version (or the client regenerated
   for the new one); `peek` deployed (otherwise undetermined reads must stay `503`).
2. Auth/session: one-time Telegram login page (`/auth/telegram#t=…`, fragment removed immediately), cookie
   `__Host-brenvio_session` (HttpOnly, Secure, SameSite=Lax), CSRF, logout; no fake "logged in" UI before that.
3. Edge F4: Caddy `handle /api/v2/*` → FastAPI `/v2/*` with body limit and 330 s timeout, `Cache-Control:
   private, no-store` on all responses including edge errors; no CDN caching; staging `caddy validate` + smoke.
4. IndexedDB `PendingRequestStore` (stored before POST, cleared on logout), replacing the memory store.
5. Security testing: tenant isolation T1–T10 / O-T1–O-T5, CSRF/Origin checks, no secrets in bundles, rate limits
   and quotas, response caching smoke.
6. Product/ops decisions from the decision register (OQ-1 re-import, OQ-4 topology, OQ-6 quotas, OQ-7 session
   lifetimes, D12/D13/D18 retention) and an explicit rollback plan (flip `mode.ts` back to `fixture`).
7. UI copy: remove the demo labels only for data that is really served by the API; keep the Preview banner until
   the release decision.

## 10. Interpretations to confirm (not contract changes)

* README §3 says edge 413/502/504 may be non-JSON and are handled as `temporarily_unavailable`. The client maps a
  non-JSON **413** to `payload_too_large` (the request was rejected before the backend saw it, matching
  `components/responses/PayloadTooLarge`); non-JSON 5xx map to `temporarily_unavailable`.
* `rate_limited` allows one automatic identical retry by contract; F1 does not retry automatically (stricter).
