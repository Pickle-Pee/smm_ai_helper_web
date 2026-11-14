import { describe, expect, it } from "vitest";
import { FIXTURE_IDS, fixtures } from "./fixtures";
import { FixtureWebApiV2Client } from "./fixture-client";
import { createRequestKey } from "./request-key";
import type { MessageResult } from "./types";

describe("fixture conformance (cheap invariants on top of check_contract.py)", () => {
  const messageFixtures = Object.entries(fixtures.responses).filter(([name]) => name.startsWith("message")) as [string, () => MessageResult][];

  it.each(messageFixtures)("%s keeps MessageResult invariants", (_name, load) => {
    const r = load();
    expect(r.schema_version).toBe("web_api.v2");
    expect(r.state).toBe(r.user_message.state);
    expect(r.poll_after_ms !== null).toBe(r.next_action === "poll");
    if (r.running_overdue) expect(r.state).toBe("running");
    if (r.assistant_message) {
      expect(r.assistant_message.reply_to).toBe(r.user_message.id);
      expect(r.assistant_message.result !== null).toBe(r.assistant_message.result_status === "available");
    }
  });

  it("all fixtures are copies: mutating one does not affect the next load", () => {
    const a = fixtures.responses.me();
    a.user.display_name = "changed";
    expect(fixtures.responses.me().user.display_name).toBe("Мария");
  });
});

describe("authorized user, organizations, projects and brand", () => {
  it("returns the authorized user, the personal organization, projects and the project brand", async () => {
    const api = new FixtureWebApiV2Client();
    const me = await api.getMe();
    expect(me.user.id).toBe(FIXTURE_IDS.authorUserId);
    expect(me.features).toMatchObject({ web_chat: false, documents: false });
    const orgs = await api.listOrganizations();
    expect(orgs.items[0].organization.id).toBe(FIXTURE_IDS.orgId);
    const projects = await api.listProjects(FIXTURE_IDS.orgId);
    expect(projects.items.map((p) => p.id)).toContain(FIXTURE_IDS.projectId);
    const brand = await api.getProjectBrand(FIXTURE_IDS.projectId);
    expect(brand.project_id).toBe(FIXTURE_IDS.projectId);
  });

  it("the login exchange accepts only the fixture token (no real auth exists)", async () => {
    const api = new FixtureWebApiV2Client();
    await expect(api.exchangeTelegramLoginToken({ token: "x".repeat(40) })).rejects.toMatchObject({ code: "login_token_invalid", status: 401 });
    expect((await api.exchangeTelegramLoginToken(fixtures.requests.authExchange())).csrf_token).toBeTruthy();
  });
});

describe("tenant separation", () => {
  it("a foreign project is 404 not_found with the same body as an unknown id", async () => {
    const api = new FixtureWebApiV2Client();
    const foreign = await api.getProject(FIXTURE_IDS.foreignProjectId).catch((e) => e);
    const unknown = await api.getProject("00000000-0000-4000-8000-000000000000").catch((e) => e);
    expect(foreign).toMatchObject({ status: 404, code: "not_found" });
    expect({ ...foreign, requestId: null }).toEqual({ ...unknown, requestId: null });
    await expect(api.listProjects("11111111-1111-4111-8111-111111111111")).rejects.toMatchObject({ status: 404, code: "not_found" });
    await expect(api.listThreads(FIXTURE_IDS.foreignProjectId)).rejects.toMatchObject({ status: 404 });
    await expect(api.getThread("22222222-2222-4222-8222-222222222222")).rejects.toMatchObject({ status: 404, code: "not_found" });
    await expect(api.getMessage("33333333-3333-4333-8333-333333333333")).rejects.toMatchObject({ status: 404, code: "not_found" });
  });

  it("another member sees the same snapshot with is_self = false (golden two-viewers)", async () => {
    const author = await new FixtureWebApiV2Client({ viewer: "author" }).getMessageResult(FIXTURE_IDS.strategyAssistantMessageId);
    const other = await new FixtureWebApiV2Client({ viewer: "viewer_member" }).getMessageResult(FIXTURE_IDS.strategyAssistantMessageId);
    expect(author).toEqual(fixtures.responses.resultSnapshotRun());
    expect(other).toEqual(fixtures.responses.resultSnapshotRunOtherMember());
    // Immutable parts are identical; only the viewer projection differs.
    expect(other.stored).toEqual(author.stored);
    expect(other.provenance).toEqual(author.provenance);
    expect(other.presentation).toEqual(author.presentation);
    expect([author.author.is_self, other.author.is_self]).toEqual([true, false]);
  });

  it("a viewer cannot submit or create threads (403) and cannot recover the author's key (404)", async () => {
    const api = new FixtureWebApiV2Client({ viewer: "viewer_member" });
    await expect(api.submitMessage(FIXTURE_IDS.strategyThreadId, fixtures.requests.strategy())).rejects.toMatchObject({ status: 403, code: "forbidden" });
    await expect(api.createThread(FIXTURE_IDS.projectId, { kind: "copilot" })).rejects.toMatchObject({ status: 403 });
    const key = fixtures.responses.messagePendingResubmit().user_message.request_key;
    await expect(api.getRequestByKey(fixtures.responses.messagePendingResubmit().thread_id, key)).rejects.toMatchObject({ status: 404 });
    expect(api.stats.simulatedCoreAdmissions).toBe(0);
  });

  it("author-only next actions become wait_for_author for other members", async () => {
    const api = new FixtureWebApiV2Client({ viewer: "viewer_member" });
    const pending = fixtures.responses.messagePendingResubmit();
    const result = await api.getMessage(pending.user_message.id);
    expect(result.next_action).toBe("wait_for_author");
    expect(result.user_message.author.is_self).toBe(false);
  });
});

