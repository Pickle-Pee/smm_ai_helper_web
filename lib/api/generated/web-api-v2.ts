/**
 * TypeScript types for Brenvio Web API v2 (PROPOSED contract).
 * GENERATED FILE - DO NOT EDIT. Regenerate with `npm run generate:api`; CI runs `npm run check:api`.
 * Source: docs/api/web-api-v2.openapi.yaml (info.version 2.0.0-draft.3, sha256 10c569f9adf2d08064842e0dfde22d8d1ccf4cb4e190b91abf75c09c9d6e1a1b).
 * Generator: openapi-typescript 7.13.0.
 */

export interface paths {
    "/v2/auth/telegram/exchange": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Exchange a one-time Telegram login token for a browser session
         * @description The bot obtains a single-use link from the bot-only internal endpoint
         *     (`POST /internal/identity/web-login-link`, not routed by the edge, not in this document) and sends
         *     `https://<app>/auth/telegram#t=<token>` to the user. The page reads the fragment and posts it here.
         *
         *     * The token is single-use, TTL 10 minutes, stored only as a hash. Unknown, expired and used tokens are
         *       indistinguishable (`401 login_token_invalid`).
         *     * On success the session is bound to the SAME internal `users.id` the bot uses; no data is copied.
         *     * Sets `__Host-brenvio_session` (HttpOnly, Secure, SameSite=Lax, Path=/). A previous session cookie on
         *       the same browser is revoked (session fixation protection).
         *     * No CSRF token is required (there is no session yet) but `Origin` / `Sec-Fetch-Site` MUST be same-origin.
         *     * On first login a personal organization and a personal project are provisioned; the legacy Telegram
         *       brand profile, if any, is copied once into `project_brands` (see `importTelegramBrand`).
         */
        post: operations["exchangeTelegramLoginToken"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/auth/csrf": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get the CSRF token bound to the current session
         * @description Returns the token the client must echo in `X-CSRF-Token` on every unsafe method (POST, PATCH, PUT,
         *     DELETE). The token is bound to the session and changes when the session is rotated. Keep it in memory;
         *     do not persist it. Call this after a page reload and after any `403 csrf_failed`.
         */
        get: operations["getCsrfToken"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Revoke the current session
         * @description Revokes the server-side session and clears the cookie. Idempotent: a request without a valid session
         *     also returns 204 and clears the cookie. With a valid session `X-CSRF-Token` is required.
         *     Logout does not cancel running AI work; results stay available after the next login.
         */
        post: operations["logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Current user, memberships, session and feature flags */
        get: operations["getMe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/me/telegram-history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The caller's own Telegram history (read-only, private)
         * @description Read-only list of what the caller created through the Telegram bot. Delegates to the existing
         *     `ProjectHistoryService` through an owner-id variant (proposed backend change B11).
         *
         *     Privacy invariants:
         *     * Scoped to `principal.user_id` only. There is no organization or project parameter and no other
         *       user's history is reachable through any `/v2` path.
         *     * Nothing here is shared with organization members, ever, by default. Importing a single item into a
         *       project is an explicit, per-item, future action (not in C0).
         *     * Requires a linked Telegram identity (`409 telegram_identity_required` otherwise).
         *
         *     Pagination keeps the existing bounded offset semantics (limit 1-50, offset 0-10000). The list can
         *     shift when new items arrive; it is a navigation aid, not a stable export cursor.
         */
        get: operations["listTelegramHistory"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/me/telegram-history/{public_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * One legacy history item (DEFERRED - result shape not frozen)
         * @description The existing `ProjectHistoryService.get` returns a per-source result as untyped dictionaries (task
         *     result, fixed-workflow artifacts, graph case, receipt, conversation turns). C0 deliberately does NOT
         *     invent a typed schema for them. The typed projection is to be designed in B11; until then this
         *     operation is not implemented and the UI shows the list only.
         */
        get: operations["getTelegramHistoryItem"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/orgs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Organizations the caller is an active member of
         * @description Internal beta: exactly one `personal` organization with role `owner`. Team organizations, invitations
         *     and member management (`/v2/orgs/{org_id}/members`) are FUTURE (B10) and not in this document.
         */
        get: operations["listOrganizations"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/orgs/{org_id}/projects": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                org_id: components["parameters"]["OrgId"];
            };
            cookie?: never;
        };
        /**
         * Projects of an organization
         * @description Keyset pagination ordered by `updated_at` descending, then `id`. Archived projects are included; filter by `status`.
         */
        get: operations["listProjects"];
        put?: never;
        /**
         * Create a project with its (possibly empty) brand
         * @description Creates the `projects` row and exactly one `project_brands` row in one transaction. Never writes to the
         *     legacy `brand_profiles` table. With `Idempotency-Key`, a repeated identical request returns the project
         *     created by the first one (`200` instead of `201`); a different payload under the same key is
         *     `409 idempotency_conflict`.
         */
        post: operations["createProject"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/projects/{project_id}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: components["parameters"]["ProjectId"];
            };
            cookie?: never;
        };
        /** Get a project with its brand */
        get: operations["getProject"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Edit project metadata (name, status, colour)
         * @description Optimistic concurrency: `expected_version` must equal the stored `version`, otherwise
         *     `409 stale_project` and nothing is written. Brand fields are edited through `updateProjectBrand`.
         *     Moving a project to another organization is not supported.
         */
        patch: operations["updateProject"];
        trace?: never;
    };
    "/v2/projects/{project_id}/brand": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: components["parameters"]["ProjectId"];
            };
            cookie?: never;
        };
        /**
         * Get the brand context of a project
         * @description The brand is what the AI core receives as brand context for requests in this project
         *     (`brand_entries(to_context(project_brand))`, existing pure functions reused through an adapter).
         *     Explicit request `context` values always take precedence over the brand (existing core rule).
         */
        get: operations["getProjectBrand"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Edit the brand context of a project
         * @description Partial update with optimistic concurrency (`expected_version` against `ProjectBrand.version`).
         *     Omitted field = unchanged; `null` = cleared. `extra` is merged key by key (`null` removes a key).
         *     Writes only `project_brands`; the legacy Telegram `brand_profiles` row is never touched, and edits
         *     made in the Telegram bot do not appear here (the two are independent copies after import).
         *
         *     A changed brand changes the effective plan of later requests. It does not affect requests that are
         *     already admitted: an identical replay of an admitted `request_key` keeps returning its stored result.
         */
        patch: operations["updateProjectBrand"];
        trace?: never;
    };
    "/v2/projects/{project_id}/brand/import-telegram": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: components["parameters"]["ProjectId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Copy the caller's personal Telegram BrandProfile into a personal project
         * @description One-way COPY of the caller's own legacy `brand_profiles` row into this project's `project_brands` row,
         *     with provenance (`imported_from`). It is a deliberate fork, not synchronization: afterwards the two
         *     records evolve independently, Telegram edits are not reflected in the web project and web edits never
         *     write back to Telegram.
         *
         *     Rules:
         *     * Source: only the caller's own legacy profile (`409 import_source_missing` if none,
         *       `409 telegram_identity_required` without a Telegram identity).
         *     * Target: only a project of the caller's own `personal` organization (`403 forbidden` for a team
         *       organization project the caller can see).
         *     * The copy REPLACES the mapped brand fields; `expected_version` and the literal
         *       `confirm_overwrite: true` are required so that web edits are never lost silently.
         *     * The first import of a project (`imported_from` is null) is always available. The automatic copy at
         *       first login uses the same code path.
         *
         *     OPEN PRODUCT DECISION (OQ-1, D3b): a REPEATED manual import ("import again" after either side
         *     changed) is not approved. Until the owner decides whether it exists and with which semantics
         *     (replace / field-wise merge / preview), a repeated import returns `403 feature_disabled`
         *     (flag `WEB_BRAND_REIMPORT_ENABLED`, default off) and `Project.permissions.can_import_telegram_brand`
         *     is false once `imported_from` is set.
         */
        post: operations["importTelegramBrand"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/projects/{project_id}/threads": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: components["parameters"]["ProjectId"];
            };
            cookie?: never;
        };
        /**
         * Threads of a project
         * @description Keyset pagination ordered by `updated_at` descending, then `id`. Reads only web tables
         *     (`workspace_threads`) joined with active membership; the AI core is never queried by membership.
         *     Removed threads are not listed.
         */
        get: operations["listThreads"];
        put?: never;
        /**
         * Create a thread
         * @description Internal beta accepts only `kind: copilot` (structured Copilot scenarios). `kind: chat` returns
         *     `403 feature_disabled` until `WEB_CHAT_ENABLED` (B9). `Idempotency-Key` behaves as in `createProject`.
         */
        post: operations["createThread"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/threads/{thread_id}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                thread_id: components["parameters"]["ThreadId"];
            };
            cookie?: never;
        };
        /**
         * Thread metadata and in-flight pointer
         * @description `in_flight` points at the request that currently holds the thread's single execution slot, if any.
         *     After a reload or on another device the client follows it with `getMessage` instead of submitting again.
         */
        get: operations["getThread"];
        put?: never;
        post?: never;
        /**
         * Remove a thread from the project (does NOT erase underlying AI data)
         * @description "Remove from project": soft-deletes the web rows (thread, messages, snapshots); they disappear from
         *     every `/v2` read immediately and are hard-purged after the retention window (proposed 30 days).
         *
         *     This is NOT "erase underlying AI data". Core records created by the author (graph runs, artifacts,
         *     mentor companions) are user-owned and are not deleted by this call; core receipts expire on their own
         *     after 30 days. A core erasure service (B12) is not approved, database backups have no agreed lifetime
         *     (D18), therefore neither this API nor the UI may promise complete deletion.
         *
         *     Allowed for the thread author (role editor or higher) and the organization owner. A request in flight
         *     is not cancelled; it finishes in the core but is no longer reachable through this thread.
         */
        delete: operations["removeThread"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/threads/{thread_id}/messages": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                thread_id: components["parameters"]["ThreadId"];
            };
            cookie?: never;
        };
        /**
         * Message history of a thread (durable, receipt-independent)
         * @description Returns messages in ascending `seq`. Without `before_seq`/`after_seq` the LATEST page is returned.
         *     `before_seq` pages backwards; `after_seq` fetches only newer messages (incremental refresh). The two
         *     are mutually exclusive (`422 invalid_request`).
         *
         *     Results come from immutable `result_snapshots`, never from core receipts, so a thread opens the same
         *     way after the 30-day receipt retention and never triggers a model call. For a request whose workflow
         *     finished but is not materialized yet, the read path materializes the snapshot lazily and idempotently
         *     (read-only towards the core).
         *
         *     A snapshot that cannot be presented does not fail the page: the assistant message carries
         *     `result_status` (`corrupted`, `format_unsupported`, `unreadable`) and `result: null`.
         */
        get: operations["listThreadMessages"];
        put?: never;
        /**
         * Submit an AI request (or a clarification revision) to a Copilot thread
         * @description The only operation that can start AI work. The core is always invoked with
         *     `owner = principal.user_id` and the brand of the thread's project; the DTO has no owner field.
         *
         *     **Idempotency.** `(principal, request_key, revision)` identifies the request.
         *     * Same key, same revision, same payload: replay of a known receipt/snapshot. If the core receipt
         *       is absent, re-admission is allowed only for a `pending` message younger than the 7-day recovery
         *       window, after read-only status verification; older missing receipts NEVER authorize regeneration.
         *       Replaying a still-running request returns its current state.
         *     * Same key, same revision, different payload: `409 request_conflict`.
         *     * Key already used in another thread: `409 request_conflict`.
         *     * `revision = n + 1` is accepted only if revision `n` is the latest and ended in `needs_input`, and
         *       `message` is unchanged; otherwise `409 revision_conflict`. The SAME `request_key` is kept, which
         *       is the existing core clarification contract.
         *     * A different request while another one is `pending`/`running` in this thread: `409 thread_busy`.
         *
         *     **Status codes.**
         *     * `200` - the request reached a durable state synchronously: `completed`, `needs_input`,
         *       `unsupported`, or `ambiguous` when the core itself recorded an unknown provider outcome
         *       (`finish` without a response); or a replay of any terminal state.
         *     * `202` - the request is `running` (a workflow was started, or a replay found it still running).
         *       Poll `getMessage`.
         *     * `503 temporarily_unavailable` - the outcome is NOT known yet (in flight elsewhere, dependency down,
         *       crash window). The client MUST recover with `getRequestByKey` and MUST NOT mint a new key, neither
         *       automatically nor on a plain "retry" button; a new key exists only behind the explicit, warned
         *       "start a new request" action.
         *     * Rate limits and quotas (`429`) are evaluated before the core is asked to admit anything.
         *
         *     **Long requests.** DIRECT and single-module results are computed inside this HTTP request by the
         *     existing core, bounded by `GRAPH_TIMEOUT_SECONDS` (300 s today). The edge route timeout must exceed
         *     it. A client disconnect does not cancel the work; recover with `getRequestByKey`.
         *
         *     **No exactly-once.** The core commits its claim before any provider call and never re-executes a
         *     crashed or ambiguous claim automatically. A provider may still have been called once for a request
         *     that ends `ambiguous`.
         *
         *     **Authorization recheck.** Membership is checked before the core is called and again immediately
         *     before the response is built. If it was revoked in between, the response is `404` and the started
         *     work continues as the author's own core record; it is not cancelled.
         */
        post: operations["submitMessage"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/threads/{thread_id}/requests/{request_key}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                thread_id: components["parameters"]["ThreadId"];
                request_key: components["parameters"]["RequestKeyPath"];
            };
            cookie?: never;
        };
        /**
         * Recover the state of a request by its client key (author only)
         * @description Recovery entry point when the response of `submitMessage` was lost (network error, timeout, reload,
         *     `503`). Returns the LATEST revision stored for this key, scoped to `created_by = principal`.
         *
         *     * `404 not_found` - there is no caller-visible web row for this key (or the thread is not readable).
         *       This is NOT proof that the core never ran: a deleted web row or an expired receipt may hide it.
         *       Do not blindly resubmit. Recovery is allowed only within the bounded safe admission window below,
         *       with the same key and original payload; web key tombstones survive result/thread deletion.
         *     * `200` - follow `next_action`. `resubmit_same_key` is returned ONLY for a recent `pending`
         *       message after a successful read-only `peek` confirmed no receipt. Revalidate the predicate on POST.
         *     * `503 temporarily_unavailable` - the status could not be read reliably. Nothing changed; re-read
         *       after `Retry-After` with the same key.
         *
         *     **Receipt status check (read-only).** For a revision without a snapshot the server asks the core
         *     through the proposed `ExecutionStore.peek(owner = principal.user_id, request_key)` (README §10.3):
         *     a single SELECT that returns the receipt status (`running`, `completed`, `needs_input`, `ambiguous`)
         *     or "absent", with the same owner, workflow-type and 30-day retention filters as the existing `get`.
         *     It takes no lock, deletes nothing, never claims, never validates or replays a payload and never calls
         *     a model. Mapping:
         *
         *     | core says | `state` | effect |
         *     | --- | --- | --- |
         *     | `completed` / `needs_input` | `completed` / `needs_input` | replay through the existing `ExecutionStore.get`, idempotent snapshot insert |
         *     | `running` | `running` (+ `running_overdue` when past the window) | none |
         *     | `ambiguous` | `ambiguous` | web state set to `ambiguous` (the only path to it) |
         *     | absent + web `pending`, created_at younger than 7d | `pending` + `resubmit_same_key` | safe same-key retry permitted, rechecked on POST |
         *     | absent + old web `pending` (at least 7d) | `expired` (`recovery_window_elapsed`) | no retry; prior execution may have happened |
         *     | absent + previously `running` | `503` or `expired` after recovery window | never regenerate |
         *     | `peek` fails / not deployed | - | `503 temporarily_unavailable`, web state unchanged |
         *
         *     The safe admission predicate is: a reliable `peek` returned absent, the immutable server-side
         *     `thread_messages.created_at` proves `0 <= age < 7 days`, and the web request is still `pending`.
         *     Seven days is strictly shorter than the core receipt retention (30 days); the predicate is checked
         *     again inside the POST admission transaction. After the window closes no `resubmit_same_key` is issued,
         *     even if the same key once produced a completed result whose receipt has now been purged. Missing
         *     status/clock/retention guarantees yield 503 and NO model call. See README §10.4 and golden fixture.
         *
         *     `ambiguous` is NEVER derived from elapsed time, a hung request or a missing heartbeat. If the
         *     snapshot insert fails, its transaction is rolled back, nothing else changed, and the response is
         *     `503 temporarily_unavailable`; the next read retries the same idempotent insert from the same
         *     receipt. Rolling back the `peek` deployment degrades undetermined reads to `503`, never to
         *     `ambiguous` and never to a new model call.
         *
         *     Never generates; never mints a key. Another member's key is `404`, exactly like an unknown key.
         */
        get: operations["getRequestByKey"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/messages/{message_id}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                message_id: components["parameters"]["MessageId"];
            };
            cookie?: never;
        };
        /**
         * Execution state of a request (polling) and its result once durable
         * @description Accepts the id of either message of a request/reply pair. Polling endpoint for `running` requests:
         *     honour `poll_after_ms` (suggested 2 s, then 5 s, then 10 s) and stop on any state whose
         *     `next_action` is not `poll`. There is no SSE or streaming in this contract.
         *
         *     Read path, all read-only towards the core:
         *     1. Project authorization from web tables (membership, role `viewer`); remember `membership_version`.
         *     2. If a snapshot exists, serve it. Otherwise:
         *        * author only - `ExecutionStore.peek(owner = principal, key)` (read-only status, see
         *          `getRequestByKey`) and, for `completed` / `needs_input`, `ExecutionStore.get` to replay the
         *          finished synchronous result. `ambiguous` only when the core receipt says so; never by age;
         *        * any member - delegated read `GraphRunReader.get_for_owner(owner = message.created_by, run_id)`
         *          for a workflow. The owner comes from the verified project mapping, never from the caller.
         *     3. Terminal core state is materialized into an immutable snapshot (idempotent insert).
         *     4. Membership is checked AGAIN immediately before the response is built. If it changed, the payload is
         *        dropped and the response is `404`.
         *
         *     Step 4 means access is verified immediately before response construction and later requests are
         *     denied. It is not a linearizable guarantee: a revocation that commits after step 4 can still race
         *     with delivery of this one response.
         *
         *     `live_run` is a non-durable projection of the running core graph (existing `RunResponse`, partial
         *     accepted research may appear). It is never stored and disappears once the snapshot exists.
         *
         *     A request whose run belongs to another tenant is `404`. A core `run_id` is never an address in
         *     `/v2`: there is no endpoint that takes one.
         */
        get: operations["getMessage"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/messages/{message_id}/result": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                message_id: components["parameters"]["MessageId"];
            };
            cookie?: never;
        };
        /**
         * The durable result snapshot of a request
         * @description Returns the snapshot: immutable `stored` metadata and `provenance`, the computed `presentation`, and
         *     the per-viewer `author`. Read path:
         *
         *     1. **Integrity of the STORED payload** - load the row, recompute
         *        `sha256(canonical_json(stored payload))` and compare with `stored.payload_sha256`. Mismatch is real
         *        damage: `503 result_corrupted`, alert, quarantine. Never regenerated silently. No decoder runs.
         *     2. **Format** - look up the frozen decoder for `(stored.schema_version, result_kind)`. No decoder:
         *        `409 result_format_unsupported`. The data is intact; this is NOT corruption.
         *     3. **Decode + upcast a copy** - run the frozen decoder and the upcaster chain up to the presentation
         *        version of this document. A failure here (hash already verified) is a server defect:
         *        `503 result_unreadable`; the stored row is untouched and nothing is written back.
         *     4. **Viewer projection** - `author` is resolved from `provenance.author_user_id` for the caller.
         *
         *     Because step 1 runs on the stored payload, a result upcast from an older version (presentation hash
         *     != stored hash) is `available`, never `result_corrupted` (golden fixture
         *     `golden/snapshot-upcast-v1-to-v2.json`). Two members reading the same snapshot get identical
         *     `stored`, `provenance` and `presentation` and differ only in `author.is_self`
         *     (`golden/snapshot-two-viewers.json`).
         *
         *     Never calls a model and never reads a core receipt.
         */
        get: operations["getMessageResult"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/messages/{message_id}/mentor": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                message_id: components["parameters"]["MessageId"];
            };
            cookie?: never;
        };
        /**
         * Saved mentor explanation of a completed strategy
         * @description Delegated read of the existing `CaseMentorService.get` with `owner = message.created_by`, after
         *     project authorization and with the same membership recheck as `getMessage`. Applies only to a
         *     request whose result is a `RUN` snapshot in `completed` / `completed_with_limitations`.
         *     `404 mentor_explanation_missing` is returned only to callers who may read the message.
         */
        get: operations["getMentorExplanation"];
        put?: never;
        /**
         * Create (or return) the mentor explanation - author only
         * @description Idempotent: returns the saved explanation if it exists. In the current backend the explanation is
         *     built deterministically from accepted artifacts of the run. Author only, because the mentor
         *     companion record in the core belongs to the creator of the run.
         */
        post: operations["createMentorExplanation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/messages/{message_id}/mentor/questions": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                message_id: components["parameters"]["MessageId"];
            };
            cookie?: never;
        };
        /** History of mentor questions and answers */
        get: operations["listMentorQuestions"];
        put?: never;
        /**
         * Ask the mentor a new question about a saved result - author only
         * @description Calls a model. Idempotent by the client `request_key` (existing mentor contract): the same key and
         *     question replays the saved answer; the same key with another question is `409 request_conflict`.
         *     An unknown provider outcome is never re-run automatically: the key keeps answering
         *     `503 temporarily_unavailable` and the user may ask again with a new key.
         *     Rate limits and quotas are evaluated before the model is called.
         */
        post: operations["askMentorQuestion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/threads/{thread_id}/chat-messages": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                thread_id: components["parameters"]["ThreadId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * FUTURE - send a free-form chat message to a `chat` thread
         * @description Not part of the internal technical beta; a release gate of the public launch (B9/F7, gates G1-G7).
         *     While `WEB_CHAT_ENABLED` is off the route answers `403 feature_disabled`.
         *
         *     Design constraints this contract reserves (no Telegram logic changes):
         *     * **Separate scope** - chat memory key `web:t:<thread_id>`, outside the Telegram `tg:<id>` space; the
         *       legacy `/chat/message`, `ChatExecutionService`, `conversations` and `messages` are not used.
         *     * **Separate receipt** - `web_chat_execution.v1` in the web layer: claim before the model call,
         *       `ambiguous` on unknown outcome, a running claim is never stolen.
         *     * **Serialized execution per thread** - a request_key receipt only deduplicates the SAME request. Two
         *       different messages in one thread are serialized by the thread's single in-flight slot plus
         *       `expected_last_seq` (`409 thread_busy` / `409 stale_thread`). No SQL transaction stays open during
         *       the model call.
         *     * **No duplicated memory** - the user turn, the reply and context/facts updates are buffered and
         *       committed in the same transaction as the reply snapshot. An `ambiguous` or failed attempt commits
         *       nothing to chat memory, so a retry with a new key does not duplicate context.
         *     * **Model usage limits** - input at most 4000 characters, bounded output tokens, per-user and
         *       per-organization daily caps evaluated BEFORE the claim (`429 quota_exceeded`), no image generation.
         *     * The browser receives the allowlisted `WebChatReply` only; the legacy `debug` field never leaves the
         *       backend.
         */
        post: operations["submitChatMessage"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /**
         * @description Version of the Web API v2 response envelope. Embedded core payloads keep their own `schema_version`.
         * @constant
         */
        SchemaVersion: "web_api.v2";
        /**
         * Format: date-time
         * @description RFC 3339 timestamp with an explicit UTC offset.
         */
        Timestamp: string;
        Sha256Hex: string;
        /**
         * @description Client-generated idempotency key: the literal prefix `w-` followed by a lowercase UUIDv7. The prefix
         *     keeps web keys disjoint from bot keys (`tg:<actor>:<chat>:<message>`); the value satisfies the
         *     existing core pattern `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$`. Keys live in the namespace of the
         *     authenticated user and are never reused, also not after receipt expiry.
         * @example w-01939f6c-8a10-7c3e-9b1a-4d5e6f708192
         */
        RequestKey: string;
        /**
         * @description Allowlisted error codes. The HTTP status, retry policy and meaning of each code are in the root
         *     `x-error-catalog`. Codes marked EXISTING there come from `copilot_api.v1` and keep their meaning.
         *     The legacy Telegram code `stale_context` (bound to a Telegram chat context version) cannot occur on
         *     `/v2`, because the web layer always calls the core with `context_version = None`.
         *     The core code `execution_invalid` (HTTP 500 in `copilot_api.v1`) is not exposed either: after it the
         *     core receipt is `ambiguous`, which `/v2` reports as the durable state `ambiguous`, not as an error.
         * @enum {string}
         */
        ErrorCode: "unauthenticated" | "login_token_invalid" | "csrf_failed" | "forbidden" | "feature_disabled" | "not_found" | "mentor_explanation_missing" | "request_conflict" | "revision_conflict" | "thread_busy" | "stale_thread" | "stale_project" | "idempotency_conflict" | "confirmation_changed" | "confirmation_unavailable" | "telegram_identity_required" | "import_source_missing" | "mentor_not_applicable" | "result_not_ready" | "result_format_unsupported" | "result_gone" | "payload_too_large" | "invalid_request" | "invalid_confirmation" | "rate_limited" | "quota_exceeded" | "temporarily_unavailable" | "result_corrupted" | "result_unreadable";
        /**
         * @description The only error body of `/v2`. It never echoes submitted values and has no free-text message: the UI
         *     maps `code` to localized text. `owned_site` mirrors the existing `copilot_api.v1` error field and is
         *     present only for owned-site confirmation errors.
         */
        ErrorResponse: {
            schema_version: components["schemas"]["SchemaVersion"];
            /** @constant */
            kind: "ERROR";
            code: components["schemas"]["ErrorCode"];
            /** @description Server correlation id for support. Contains no user data. */
            request_id: string;
            /** @description Mirror of the `Retry-After` header when the request may be repeated unchanged. No upper bound. */
            retry_after_seconds?: number | null;
            owned_site?: components["schemas"]["OwnedSiteResult"] | null;
            /** @description Present only with `quota_exceeded`. */
            quota?: components["schemas"]["QuotaInfo"] | null;
        };
        /**
         * @description Which usage cap was hit and when it resets. `resets_at` is authoritative (server clock); the numeric
         *     caps and the reset boundary (fixed UTC day vs rolling 24 h) are open decision OQ-6, so clients must
         *     not assume either and must not display a computed countdown that disagrees with `resets_at`.
         */
        QuotaInfo: {
            /** @enum {string} */
            scope: "user" | "organization";
            /** @enum {string} */
            window: "day";
            resets_at: components["schemas"]["Timestamp"];
        };
        /**
         * @description Organization-level role. `owner` > `editor` > `viewer`. There are no project-level roles in this
         *     contract. "author" in `x-min-role` means `message.created_by == principal` AND role `editor` or higher.
         * @enum {string}
         */
        Role: "owner" | "editor" | "viewer";
        /**
         * @description Minimal reference to a user inside a tenant, COMPUTED for the current caller on every response.
         *     Never persisted, never hashed, never part of an immutable record: persisted records store only the
         *     stable `users.id` (for example `SnapshotProvenance.author_user_id`). `display_name` is the user's
         *     CURRENT name and `is_self` is `id == principal.user_id`, so two viewers of the same record can receive
         *     different `is_self` values (see fixture `golden/snapshot-two-viewers.json`). Never contains a Telegram
         *     identifier or e-mail.
         */
        UserRef: {
            /** @description Internal `users.id` (the single principal for web and Telegram). */
            id: number;
            /** @description Current display name at response time; may change. */
            display_name: string | null;
            /** @description True when this user is the caller of THIS request. Viewer-relative. */
            is_self: boolean;
        };
        TelegramExchangeRequest: {
            /** @description One-time login token taken from the URL fragment. Never logged, never placed in a query string. */
            token: string;
        };
        CsrfToken: {
            schema_version: components["schemas"]["SchemaVersion"];
            csrf_token: string;
        };
        AuthSession: {
            schema_version: components["schemas"]["SchemaVersion"];
            csrf_token: string;
            me: components["schemas"]["Me"];
        };
        Me: {
            schema_version: components["schemas"]["SchemaVersion"];
            user: components["schemas"]["User"];
            identities: components["schemas"]["Identity"][];
            /** @description Active memberships only. Internal beta - exactly one personal organization. */
            memberships: components["schemas"]["OrganizationMembership"][];
            session: components["schemas"]["SessionInfo"];
            features: components["schemas"]["Features"];
        };
        /**
         * @description `users.id` is the single internal principal for both channels (D2). `users.telegram_id` becomes
         *     nullable; a web-only user never gets an invented Telegram id. Telegram ids are not exposed here.
         */
        User: {
            id: number;
            display_name: string | null;
            created_at: components["schemas"]["Timestamp"];
        };
        /** @description One row of `external_identities`. The provider subject (Telegram id, e-mail, OIDC sub) is not returned. */
        Identity: {
            /**
             * @description Internal beta issues only `telegram`. `email` and `oidc` are reserved for B2e and later.
             * @enum {string}
             */
            provider: "telegram" | "email" | "oidc";
            linked_at: components["schemas"]["Timestamp"];
        };
        SessionInfo: {
            issued_at: components["schemas"]["Timestamp"];
            idle_expires_at: components["schemas"]["Timestamp"];
            absolute_expires_at: components["schemas"]["Timestamp"];
        };
        /**
         * @description Server-evaluated capability flags for this principal. The UI must not present a capability as
         *     working when its flag is false. Capability matrix - README, "Capability matrix".
         */
        Features: {
            /** @description Structured Copilot scenarios (strategy, competitor/positioning, calculation). */
            copilot_requests: boolean;
            mentor: boolean;
            /** @description True only when the principal has a Telegram identity and B11 is enabled. */
            telegram_history: boolean;
            /** @description `WEB_CHAT_ENABLED`. False in the internal technical beta. */
            web_chat: boolean;
            /** @description B10. False in the internal technical beta. */
            team_organizations: boolean;
            /** @description `WEB_EMAIL_LOGIN_ENABLED` (B2e). False in the internal technical beta. */
            email_login: boolean;
            /** @description `WEB_BRAND_REIMPORT_ENABLED`. False until OQ-1 is decided. */
            brand_reimport: boolean;
            /** @description Always false in this contract; the Documents section stays mock-only. */
            documents: boolean;
        };
        Organization: {
            /** Format: uuid */
            id: string;
            name: string;
            /** @enum {string} */
            kind: "personal" | "team";
            created_at: components["schemas"]["Timestamp"];
        };
        /**
         * @description An ACTIVE row of `memberships` (`revoked_at IS NULL`). `memberships.version` is internal: it is
         *     incremented on every role change or revocation and is used for the access recheck; it is not exposed.
         */
        OrganizationMembership: {
            organization: components["schemas"]["Organization"];
            role: components["schemas"]["Role"];
            joined_at: components["schemas"]["Timestamp"];
        };
        OrganizationList: {
            schema_version: components["schemas"]["SchemaVersion"];
            items: components["schemas"]["OrganizationMembership"][];
        };
        /** @enum {string} */
        ProjectStatus: "active" | "draft" | "archived";
        /**
         * @description UI accent only. Stored on `projects`, never part of the model context.
         * @enum {string}
         */
        ProjectColor: "teal" | "violet" | "coral" | "amber" | "blue" | "green";
        /** @description Server-computed for the caller. The UI renders from these and still handles `403`. */
        ProjectPermissions: {
            can_edit: boolean;
            can_submit: boolean;
            can_import_telegram_brand: boolean;
        };
        /**
         * @description A SaaS project. It belongs to exactly one organization (`org_id`) for its whole life; ownership is the
         *     organization's, not the creator's. NOT the legacy Telegram "projects" (history navigation).
         */
        Project: {
            schema_version: components["schemas"]["SchemaVersion"];
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            org_id: string;
            name: string;
            status: components["schemas"]["ProjectStatus"];
            color: components["schemas"]["ProjectColor"] | null;
            /** @description Optimistic concurrency token of the project row. */
            version: number;
            role: components["schemas"]["Role"];
            permissions: components["schemas"]["ProjectPermissions"];
            created_by: components["schemas"]["UserRef"];
            created_at: components["schemas"]["Timestamp"];
            updated_at: components["schemas"]["Timestamp"];
            brand: components["schemas"]["ProjectBrand"];
        };
        ProjectList: {
            schema_version: components["schemas"]["SchemaVersion"];
            items: components["schemas"]["Project"][];
            next_cursor: string | null;
        };
        ProjectCreate: {
            name: string;
            /**
             * @default active
             * @enum {string}
             */
            status: "active" | "draft";
            color?: components["schemas"]["ProjectColor"] | null;
            brand?: components["schemas"]["ProjectBrandFields"];
        };
        ProjectPatch: {
            expected_version: number;
            name?: string;
            status?: components["schemas"]["ProjectStatus"];
            color?: components["schemas"]["ProjectColor"] | null;
        };
        /**
         * @description Allowlisted keys stored in `project_brands.extra_json`. No other key is accepted or returned.
         *
         *     * `industry`, `usp`, `competitors` - descriptive UI fields. The existing `brand_entries` mapping does
         *       not pass them to the model today.
         *     * `customer_job_or_need`, `relevant_alternative`, `product_truth`, `existing_proof`, `geography`,
         *       `economics` - scalar business fields the existing `brand_entries` mapping DOES pass to the core as
         *       brand-layer context when present. `product_truth` is an owner attestation: set it only from an
         *       explicit user statement, never from scraped or generated text.
         */
        BrandExtra: {
            industry?: string | null;
            usp?: string | null;
            competitors?: string[] | null;
            customer_job_or_need?: string | null;
            relevant_alternative?: string | null;
            product_truth?: string | null;
            existing_proof?: string | null;
            geography?: string | null;
            economics?: string | null;
        };
        /**
         * @description Editable brand fields. Names and types of the first six mirror the existing `BrandProfile` columns so
         *     the existing pure functions (`to_context`, `brand_entries`) work unchanged through an adapter.
         *     Bounds follow what `brand_entries` accepts today (text up to 4000 characters, at most 10 goals).
         */
        ProjectBrandFields: {
            brand_name?: string | null;
            product_description?: string | null;
            audience?: string | null;
            tone?: string | null;
            goals?: string[] | null;
            channels?: string[] | null;
            extra?: components["schemas"]["BrandExtra"];
        };
        /** @description Provenance of the last copy from the legacy Telegram profile. The legacy row id is not exposed. */
        BrandImportProvenance: {
            /** @constant */
            source: "telegram_brand_profile";
            imported_at: components["schemas"]["Timestamp"];
            imported_by: components["schemas"]["UserRef"];
        };
        /**
         * @description The single `project_brands` row of a project (exactly one per project, cascade-deleted with it).
         *     A separate table: the legacy `brand_profiles` table, its `UNIQUE(user_id)` and
         *     `User.brand_profile` keep their current ORM semantics and are used by Telegram only.
         */
        ProjectBrand: {
            schema_version: components["schemas"]["SchemaVersion"];
            /** Format: uuid */
            project_id: string;
            /** @description Optimistic concurrency token of the brand row. */
            version: number;
            brand_name: string | null;
            product_description: string | null;
            audience: string | null;
            tone: string | null;
            goals: string[];
            channels: string[];
            extra: components["schemas"]["BrandExtra"];
            imported_from: components["schemas"]["BrandImportProvenance"] | null;
            updated_at: components["schemas"]["Timestamp"];
            updated_by: components["schemas"]["UserRef"] | null;
        };
        /** @description Omitted = unchanged, `null` = cleared. `extra` is merged key by key. */
        ProjectBrandPatch: {
            expected_version: number;
            brand_name?: string | null;
            product_description?: string | null;
            audience?: string | null;
            tone?: string | null;
            goals?: string[] | null;
            channels?: string[] | null;
            extra?: components["schemas"]["BrandExtra"];
        };
        BrandImportRequest: {
            expected_version: number;
            /**
             * @description Literal `true`. The caller acknowledges that the current brand fields are replaced by the copy.
             * @constant
             */
            confirm_overwrite: true;
        };
        /**
         * @description `copilot` - structured Copilot requests (internal beta). `chat` - FUTURE web chat (B9).
         * @enum {string}
         */
        ThreadKind: "copilot" | "chat";
        /**
         * @description State of one request revision (`thread_messages.state`). The core is authoritative until a snapshot
         *     exists; afterwards the snapshot is.
         *
         *     | state | meaning | durable result |
         *     | --- | --- | --- |
         *     | `pending` | Stored web request with no core receipt (verified absent) within the 7-day safe retry window. | no |
         *     | `running` | The core reports the receipt or graph run as running. Stays `running` however long it takes; age is surfaced only as the hint `MessageResult.running_overdue`. | no |
         *     | `needs_input` | Core asked for clarification. Terminal for THIS revision; answer with revision + 1 and the same key. | `NEEDS_INPUT` |
         *     | `completed` | Finished. | `DIRECT_RESULT`, `MODULE_RESULT` or `RUN` |
         *     | `completed_with_limitations` | Workflow finished with optional parts missing. | `RUN` |
         *     | `blocked` | Workflow needs context or an accessible source. | `RUN` with `failure` |
         *     | `failed` | Workflow failed. | `RUN` with `failure` |
         *     | `ambiguous` | The core receipt itself recorded an unknown outcome (core status `ambiguous`, read through the read-only `ExecutionStore.peek`). NEVER inferred from elapsed time. Never re-executed automatically. | none |
         *     | `expired` | No retrievable result under this key (receipt absent, no snapshot, retry window closed); prior model execution cannot be ruled out. Never regenerated. | none |
         *     | `unsupported` | The core classified the request as free conversation and web chat is disabled. | `UNSUPPORTED` |
         *
         *     "Temporarily unavailable" is deliberately NOT a state: when the server cannot read the core status
         *     reliably (`peek` unavailable, database or core outage) it answers `503 temporarily_unavailable` and
         *     leaves the stored state unchanged. The client keeps the same key, re-reads after `Retry-After`, shows
         *     "status temporarily unavailable" and never starts a model call by itself.
         * @enum {string}
         */
        ExecutionState: "pending" | "running" | "needs_input" | "completed" | "completed_with_limitations" | "blocked" | "failed" | "ambiguous" | "expired" | "unsupported";
        /**
         * @description Detail for `expired`. `receipt_expired` - the core receipt passed its 30-day retention before a
         *     result snapshot could be materialized. `recovery_window_elapsed` - a pending web request is older
         *     than the seven-day safe recovery window and `peek` returned absent. This does NOT prove whether a
         *     model call happened; the same key is fenced against re-admission by the web layer. `never_admitted`
         *     is reserved for an explicit durable pre-claim abort record, NOT inferred from missing receipt or age.
         *     The window uses the immutable server-side `thread_messages.created_at` and never resets on refresh.
         * @enum {string|null}
         */
        StateReason: "receipt_expired" | "recovery_window_elapsed" | "never_admitted" | null;
        /**
         * @description Server-authoritative instruction for the CALLER; the client does not re-derive the state machine.
         *
         *     * `none` - nothing to do.
         *     * `poll` - call `getMessage` again after `poll_after_ms`.
         *     * `resubmit_same_key` - author only, and ONLY while the web `pending` request is under 7 days old,
         *       after a successful `peek` found no receipt; POST rechecks before calling the core. Never use for
         *       an expired receipt.
         *     * `answer_clarification` - author only: submit revision + 1 with the same key and added context.
         *     * `start_new_request` - nothing more can happen under this key. A new request needs a NEW key and an
         *       explicit user action, with a visible note that it may generate again.
         *     * `wait_for_author` - the caller is not the author; only the author can move this request forward.
         * @enum {string}
         */
        NextAction: "none" | "poll" | "resubmit_same_key" | "answer_clarification" | "start_new_request" | "wait_for_author";
        /** @description The request that holds the thread's single execution slot. */
        InFlightRef: {
            /** Format: uuid */
            message_id: string;
            request_key: components["schemas"]["RequestKey"];
            revision: number;
            /** @enum {string} */
            state: "pending" | "running";
            started_at: components["schemas"]["Timestamp"];
        };
        ThreadPermissions: {
            /** @description Role allows it, the thread kind is enabled and no other request is in flight. */
            can_submit: boolean;
            can_remove: boolean;
        };
        /**
         * @description A project-scoped container (`workspace_threads`). `org_id` / `project_id` never change. Threads,
         *     messages and snapshots are PROJECT material; the core records they point to stay owned by the author.
         */
        Thread: {
            schema_version: components["schemas"]["SchemaVersion"];
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            org_id: string;
            /** Format: uuid */
            project_id: string;
            kind: components["schemas"]["ThreadKind"];
            title: string;
            created_by: components["schemas"]["UserRef"];
            created_at: components["schemas"]["Timestamp"];
            updated_at: components["schemas"]["Timestamp"];
            /** Format: int64 */
            last_seq: number;
            in_flight: components["schemas"]["InFlightRef"] | null;
            permissions: components["schemas"]["ThreadPermissions"];
        };
        ThreadCreate: {
            kind: components["schemas"]["ThreadKind"];
            /** @description Optional. Without it the server derives a bounded title from the first message. */
            title?: string;
        };
        ThreadList: {
            schema_version: components["schemas"]["SchemaVersion"];
            items: components["schemas"]["Thread"][];
            next_cursor: string | null;
        };
        /**
         * @description `request_key` + `revision` plus the fields of the existing `ExecuteRequest` (same names, types and
         *     bounds). Differences from `copilot_api.v1`: there is no `context_version` (a Telegram chat concept;
         *     the web layer always passes `None`), `request_key` is restricted to the web format, and `revision`
         *     is new. Extra fields are rejected. Serialized body budget 128 KiB (existing DTO budget).
         */
        SubmitMessageRequest: {
            request_key: components["schemas"]["RequestKey"];
            /** @description 1 for a new request; previous + 1 when answering `needs_input` under the same key. */
            revision: number;
            /** @description Must contain a non-blank character. Unchanged across revisions. */
            message: string;
            context?: components["schemas"]["BusinessContext"];
            owned_site_url?: string | null;
            competitor_urls?: string[];
            market_source_urls?: string[];
            market_sources?: components["schemas"]["MarketSource"][];
            /** @description Requires `owned_site_url` (existing rule). */
            confirmation?: components["schemas"]["Confirmation"] | null;
        };
        /**
         * @description The accepted request exactly as submitted (without `request_key` / `revision`): fields the client
         *     omitted stay omitted, because "omitted" and "explicitly empty" differ in the core's precedence rules
         *     and in the payload fingerprint. Lets any device rebuild the identical payload for a safe resubmit or
         *     extend it for a clarification. Visible to every member who can read the thread: what is submitted to
         *     a project thread is project material.
         */
        SubmittedInput: {
            message: string;
            context?: components["schemas"]["BusinessContext"];
            owned_site_url?: string | null;
            competitor_urls?: string[];
            market_source_urls?: string[];
            market_sources?: components["schemas"]["MarketSource"][];
            confirmation?: components["schemas"]["Confirmation"] | null;
        };
        /** @description One request revision (`thread_messages`, role `user`). Unique per `(created_by, request_key, revision)`. */
        UserMessage: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            thread_id: string;
            /** Format: int64 */
            seq: number;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            role: "user";
            created_at: components["schemas"]["Timestamp"];
            author: components["schemas"]["UserRef"];
            request_key: components["schemas"]["RequestKey"];
            revision: number;
            is_latest_revision: boolean;
            /** @description The user's message text (equals `input.message` in Copilot threads). */
            text: string;
            /** @description Null only in FUTURE chat threads. */
            input: components["schemas"]["SubmittedInput"] | null;
            state: components["schemas"]["ExecutionState"];
            state_reason: components["schemas"]["StateReason"];
        };
        /**
         * @description Whether the stored snapshot can be presented.
         *     `available` - `result` is present. `corrupted` - integrity hash mismatch (data damage).
         *     `format_unsupported` - intact, but no decoder for its `schema_version` (compatibility, not damage).
         *     `unreadable` - intact, decoder defect on the server.
         * @enum {string}
         */
        ResultStatus: "available" | "corrupted" | "format_unsupported" | "unreadable";
        /** @description The reply to one request revision (`thread_messages`, role `assistant`); exists only together with a snapshot. */
        AssistantMessage: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            thread_id: string;
            /** Format: int64 */
            seq: number;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            role: "assistant";
            created_at: components["schemas"]["Timestamp"];
            /**
             * Format: uuid
             * @description Id of the user message this replies to.
             */
            reply_to: string;
            request_key: components["schemas"]["RequestKey"];
            revision: number;
            result_status: components["schemas"]["ResultStatus"];
            /** @description Present exactly when `result_status` is `available`. */
            result: components["schemas"]["ResultSnapshot"] | null;
        };
        ThreadMessage: components["schemas"]["UserMessage"] | components["schemas"]["AssistantMessage"];
        ThreadMessagesPage: {
            schema_version: components["schemas"]["SchemaVersion"];
            thread: components["schemas"]["Thread"];
            /** @description Ascending by `seq`. */
            items: components["schemas"]["ThreadMessage"][];
            /**
             * Format: int64
             * @description Pass as `before_seq` to load older messages; null when the first message is included.
             */
            prev_before_seq: number | null;
        };
        /**
         * @description A request revision, its execution state and, once durable, its reply. Returned by `submitMessage`,
         *     `getRequestByKey` and `getMessage`. `state` always equals `user_message.state`.
         */
        MessageResult: {
            schema_version: components["schemas"]["SchemaVersion"];
            /** Format: uuid */
            thread_id: string;
            /** Format: uuid */
            project_id: string;
            state: components["schemas"]["ExecutionState"];
            next_action: components["schemas"]["NextAction"];
            /** @description Non-null exactly when `next_action` is `poll`. */
            poll_after_ms: number | null;
            /**
             * @description UI hint only. True when `state` is `running` and the core still reports it running past the
             *     expected completion window (synchronous calls: `GRAPH_TIMEOUT_SECONDS` plus margin). It changes
             *     nothing: the state stays `running`, `next_action` stays `poll`, no model call is made and no key
             *     is minted. The UI shows "result not determined yet" and may offer the explicit, warned
             *     "start a new request" action. Always false for other states.
             */
            running_overdue: boolean;
            user_message: components["schemas"]["UserMessage"];
            assistant_message: components["schemas"]["AssistantMessage"] | null;
            /**
             * @description NON-DURABLE projection of a running workflow (existing `RunResponse`). Only while `state` is
             *     `running` and the core record is a graph run; null otherwise. Never stored by the web layer.
             */
            live_run: components["schemas"]["RunResponse"] | null;
        };
        /**
         * @description Where the snapshot came from. IMMUTABLE: every field is a column of the INSERT-only `result_snapshots`
         *     row, written once at materialization and identical for every viewer. It contains no viewer-relative
         *     and no mutable data: the author is the stable `users.id` (`author_user_id`), never a display name or
         *     an `is_self` flag (see `ResultSnapshot.author` for the per-viewer projection).
         *
         *     Provenance is protected by the INSERT-only rule, not by `stored.payload_sha256`, which covers the
         *     stored payload only. The core receipt id is internal and not exposed. `run_id` is present for graph
         *     runs only; it is an identifier for support, never an address in this API.
         */
        SnapshotProvenance: {
            /**
             * @description `receipt` - synchronous core receipt. `graph_run` - core workflow run. `web_chat_receipt` - FUTURE.
             * @enum {string}
             */
            source_kind: "receipt" | "graph_run" | "web_chat_receipt";
            run_id: components["schemas"]["Sha256Hex"] | null;
            request_key: components["schemas"]["RequestKey"];
            revision: number;
            /** @description Stable `users.id` of the request author (`thread_messages.created_by`). Never changes. */
            author_user_id: number;
            /** @description When the core finished, if known. */
            source_completed_at: components["schemas"]["Timestamp"] | null;
            materialized_at: components["schemas"]["Timestamp"];
        };
        /**
         * @description Contract version of a STORED payload, fixed at write time (`<contract>.v<n>`). Informational for
         *     clients: the set grows whenever a backend DTO evolves (old rows keep their version forever), so it is
         *     a pattern, not an enum. The server picks the frozen decoder by `(stored.schema_version, result_kind)`.
         * @example copilot_api.v1
         * @example web_api.v2
         */
        StoredSchemaVersion: string;
        /**
         * @description Metadata of the payload EXACTLY AS PERSISTED in `result_snapshots` (PostgreSQL). Written once, never
         *     updated, never rewritten by an upcaster or a migration.
         *
         *     * `schema_version` - version of the stored DTO (write time).
         *     * `payload_sha256` - `sha256` of the canonical JSON of the STORED payload (UTF-8, keys sorted,
         *       separators `,` and `:`, no ASCII escaping, no NaN/Infinity). Computed once at write time; verified
         *       by the server on every read against the stored payload BEFORE any decoder or upcaster runs.
         *     * `writer_version` - backend build that wrote the row.
         *
         *     The hash is NOT a checksum of `presentation.payload`. It equals
         *     `sha256(canonical(presentation.payload))` exactly when `presentation.upcasters` is empty (the stored
         *     payload is then presented verbatim); after a non-identity upcast the two differ by design and that is
         *     never `result_corrupted`. The stored payload itself is not returned when it differs from the
         *     presentation: integrity verification is a server-side duty.
         */
        StoredResult: {
            schema_version: components["schemas"]["StoredSchemaVersion"];
            payload_sha256: components["schemas"]["Sha256Hex"];
            writer_version: string;
        };
        /**
         * @description Ids of the pure upcaster functions applied in order, `<from>-><to>/<result_kind>`. Empty means
         *     `presentation.schema_version == stored.schema_version` and the stored payload is presented verbatim.
         *     Upcasters take a copy of the stored payload and never write back.
         */
        Upcasters: string[];
        /**
         * @description A durable result as returned to the caller. It joins three things with different lifetimes:
         *
         *     | part | lifetime | hashed | same for every viewer |
         *     | --- | --- | --- | --- |
         *     | `stored` + `provenance` | immutable row of `result_snapshots` (INSERT-only) | `stored.payload_sha256` covers the stored payload | yes |
         *     | `presentation` | computed on every read: frozen decoder of `stored.schema_version` + upcaster chain | no | yes |
         *     | `author` | computed on every read for the current caller | no | no (`is_self`) |
         *
         *     Read path (`getMessageResult`, `listThreadMessages`, `getMessage`):
         *     1. Integrity on the STORED payload: `sha256(canonical(stored payload)) == stored.payload_sha256`,
         *        otherwise `result_corrupted`. Nothing else runs.
         *     2. Format: a frozen decoder for `(stored.schema_version, result_kind)` must exist, otherwise
         *        `result_format_unsupported` (intact data, not corruption).
         *     3. Decode a COPY and run the upcaster chain up to the presentation version declared for this
         *        `result_kind` in this document. A failure here is `result_unreadable`. The stored row is untouched.
         *
         *     `presentation.schema_version` is the version clients are typed against (today `copilot_api.v1` for
         *     every Copilot kind). Introducing a newer presentation version is a change of THIS document (new
         *     presentation schema + regenerated client types); stored rows are never migrated.
         */
        ResultSnapshot: components["schemas"]["DirectResultSnapshot"] | components["schemas"]["ModuleResultSnapshot"] | components["schemas"]["NeedsInputSnapshot"] | components["schemas"]["RunSnapshot"] | components["schemas"]["UnsupportedSnapshot"] | components["schemas"]["ChatReplySnapshot"];
        DirectResultSnapshot: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            message_id: string;
            /** @constant */
            envelope_version: 1;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            result_kind: "DIRECT_RESULT";
            stored: components["schemas"]["StoredResult"];
            provenance: components["schemas"]["SnapshotProvenance"];
            author: components["schemas"]["UserRef"];
            presentation: components["schemas"]["DirectResultPresentation"];
        };
        /**
         * @description `DIRECT_RESULT` payload as presented by this API version: `copilot_api.v1`. Computed on every read from the
         *     stored payload by the frozen decoder of `stored.schema_version` plus `upcasters`; never persisted.
         */
        DirectResultPresentation: {
            /** @constant */
            schema_version: "copilot_api.v1";
            /** @description Frozen decoder that read the stored payload, `<stored.schema_version>/<result_kind>`. Diagnostic. */
            decoder: string;
            upcasters: components["schemas"]["Upcasters"];
            payload: components["schemas"]["DirectResponse"];
        };
        ModuleResultSnapshot: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            message_id: string;
            /** @constant */
            envelope_version: 1;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            result_kind: "MODULE_RESULT";
            stored: components["schemas"]["StoredResult"];
            provenance: components["schemas"]["SnapshotProvenance"];
            author: components["schemas"]["UserRef"];
            presentation: components["schemas"]["ModuleResultPresentation"];
        };
        /**
         * @description `MODULE_RESULT` payload as presented by this API version: `copilot_api.v1`. Computed on every read from the
         *     stored payload by the frozen decoder of `stored.schema_version` plus `upcasters`; never persisted.
         */
        ModuleResultPresentation: {
            /** @constant */
            schema_version: "copilot_api.v1";
            /** @description Frozen decoder that read the stored payload, `<stored.schema_version>/<result_kind>`. Diagnostic. */
            decoder: string;
            upcasters: components["schemas"]["Upcasters"];
            payload: components["schemas"]["ModuleResponse"];
        };
        /**
         * @description Stored immediately, because the core receipt is OVERWRITTEN when the clarification revision is
         *     admitted; without this snapshot the question would be lost.
         */
        NeedsInputSnapshot: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            message_id: string;
            /** @constant */
            envelope_version: 1;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            result_kind: "NEEDS_INPUT";
            stored: components["schemas"]["StoredResult"];
            provenance: components["schemas"]["SnapshotProvenance"];
            author: components["schemas"]["UserRef"];
            presentation: components["schemas"]["NeedsInputPresentation"];
        };
        /**
         * @description `NEEDS_INPUT` payload as presented by this API version: `copilot_api.v1`. Computed on every read from the
         *     stored payload by the frozen decoder of `stored.schema_version` plus `upcasters`; never persisted.
         */
        NeedsInputPresentation: {
            /** @constant */
            schema_version: "copilot_api.v1";
            /** @description Frozen decoder that read the stored payload, `<stored.schema_version>/<result_kind>`. Diagnostic. */
            decoder: string;
            upcasters: components["schemas"]["Upcasters"];
            payload: components["schemas"]["NeedsInputResponse"];
        };
        /** @description Written once when the workflow reaches a terminal status (`COMPLETED`, `COMPLETED_WITH_LIMITATIONS`, `BLOCKED`, `FAILED`). */
        RunSnapshot: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            message_id: string;
            /** @constant */
            envelope_version: 1;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            result_kind: "RUN";
            stored: components["schemas"]["StoredResult"];
            provenance: components["schemas"]["SnapshotProvenance"];
            author: components["schemas"]["UserRef"];
            presentation: components["schemas"]["RunPresentation"];
        };
        /**
         * @description `RUN` payload as presented by this API version: `copilot_api.v1`. Computed on every read from the
         *     stored payload by the frozen decoder of `stored.schema_version` plus `upcasters`; never persisted.
         */
        RunPresentation: {
            /** @constant */
            schema_version: "copilot_api.v1";
            /** @description Frozen decoder that read the stored payload, `<stored.schema_version>/<result_kind>`. Diagnostic. */
            decoder: string;
            upcasters: components["schemas"]["Upcasters"];
            payload: components["schemas"]["RunResponse"];
        };
        UnsupportedSnapshot: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            message_id: string;
            /** @constant */
            envelope_version: 1;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            result_kind: "UNSUPPORTED";
            stored: components["schemas"]["StoredResult"];
            provenance: components["schemas"]["SnapshotProvenance"];
            author: components["schemas"]["UserRef"];
            presentation: components["schemas"]["UnsupportedPresentation"];
        };
        /**
         * @description `UNSUPPORTED` payload as presented by this API version: `web_api.v2`. Computed on every read from the
         *     stored payload by the frozen decoder of `stored.schema_version` plus `upcasters`; never persisted.
         */
        UnsupportedPresentation: {
            /** @constant */
            schema_version: "web_api.v2";
            /** @description Frozen decoder that read the stored payload, `<stored.schema_version>/<result_kind>`. Diagnostic. */
            decoder: string;
            upcasters: components["schemas"]["Upcasters"];
            payload: components["schemas"]["UnsupportedResult"];
        };
        /** @description FUTURE (B9). Reserved so that adding web chat does not change the envelope. */
        ChatReplySnapshot: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            message_id: string;
            /** @constant */
            envelope_version: 1;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            result_kind: "CHAT_REPLY";
            stored: components["schemas"]["StoredResult"];
            provenance: components["schemas"]["SnapshotProvenance"];
            author: components["schemas"]["UserRef"];
            presentation: components["schemas"]["ChatReplyPresentation"];
        };
        /**
         * @description `CHAT_REPLY` payload as presented by this API version: `web_chat.v1`. Computed on every read from the
         *     stored payload by the frozen decoder of `stored.schema_version` plus `upcasters`; never persisted.
         */
        ChatReplyPresentation: {
            /** @constant */
            schema_version: "web_chat.v1";
            /** @description Frozen decoder that read the stored payload, `<stored.schema_version>/<result_kind>`. Diagnostic. */
            decoder: string;
            upcasters: components["schemas"]["Upcasters"];
            payload: components["schemas"]["WebChatReply"];
        };
        /**
         * @description Honest terminal answer when the core returns the existing `CONVERSATION` delegation
         *     (`delegate: legacy_chat`) and web chat is disabled. The web layer does NOT call the Telegram chat.
         *     The UI shows its own localized text and scenario suggestions; no text is stored here.
         */
        UnsupportedResult: {
            schema_version: components["schemas"]["SchemaVersion"];
            /** @constant */
            kind: "UNSUPPORTED";
            /** @enum {string} */
            reason: "conversation_not_available";
        };
        SubmitChatMessageRequest: {
            request_key: components["schemas"]["RequestKey"];
            text: string;
            /**
             * Format: int64
             * @description `Thread.last_seq` the client composed against. A mismatch is `409 stale_thread`.
             */
            expected_last_seq: number;
        };
        /**
         * @description Draft of `web_chat.v1`. An allowlisted projection of the existing `ChatMessageResponse`: `reply` and
         *     `follow_up_question` only. `debug` and `image` are never exposed. The legacy untyped `actions` list
         *     is intentionally not mapped until B9 defines a typed shape.
         */
        WebChatReply: {
            /** @constant */
            schema_version: "web_chat.v1";
            /** @constant */
            kind: "CHAT_REPLY";
            reply: string;
            follow_up_question: string | null;
        };
        /** @description Typed explicit business context. Explicit values, including empty/null masks, outrank the brand. */
        BusinessContext: {
            business_goal?: string | null;
            product?: string | null;
            target?: string | null;
            customer_job_or_need?: string | null;
            relevant_alternative?: string | null;
            product_truth?: string | null;
            existing_proof?: string | null;
            geography?: string | null;
            economics?: string | null;
            message?: string | null;
            tone?: string | null;
        };
        MarketSource: {
            title: string;
            excerpt: string;
        };
        /** @description Explicit attestation of owned-site statements. `statement_ids` must be unique. */
        Confirmation: {
            snapshot_id: string;
            statement_ids: string[];
            /** @constant */
            confirmed: true;
            reference: string;
        };
        ConfirmationCandidate: {
            statement_id: string;
            /** @enum {string} */
            field: "stated_product_service" | "stated_features_capabilities" | "stated_value_propositions";
            statement: string;
            source_url: string;
            /** @constant */
            trust?: "site_claim";
        };
        OwnedSiteResult: {
            /** @enum {string} */
            outcome: "ACQUIRED" | "UNSAFE_SOURCE" | "SOURCE_UNAVAILABLE" | "EMPTY_CONTENT" | "CAPABILITY_UNAVAILABLE" | "INVALID_EXTRACTION";
            snapshot_id?: string | null;
            candidates?: components["schemas"]["ConfirmationCandidate"][];
        };
        Finding: {
            topic: string;
            text: string;
            /** @enum {string} */
            kind: "OBSERVATION" | "INFERENCE" | "HYPOTHESIS" | "RECOMMENDATION";
            /** @enum {string} */
            confidence: "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH";
        };
        SourceSummary: {
            label: string;
            url?: string | null;
        };
        Findings: {
            /** @enum {string} */
            kind: "competitor_analysis" | "market_analysis" | "positioning";
            findings: components["schemas"]["Finding"][];
            sources?: components["schemas"]["SourceSummary"][];
            limitations?: string[];
        };
        Post: {
            /** @constant */
            kind?: "post";
            headline: string;
            body: string;
            cta: string;
            limitations?: string[];
        };
        StrategySection: {
            text: string;
            items: string[];
            numeric_context?: string[];
        };
        Strategy: {
            strategic_diagnosis: components["schemas"]["StrategySection"];
            main_growth_constraint: components["schemas"]["StrategySection"];
            strategic_priorities: components["schemas"]["StrategySection"];
            trade_offs: components["schemas"]["StrategySection"];
            resource_priorities: components["schemas"]["StrategySection"];
            strategic_bets: components["schemas"]["StrategySection"];
            roadmap: components["schemas"]["StrategySection"];
            risks: components["schemas"]["StrategySection"];
            decision_triggers: components["schemas"]["StrategySection"];
            limitations?: string[];
        };
        Experiment: {
            hypothesis: string;
            target_metric: string;
            intervention: string;
            expected_signal: string;
            failure_condition: string;
            minimum_required_inputs: string[];
            time_resource_constraints: string[];
        };
        Experiments: {
            designs: components["schemas"]["Experiment"][];
            limitations?: string[];
        };
        /** @description Decimal strings preserve calculator precision. */
        CalculationInputs: {
            budget?: string | null;
            cpc?: string | null;
            cpl?: string | null;
            traffic?: string | null;
            conversion_rate_percent?: string | null;
            required_leads?: string | null;
        };
        CalculationOutputs: {
            clicks?: string | null;
            leads?: string | null;
            required_traffic?: string | null;
            required_budget?: string | null;
        };
        Calculation: {
            /** @enum {string} */
            calculation_type: "leads" | "required_traffic" | "required_budget";
            /** @enum {string} */
            formula: "budget/cpl" | "budget/cpc*rate" | "traffic*rate" | "required_leads/rate" | "required_leads*cpl";
            inputs: components["schemas"]["CalculationInputs"];
            outputs: components["schemas"]["CalculationOutputs"];
            assumptions: string[];
        };
        DirectResponse: {
            /** @constant */
            schema_version: "copilot_api.v1";
            owned_site?: components["schemas"]["OwnedSiteResult"] | null;
            /** @constant */
            kind: "DIRECT_RESULT";
            calculation: components["schemas"]["Calculation"];
        };
        ModuleResponse: {
            /** @constant */
            schema_version: "copilot_api.v1";
            owned_site?: components["schemas"]["OwnedSiteResult"] | null;
            /** @constant */
            kind: "MODULE_RESULT";
            /** @description `Post` (carries `kind: post`) or `Findings` (carries one of the findings kinds). */
            result: components["schemas"]["Post"] | components["schemas"]["Findings"];
        };
        /**
         * @description Grouped business clarification. `alternatives` is a list of groups of input keys; satisfying any one
         *     group is sufficient. `code` is a safe machine code produced by the core (for example
         *     `single_competitor_required`, `invalid_strategy_research`, `quality_rejected`); the set is open and
         *     owned by the core, so clients must tolerate unknown codes. Owned-site confirmation candidates, if
         *     any, are under `owned_site`.
         */
        NeedsInputResponse: {
            /** @constant */
            schema_version: "copilot_api.v1";
            owned_site?: components["schemas"]["OwnedSiteResult"] | null;
            /** @constant */
            kind: "NEEDS_INPUT";
            code: string;
            alternatives: string[][];
            actions?: string[];
        };
        /** @enum {string} */
        RunStatus: "QUEUED" | "RUNNING" | "COMPLETED" | "COMPLETED_WITH_LIMITATIONS" | "BLOCKED" | "FAILED";
        Coverage: {
            competitors_supplied: number;
            competitors_accepted: number;
            limitations?: string[];
        };
        /** @description The only failure information that crosses the boundary. Raw `run.error` is never returned. */
        PublicFailure: {
            /** @enum {string} */
            code: "context_required" | "result_unavailable";
            message: string;
            actions: string[];
        };
        /**
         * @description Public projection of a workflow run. `strategy` is present only after its artifact is accepted;
         *     partial accepted research can appear in `details` while the run is active.
         */
        RunResponse: {
            /** @constant */
            schema_version: "copilot_api.v1";
            run_id: string;
            status: components["schemas"]["RunStatus"];
            strategy?: components["schemas"]["Strategy"] | null;
            experiments?: components["schemas"]["Experiments"] | null;
            details?: components["schemas"]["Findings"][];
            evidence_coverage?: components["schemas"]["Coverage"] | null;
            limitations?: string[];
            failure?: components["schemas"]["PublicFailure"] | null;
        };
        MentorSection: {
            /** @enum {string} */
            key: "goal" | "inputs" | "principle" | "rationale" | "alternatives" | "limitations" | "verification" | "takeaway";
            title: string;
            paragraphs: string[];
        };
        MentorExplanation: {
            /** @constant */
            schema_version: "case_mentor.v1";
            run_id: components["schemas"]["Sha256Hex"];
            /** @constant */
            status: "COMPLETED";
            sections: components["schemas"]["MentorSection"][];
        };
        /** @description Existing request DTO. On `/v2` the `request_key` is additionally restricted to the web key format. */
        MentorQuestion: {
            request_key: components["schemas"]["RequestKey"];
            question: string;
        };
        MentorAnswer: {
            /** @constant */
            schema_version: "case_mentor_answer.v1";
            run_id: string;
            question: string;
            /** @enum {string} */
            focus: "alternative" | "verification" | "resources" | "evidence" | "overview";
            paragraphs: string[];
        };
        MentorTurn: {
            request_key: string;
            question: string;
            answer: components["schemas"]["MentorAnswer"];
        };
        MentorHistory: {
            /** @constant */
            schema_version: "case_mentor_history.v1";
            run_id: string;
            turns: components["schemas"]["MentorTurn"][];
        };
        MentorExplanationResult: {
            schema_version: components["schemas"]["SchemaVersion"];
            /** Format: uuid */
            message_id: string;
            /** @description True only for the author of the request. */
            can_ask: boolean;
            explanation: components["schemas"]["MentorExplanation"];
        };
        MentorAnswerResult: {
            schema_version: components["schemas"]["SchemaVersion"];
            /** Format: uuid */
            message_id: string;
            request_key: components["schemas"]["RequestKey"];
            answer: components["schemas"]["MentorAnswer"];
        };
        MentorHistoryResult: {
            schema_version: components["schemas"]["SchemaVersion"];
            /** Format: uuid */
            message_id: string;
            can_ask: boolean;
            history: components["schemas"]["MentorHistory"];
        };
        /** @enum {string} */
        LegacySourceType: "graph" | "workflow" | "task" | "receipt" | "legacy" | "conversation";
        /**
         * @description Allowlisted subset of the metadata the existing `ProjectHistoryService.metadata` returns today.
         *     The existing `source_id` and the Telegram-flow `capabilities` list are deliberately NOT exposed.
         */
        LegacyHistoryItem: {
            public_id: string;
            source_type: components["schemas"]["LegacySourceType"];
            title: string;
            short_description: string | null;
            /** @description Lower-cased source lifecycle status; the vocabulary differs per source type and is not an enum. */
            status: string;
            created_at: components["schemas"]["Timestamp"];
            last_activity_at: components["schemas"]["Timestamp"];
        };
        LegacyHistoryPage: {
            schema_version: components["schemas"]["SchemaVersion"];
            items: components["schemas"]["LegacyHistoryItem"][];
            next_offset: number | null;
        };
        /**
         * @description DEFERRED. `result` is an untyped dictionary in the backend today and differs per source type; its
         *     typed projection is a B11 design task. Listed only so the gap is explicit.
         */
        LegacyHistoryItemDetail: {
            schema_version: components["schemas"]["SchemaVersion"];
            item: components["schemas"]["LegacyHistoryItem"];
            /** @description Not frozen. Do not build against this field. */
            result: Record<string, never> | null;
        };
    };
    responses: {
        /** @description No valid session, or an invalid one-time login token. */
        Unauthenticated: {
            headers: {
                "Cache-Control": components["headers"]["CacheControlPrivate"];
                "X-Request-ID": components["headers"]["RequestId"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description CSRF failure, insufficient role/authorship for a visible resource, or a disabled feature. */
        Forbidden: {
            headers: {
                "Cache-Control": components["headers"]["CacheControlPrivate"];
                "X-Request-ID": components["headers"]["RequestId"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description The resource does not exist or is not visible to the caller. The two cases are indistinguishable. */
        NotFound: {
            headers: {
                "Cache-Control": components["headers"]["CacheControlPrivate"];
                "X-Request-ID": components["headers"]["RequestId"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description State conflict. See the operation's `x-error-codes` for the possible codes. */
        Conflict: {
            headers: {
                "Cache-Control": components["headers"]["CacheControlPrivate"];
                "X-Request-ID": components["headers"]["RequestId"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description Body exceeds the route limit. When produced by the edge the body may not be JSON. */
        PayloadTooLarge: {
            headers: {
                "Cache-Control": components["headers"]["CacheControlPrivate"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description Validation failed. Submitted values are never echoed back. */
        InvalidRequest: {
            headers: {
                "Cache-Control": components["headers"]["CacheControlPrivate"];
                "X-Request-ID": components["headers"]["RequestId"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /**
         * @description Rate limit or usage quota, evaluated before anything is stored or admitted (no message row, no core
         *     claim, no model call). `Retry-After` is always present.
         *
         *     * `rate_limited` - short window. The client may repeat the IDENTICAL request (same `request_key`)
         *       once after `Retry-After`; a second consecutive `429` is shown to the user instead of looping.
         *     * `quota_exceeded` - daily cap; `quota.resets_at` says when it resets and `Retry-After` counts down to
         *       it (may be many hours). Never retried automatically; the UI shows the reset time. Because nothing
         *       was admitted, a later explicit attempt may reuse the same key or start with a new one.
         */
        RateLimited: {
            headers: {
                "Cache-Control": components["headers"]["CacheControlPrivate"];
                "Retry-After": components["headers"]["RetryAfter"];
                "X-Request-ID": components["headers"]["RequestId"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /**
         * @description Outcome not determined or a dependency is unavailable. For `submitMessage` this never means
         *     "nothing happened": recover by key. Edge-generated 502/504 responses may not be JSON and must be
         *     treated the same way.
         */
        Unavailable: {
            headers: {
                "Cache-Control": components["headers"]["CacheControlPrivate"];
                "Retry-After": components["headers"]["RetryAfter"];
                "X-Request-ID": components["headers"]["RequestId"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
    };
    parameters: {
        OrgId: string;
        ProjectId: string;
        ThreadId: string;
        MessageId: string;
        RequestKeyPath: components["schemas"]["RequestKey"];
        /** @description Existing legacy history identifier (`g:`/`w:`/`t:`/`r:`/`l:`/`c:` prefixes). */
        LegacyPublicId: string;
        Limit: number;
        /** @description Opaque keyset cursor from `next_cursor`. Not a stable export cursor across deletions. */
        Cursor: string;
        /**
         * @description Client-generated UUID that makes a create safe to retry after a lost response. Scoped to the
         *     principal. Recommended for every create; without it a retried create can produce a duplicate.
         */
        IdempotencyKey: string;
    };
    requestBodies: never;
    headers: {
        /** @description `__Host-brenvio_session=<opaque>; Path=/; HttpOnly; Secure; SameSite=Lax` */
        SessionSetCookie: string;
        /** @description `__Host-brenvio_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` */
        SessionClearCookie: string;
        /**
         * @description Exactly `private, no-store` on EVERY response of `/v2` (success, redirect-free 2xx/204 and every error),
         *     because every `/v2` response is either tenant data or depends on the session. No browser cache, no
         *     shared cache (CDN, reverse proxy, service worker) may store it. There are no public `/v2` responses.
         *     See README, "Caching and the edge".
         */
        CacheControlPrivate: "private, no-store";
        /**
         * @description Delta-seconds (never an HTTP-date) until the identical request may be repeated. No upper bound: for
         *     `quota_exceeded` it is the time until `quota.resets_at` and can exceed a day. Clients never compute
         *     it themselves and never retry before it elapses.
         */
        RetryAfter: number;
        /** @description Correlation id, equal to `ErrorResponse.request_id`. Contains no user data. */
        RequestId: string;
    };
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    exchangeTelegramLoginToken: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TelegramExchangeRequest"];
            };
        };
        responses: {
            /** @description Session created. */
            200: {
                headers: {
                    "Set-Cookie": components["headers"]["SessionSetCookie"];
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthSession"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            422: components["responses"]["InvalidRequest"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    getCsrfToken: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current CSRF token. */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CsrfToken"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            503: components["responses"]["Unavailable"];
        };
    };
    logout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Session revoked (or there was none). */
            204: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    "Set-Cookie": components["headers"]["SessionClearCookie"];
                    [name: string]: unknown;
                };
                content?: never;
            };
            403: components["responses"]["Forbidden"];
            503: components["responses"]["Unavailable"];
        };
    };
    getMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The authenticated principal. */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Me"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            503: components["responses"]["Unavailable"];
        };
    };
    listTelegramHistory: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                source_type?: components["schemas"]["LegacySourceType"];
                /** @description Existing filter. `completed`, `failed` and `running` are groups; other values match exactly. */
                status?: string;
                /** @description Existing prefix search on the bounded title. */
                query?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description One page of the caller's legacy history. */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LegacyHistoryPage"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidRequest"];
            503: components["responses"]["Unavailable"];
        };
    };
    getTelegramHistoryItem: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Existing legacy history identifier (`g:`/`w:`/`t:`/`r:`/`l:`/`c:` prefixes). */
                public_id: components["parameters"]["LegacyPublicId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Item metadata plus an untyped, bounded result (shape to be defined in B11). */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LegacyHistoryItemDetail"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            503: components["responses"]["Unavailable"];
        };
    };
    listOrganizations: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Active memberships. */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrganizationList"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            503: components["responses"]["Unavailable"];
        };
    };
    listProjects: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                /** @description Opaque keyset cursor from `next_cursor`. Not a stable export cursor across deletions. */
                cursor?: components["parameters"]["Cursor"];
                status?: components["schemas"]["ProjectStatus"];
            };
            header?: never;
            path: {
                org_id: components["parameters"]["OrgId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description One page of projects, each with its brand. */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProjectList"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["InvalidRequest"];
            503: components["responses"]["Unavailable"];
        };
    };
    createProject: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Client-generated UUID that makes a create safe to retry after a lost response. Scoped to the
                 *     principal. Recommended for every create; without it a retried create can produce a duplicate.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                org_id: components["parameters"]["OrgId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProjectCreate"];
            };
        };
        responses: {
            /** @description Idempotent replay; the project created earlier under this Idempotency-Key. */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Project"];
                };
            };
            /** @description Project created. */
            201: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Project"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidRequest"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    getProject: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: components["parameters"]["ProjectId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The project. */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Project"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            /** @description Unknown project or a project of another organization (indistinguishable). */
            404: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            503: components["responses"]["Unavailable"];
        };
    };
    updateProject: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: components["parameters"]["ProjectId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProjectPatch"];
            };
        };
        responses: {
            /** @description Updated project with the new `version`. */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Project"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            /** @description Version conflict. */
            409: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            422: components["responses"]["InvalidRequest"];
            503: components["responses"]["Unavailable"];
        };
    };
    getProjectBrand: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: components["parameters"]["ProjectId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The project brand. */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProjectBrand"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            404: components["responses"]["NotFound"];
            503: components["responses"]["Unavailable"];
        };
    };
    updateProjectBrand: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: components["parameters"]["ProjectId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProjectBrandPatch"];
            };
        };
        responses: {
            /** @description Updated brand with the new `version`. */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProjectBrand"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidRequest"];
            503: components["responses"]["Unavailable"];
        };
    };
    importTelegramBrand: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: components["parameters"]["ProjectId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BrandImportRequest"];
            };
        };
        responses: {
            /** @description Brand replaced by a copy of the legacy profile; `imported_from` updated. */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProjectBrand"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidRequest"];
            503: components["responses"]["Unavailable"];
        };
    };
    listThreads: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                /** @description Opaque keyset cursor from `next_cursor`. Not a stable export cursor across deletions. */
                cursor?: components["parameters"]["Cursor"];
            };
            header?: never;
            path: {
                project_id: components["parameters"]["ProjectId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description One page of threads. */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ThreadList"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["InvalidRequest"];
            503: components["responses"]["Unavailable"];
        };
    };
    createThread: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Client-generated UUID that makes a create safe to retry after a lost response. Scoped to the
                 *     principal. Recommended for every create; without it a retried create can produce a duplicate.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                project_id: components["parameters"]["ProjectId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ThreadCreate"];
            };
        };
        responses: {
            /** @description Idempotent replay; the thread created earlier under this Idempotency-Key. */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Thread"];
                };
            };
            /** @description Thread created. */
            201: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Thread"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidRequest"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    getThread: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                thread_id: components["parameters"]["ThreadId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The thread. */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Thread"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            /** @description Unknown or removed thread, or a thread of another organization (indistinguishable). */
            404: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            503: components["responses"]["Unavailable"];
        };
    };
    removeThread: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                thread_id: components["parameters"]["ThreadId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Removed from the project (idempotent for the author/owner until purge). */
            204: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            503: components["responses"]["Unavailable"];
        };
    };
    listThreadMessages: {
        parameters: {
            query?: {
                limit?: number;
                before_seq?: number;
                after_seq?: number;
            };
            header?: never;
            path: {
                thread_id: components["parameters"]["ThreadId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description One page of messages with embedded durable results. */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ThreadMessagesPage"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["InvalidRequest"];
            503: components["responses"]["Unavailable"];
        };
    };
    submitMessage: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                thread_id: components["parameters"]["ThreadId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SubmitMessageRequest"];
            };
        };
        responses: {
            /** @description Durable state reached synchronously, or replay of a terminal state. */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResult"];
                };
            };
            /** @description Admitted and running. Poll `getMessage` using `poll_after_ms`. */
            202: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResult"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            /** @description CSRF failure, insufficient role or disabled feature. */
            403: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            404: components["responses"]["NotFound"];
            /** @description Idempotency, revision, thread-slot or confirmation conflict. */
            409: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            413: components["responses"]["PayloadTooLarge"];
            422: components["responses"]["InvalidRequest"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    getRequestByKey: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                thread_id: components["parameters"]["ThreadId"];
                request_key: components["parameters"]["RequestKeyPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current state of the latest revision of this request. */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResult"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["InvalidRequest"];
            503: components["responses"]["Unavailable"];
        };
    };
    getMessage: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                message_id: components["parameters"]["MessageId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current state of the request. */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResult"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            /** @description Unknown message, or a message (and therefore AI run) of another tenant (indistinguishable). */
            404: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            503: components["responses"]["Unavailable"];
        };
    };
    getMessageResult: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                message_id: components["parameters"]["MessageId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The snapshot. */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ResultSnapshot"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            404: components["responses"]["NotFound"];
            /** @description Not ready yet, or stored in a format this server cannot present. */
            409: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description No result exists and none can be obtained under this key. */
            410: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Integrity failure, decoder defect or dependency outage. */
            503: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    getMentorExplanation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                message_id: components["parameters"]["MessageId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The saved explanation. */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MentorExplanationResult"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            503: components["responses"]["Unavailable"];
        };
    };
    createMentorExplanation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                message_id: components["parameters"]["MessageId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The explanation. */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MentorExplanationResult"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            503: components["responses"]["Unavailable"];
        };
    };
    listMentorQuestions: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path: {
                message_id: components["parameters"]["MessageId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Up to 50 most recent turns (existing bound). */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MentorHistoryResult"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidRequest"];
            503: components["responses"]["Unavailable"];
        };
    };
    askMentorQuestion: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                message_id: components["parameters"]["MessageId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MentorQuestion"];
            };
        };
        responses: {
            /** @description The answer (new or replayed). */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MentorAnswerResult"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidRequest"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    submitChatMessage: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                thread_id: components["parameters"]["ThreadId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SubmitChatMessageRequest"];
            };
        };
        responses: {
            /** @description Reply stored (or replay of a stored reply, or `ambiguous`). */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResult"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            /** @description Feature disabled in the internal beta, CSRF failure or insufficient role. */
            403: {
                headers: {
                    "Cache-Control": components["headers"]["CacheControlPrivate"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["InvalidRequest"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
}