describe("threads, history and snapshots", () => {
  it("creating a thread and a request makes the result reopenable from history", async () => {
    const api = new FixtureWebApiV2Client({ scenario: "direct_result" });
    const thread = await api.createThread(FIXTURE_IDS.projectId, { kind: "copilot", title: "Расчёт" });
    expect(thread).toMatchObject({ kind: "copilot", title: "Расчёт", in_flight: null, permissions: { can_submit: true } });
    // The fixture's own key is already used by a seeded request in another thread -> request_conflict.
    await expect(api.submitMessage(thread.id, fixtures.requests.calculation())).rejects.toMatchObject({ code: "request_conflict" });
    const requestKey = createRequestKey();
    await api.submitMessage(thread.id, { ...fixtures.requests.calculation(), request_key: requestKey });
    const page = await api.listThreadMessages(thread.id);
    expect(page.items.map((m) => m.role)).toEqual(["user", "assistant"]);
    const assistant = page.items[1];
    if (assistant.role !== "assistant") throw new Error();
    const snapshot = await api.getMessageResult(assistant.id);
    expect(snapshot.result_kind).toBe("DIRECT_RESULT");
    expect(snapshot.provenance.request_key).toBe(requestKey);
  });

  it("chat threads are a disabled feature (web chat is B9/F7)", async () => {
    await expect(new FixtureWebApiV2Client().createThread(FIXTURE_IDS.projectId, { kind: "chat" })).rejects.toMatchObject({ status: 403, code: "feature_disabled" });
  });

  it("Idempotency-Key on createThread replays the same thread and rejects a changed payload", async () => {
    const api = new FixtureWebApiV2Client();
    const key = "5f0b8a3e-2d7c-4a1b-9e3f-6c5d4b3a2f10";
    const a = await api.createThread(FIXTURE_IDS.projectId, { kind: "copilot", title: "A" }, { idempotencyKey: key });
    const b = await api.createThread(FIXTURE_IDS.projectId, { kind: "copilot", title: "A" }, { idempotencyKey: key });
    expect(b.id).toBe(a.id);
    await expect(api.createThread(FIXTURE_IDS.projectId, { kind: "copilot", title: "B" }, { idempotencyKey: key })).rejects.toMatchObject({ code: "idempotency_conflict" });
  });

  it("history reopens the strategy snapshot after receipt expiry without touching any receipt", async () => {
    const api = new FixtureWebApiV2Client();
    const page = await api.listThreadMessages(FIXTURE_IDS.strategyThreadId);
    expect(page).toEqual(fixtures.responses.threadMessagesReopen());
    expect(api.stats).toEqual({ submitCalls: 0, simulatedCoreAdmissions: 0, recoveryReads: 0, pollReads: 0 });
  });

  it("snapshot read failures map to distinct codes", async () => {
    const api = new FixtureWebApiV2Client();
    const formatPage = await api.listThreadMessages(FIXTURE_IDS.formatUnsupportedThreadId);
    const unsupported = formatPage.items.find((m) => m.role === "assistant")!;
    await expect(api.getMessageResult(unsupported.id)).rejects.toMatchObject({ status: 409, code: "result_format_unsupported" });
    await expect(api.getMessageResult(FIXTURE_IDS.corruptedResultMessageId)).rejects.toMatchObject({ status: 503, code: "result_corrupted" });
    await expect(api.getMessageResult(FIXTURE_IDS.unreadableResultMessageId)).rejects.toMatchObject({ status: 503, code: "result_unreadable" });
    const ambiguous = fixtures.responses.messageAmbiguous();
    await expect(api.getMessageResult(ambiguous.user_message.id)).rejects.toMatchObject({ status: 410, code: "result_gone" });
    const overdue = fixtures.responses.messageRunningOverdue();
    await expect(api.getMessageResult(overdue.user_message.id)).rejects.toMatchObject({ status: 409, code: "result_not_ready" });
  });

  it("seeded threads expose in_flight for pending/running requests", async () => {
    const api = new FixtureWebApiV2Client();
    const overdue = fixtures.responses.messageRunningOverdue();
    const thread = await api.getThread(overdue.thread_id);
    expect(thread.in_flight).toMatchObject({ message_id: overdue.user_message.id, state: "running" });
    expect(thread.permissions.can_submit).toBe(false);
  });

  it("an aborted signal is honoured", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(new FixtureWebApiV2Client().getMe({ signal: controller.signal })).rejects.toMatchObject({ kind: "aborted" });
  });
});
