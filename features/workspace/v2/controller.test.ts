import { describe, expect, it, vi } from "vitest";
import { FIXTURE_IDS } from "@/lib/api/v2/fixtures";
import { FixtureWebApiV2Client, type FixtureClientOptions, type SubmitScenario } from "@/lib/api/v2/fixture-client";
import type { ThreadMessageView } from "@/lib/api/v2/presenters";
import { MemoryPendingRequestStore, type Sleep } from "@/lib/api/v2/requests";
import { WorkspaceV2Controller, mergeMessages } from "./controller";

const noSleep: Sleep = async (_ms, signal) => {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
};

let ids = 0;
function setup(options: FixtureClientOptions = {}, sleep: Sleep = noSleep) {
  const api = new FixtureWebApiV2Client(options);
  const spies = {
    submit: vi.spyOn(api, "submitMessage"),
    recover: vi.spyOn(api, "getRequestByKey"),
    messages: vi.spyOn(api, "listThreadMessages"),
    result: vi.spyOn(api, "getMessageResult"),
  };
  const store = new MemoryPendingRequestStore();
  const controller = new WorkspaceV2Controller({
    api,
    pendingStore: { kind: "transient", store, reason: "no_verified_principal" },
    simulation: api,
    sleep,
    newId: () => `idem-${++ids}`,
  });
  return { api, controller, store, ...spies };
}

const state = (c: WorkspaceV2Controller) => c.getSnapshot();
const detail = (c: WorkspaceV2Controller, threadId: string) => c.getSnapshot().details[threadId];

async function newRequest(c: WorkspaceV2Controller, scenario: SubmitScenario, text = "Рассчитай лиды при бюджете 10000 ₽") {
  const created = await c.createThreadAndSubmit({ projectId: FIXTURE_IDS.projectId, text, scenario });
  if (!("threadId" in created)) throw new Error(created.error.text);
  await c.openThread(created.threadId);
  await vi.waitFor(() => expect(detail(c, created.threadId)?.request.phase).not.toBe("submitting"));
  return created.threadId;
}

describe("projects and threads", () => {
  it("lists fixture projects and thread summaries without loading any message history", async () => {
    const { controller, messages } = setup();
    await controller.start();
    expect(state(controller).status).toBe("ready");
    expect(state(controller).projects.map((p) => p.project.name)).toEqual(["Кофейня «Зерно»", "Студия керамики «Глина»"]);
    expect(state(controller).threads.length).toBeGreaterThan(3);
    expect(state(controller).threads.every((t) => t.projectId === FIXTURE_IDS.projectId)).toBe(true);
    expect(messages).not.toHaveBeenCalled();
    expect(controller.projectById("p-little-feet")).toBeNull(); // legacy mock id is not a fixture project
  });

  it("loads history lazily when a thread is opened (reopen of a stored snapshot)", async () => {
    const { controller, messages, submit } = setup();
    await controller.start();
    await controller.openThread(FIXTURE_IDS.strategyThreadId);
    expect(messages).toHaveBeenCalledTimes(1);
    const d = detail(controller, FIXTURE_IDS.strategyThreadId);
    expect(d.status).toBe("ready");
    const assistant = d.messages.find((m) => m.role === "assistant");
    expect(assistant).toMatchObject({ result: { status: "available", kind: "RUN" } });
    expect(submit).not.toHaveBeenCalled();
  });

  it("unknown thread ids are 'not found' (no request is sent anywhere)", async () => {
    const { controller, submit } = setup();
    await controller.start();
    await controller.openThread("t-lf-strategy");
    expect(detail(controller, "t-lf-strategy").status).toBe("not_found");
    expect(submit).not.toHaveBeenCalled();
  });

  it("creates a copilot thread and refuses non-fixture projects", async () => {
    const { controller, api } = setup();
    await controller.start();
    const create = vi.spyOn(api, "createThread");
    expect(await controller.createThreadAndSubmit({ projectId: "p-little-feet", text: "Тест" })).toMatchObject({ error: {} });
    expect(create).not.toHaveBeenCalled();
    const id = await newRequest(controller, "direct_result");
    expect(create).toHaveBeenCalledWith(FIXTURE_IDS.projectId, expect.objectContaining({ kind: "copilot" }), expect.objectContaining({ idempotencyKey: expect.any(String) }));
    expect(state(controller).threads[0].id).toBe(id);
  });
});

describe("request lifecycle through the coordinator", () => {
  it("DIRECT_RESULT: result shown right after the request", async () => {
    const { controller, submit } = setup();
    await controller.start();
    const id = await newRequest(controller, "direct_result");
    const d = detail(controller, id);
    expect(d.request).toMatchObject({ phase: "settled", execution: { status: "completed" } });
    expect(d.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(d.messages[1]).toMatchObject({ result: { status: "available", kind: "DIRECT_RESULT" } });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("MODULE_RESULT", async () => {
    const { controller } = setup();
    await controller.start();
    const id = await newRequest(controller, "module_result", "Напиши пост о сезонном меню");
    expect(detail(controller, id).messages[1]).toMatchObject({ result: { status: "available", kind: "MODULE_RESULT", title: "Публикация" } });
  });

  it("WORKFLOW_STARTED → polling → completed, one loop only", async () => {
    const { controller, api } = setup({ pollsUntilDone: 2 });
    const getMessage = vi.spyOn(api, "getMessage");
    await controller.start();
    const id = await newRequest(controller, "workflow", "Разработай стратегию");
    await vi.waitFor(() => expect(detail(controller, id).request.execution?.status).toBe("completed"));
    expect(detail(controller, id).request.polling).toBe(false);
    expect(detail(controller, id).messages.at(-1)).toMatchObject({ result: { kind: "RUN", status: "available" } });
    expect(getMessage.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("NEEDS_INPUT → answer with the SAME key and revision 2", async () => {
    const { controller, submit } = setup();
    await controller.start();
    const id = await newRequest(controller, "needs_input", "Сформулируй позиционирование кофейни");
    const d = detail(controller, id);
    expect(d.request.execution).toMatchObject({ status: "needs_input", canAnswerClarification: true });
    const assistant = d.messages.find((m) => m.role === "assistant");
    expect(assistant).toMatchObject({ result: { clarification: { alternativeKeys: [["customer_job_or_need", "product_truth", "relevant_alternative"]] } } });
    await controller.answerClarification(id, { context: { customer_job_or_need: "Быстро взять кофе" }, confirmStatementIds: ["stmt_784b44d5ae6da62bf4b332a9"] });
    expect(detail(controller, id).request.execution).toMatchObject({ status: "completed", revision: 2 });
    const [first, second] = submit.mock.calls.map((c) => c[1]);
    expect(second.request_key).toBe(first.request_key);
    expect(second.revision).toBe(2);
    expect(second.message).toBe(first.message);
    expect(second.context).toMatchObject({ customer_job_or_need: "Быстро взять кофе" });
    expect(second.confirmation).toMatchObject({ confirmed: true, statement_ids: ["stmt_784b44d5ae6da62bf4b332a9"] });
    const users = detail(controller, id).messages.filter((m) => m.role === "user");
    expect(users.map((u) => u.role === "user" && [u.revision, u.isLatestRevision])).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  it.each([
    ["workflow_failed", "failed"],
    ["workflow_blocked", "blocked"],
  ] as const)("%s: shows the reason and only an explicit new request", async (scenario, status) => {
    const { controller } = setup({ pollsUntilDone: 1 });
    await controller.start();
    const id = await newRequest(controller, scenario, "Разработай стратегию");
    await vi.waitFor(() => expect(detail(controller, id).request.execution?.status).toBe(status));
    expect(detail(controller, id).request.execution).toMatchObject({ offersNewRequest: true, canResubmitSameKey: false });
  });

  it("ambiguous: no automatic retry; a normal request is refused; a confirmed new request mints a new key", async () => {
    const { controller, submit } = setup();
    await controller.start();
    const id = await newRequest(controller, "ambiguous", "Проанализируй конкурента");
    expect(detail(controller, id).request.execution).toMatchObject({ status: "ambiguous", offersNewRequest: true });
    expect(controller.canStartNormalRequest(id)).toBe(false);
    await controller.submit(id, "Ещё раз");
    expect(detail(controller, id).request.refusal).toMatchObject({ reason: "unresolved_request" });
    expect(submit).toHaveBeenCalledTimes(1);
    await controller.startNewRequest(id, {}, { acknowledgeMayRegenerate: true }, "direct_result");
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1][1].request_key).not.toBe(submit.mock.calls[0][1].request_key);
    expect(submit.mock.calls[1][1].message).toBe("Проанализируй конкурента");
  });

  it("expired (seeded thread): explained, never resent automatically", async () => {
    const { controller, submit } = setup();
    await controller.start();
    const expiredThread = state(controller).threads.find((t) => t.title.startsWith("Напиши пост к открытию"))!;
    await controller.openThread(expiredThread.id);
    expect(detail(controller, expiredThread.id).request.execution).toMatchObject({ status: "expired", canResubmitSameKey: false, offersNewRequest: true });
    expect(submit).not.toHaveBeenCalled();
  });

  it("stale pending older than the window becomes expired (31 days), fresh one allows same-key resubmit", async () => {
    const old = new Date(Date.parse("2026-11-23T09:05:00Z") - 31 * 86_400_000).toISOString();
    const stale = setup({ pendingCreatedAt: old });
    await stale.controller.start();
    const pendingThread = state(stale.controller).threads.find((t) => t.title.startsWith("Проанализируй рынок"))!;
    await stale.controller.openThread(pendingThread.id);
    expect(detail(stale.controller, pendingThread.id).request.execution).toMatchObject({ status: "expired", canResubmitSameKey: false });

    const fresh = setup();
    await fresh.controller.start();
    await fresh.controller.openThread(pendingThread.id);
    expect(detail(fresh.controller, pendingThread.id).request.execution).toMatchObject({ status: "pending", canResubmitSameKey: true });
    await fresh.controller.resubmitSameKey(pendingThread.id);
    expect(fresh.submit).toHaveBeenCalledTimes(1);
    expect(fresh.submit.mock.calls[0][1].request_key).toBe(detail(fresh.controller, pendingThread.id).request.execution?.requestKey);
    expect(detail(fresh.controller, pendingThread.id).request.execution?.status).toBe("completed");
  });

  it("503 after admission: recovered by key, POST sent once", async () => {
    const { controller, submit, recover, api } = setup();
    await controller.start();
    const id = await newRequest(controller, "unavailable_after_admission");
    expect(detail(controller, id).request).toMatchObject({ phase: "settled", execution: { status: "completed" } });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(recover).toHaveBeenCalledTimes(1);
    expect(api.stats.simulatedCoreAdmissions).toBe(1);
  });

  it("503 + recovery 503: unresolved, fenced, 'check status' only reads", async () => {
    const { controller, submit, recover } = setup({ readOutages: 1 });
    await controller.start();
    const id = await newRequest(controller, "unavailable_after_admission");
    expect(detail(controller, id).request).toMatchObject({ phase: "unknown", unknown: { reason: "status_unavailable" } });
    expect(detail(controller, id).request.fencedKeys).toHaveLength(1);
    await controller.submit(id, "Ещё раз");
    expect(submit).toHaveBeenCalledTimes(1);
    await controller.checkStatus(id);
    expect(recover).toHaveBeenCalledTimes(2);
    expect(detail(controller, id).request).toMatchObject({ phase: "settled", execution: { status: "completed" }, fencedKeys: [] });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("503 + recovery 404: no visible record is NOT proof; no new key without confirmation", async () => {
    const { controller, submit, store } = setup();
    await controller.start();
    const id = await newRequest(controller, "unavailable_before_admission");
    expect(detail(controller, id).request).toMatchObject({ phase: "unknown", unknown: { reason: "no_visible_record" } });
    await controller.checkStatus(id);
    expect(detail(controller, id).request.unknown?.reason).toBe("no_visible_record");
    expect(submit).toHaveBeenCalledTimes(1);
    const firstKey = submit.mock.calls[0][1].request_key;
    expect(detail(controller, id).request.pendingMessage).toBe("Рассчитай лиды при бюджете 10000 ₽");
    // Only the explicit, acknowledged action starts again (with the stored original payload); the old key stays
    // stored as superseded.
    await controller.startNewRequest(id, {}, { acknowledgeMayRegenerate: true }, "direct_result");
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1][1].request_key).not.toBe(firstKey);
    expect(submit.mock.calls[1][1].message).toBe("Рассчитай лиды при бюджете 10000 ₽");
    expect(store.get(firstKey)).toMatchObject({ status: "superseded" });
  });

  it("double submit: one POST, second click refused locally", async () => {
    const { controller, submit } = setup();
    await controller.start();
    const created = await controller.createThreadAndSubmit({ projectId: FIXTURE_IDS.projectId, text: "Первый", scenario: "direct_result" });
    if (!("threadId" in created)) throw new Error();
    await vi.waitFor(() => expect(detail(controller, created.threadId).request.phase).toBe("settled"));
    submit.mockClear();
    await Promise.all([controller.submit(created.threadId, "Второй"), controller.submit(created.threadId, "Второй")]);
    expect(submit).toHaveBeenCalledTimes(1);
    // Double click on "send" in a new conversation creates one thread.
    const [a, b] = await Promise.all([
      controller.createThreadAndSubmit({ projectId: FIXTURE_IDS.projectId, text: "Новый" }),
      controller.createThreadAndSubmit({ projectId: FIXTURE_IDS.projectId, text: "Новый" }),
    ]);
    expect(["threadId" in a, "threadId" in b].sort()).toEqual([false, true]);
  });

  it("concurrent requests: a second request while one is running is refused, the server stays authoritative", async () => {
    const { controller, submit } = setup({ pollsUntilDone: 5 }, () => new Promise(() => {}));
    await controller.start();
    const id = await newRequest(controller, "workflow", "Стратегия");
    expect(detail(controller, id).request.phase).toBe("waiting");
    await controller.submit(id, "Ещё");
    expect(detail(controller, id).request.refusal?.reason).toMatch(/request_in_flight|unresolved_request/);
    expect(submit).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("leaving the page stops polling but does not cancel or reclassify the request", async () => {
    const { controller, api } = setup({ pollsUntilDone: 50 }, (ms, signal) => new Promise((resolve, reject) => {
      const t = setTimeout(resolve, 1);
      signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); });
    }));
    const getMessage = vi.spyOn(api, "getMessage");
    await controller.start();
    const id = await newRequest(controller, "workflow", "Стратегия");
    await vi.waitFor(() => expect(detail(controller, id).request.polling).toBe(true));
    controller.stopAll();
    expect(detail(controller, id).request.polling).toBe(false);
    const reads = getMessage.mock.calls.length;
    await new Promise((r) => setTimeout(r, 20));
    expect(getMessage.mock.calls.length).toBe(reads);
    expect(detail(controller, id).request.execution?.status).toBe("running");
    expect((await api.getThread(id)).in_flight).not.toBeNull();
  });

  it("running overdue stays running (never ambiguous by time); stop waiting is not a cancel", async () => {
    const { controller } = setup({}, () => new Promise(() => {}));
    await controller.start();
    const overdue = state(controller).threads.find((t) => t.inFlight?.state === "running")!;
    await controller.openThread(overdue.id);
    expect(detail(controller, overdue.id).request.execution).toMatchObject({ status: "running_overdue", offersNewRequest: true });
    controller.stopWaiting(overdue.id);
    expect(detail(controller, overdue.id).request).toMatchObject({ stoppedWaiting: true, polling: false, execution: { status: "running_overdue" } });
    controller.dispose();
  });

  it("viewer role cannot submit (nothing is sent)", async () => {
    const { controller, submit } = setup({ viewer: "viewer_member" });
    await controller.start();
    expect(state(controller).projects.every((p) => !p.canSubmit)).toBe(true);
    expect(await controller.createThreadAndSubmit({ projectId: FIXTURE_IDS.projectId, text: "Тест" })).toMatchObject({ error: { code: "forbidden" } });
    await controller.openThread(FIXTURE_IDS.strategyThreadId);
    await controller.submit(FIXTURE_IDS.strategyThreadId, "Тест");
    expect(detail(controller, FIXTURE_IDS.strategyThreadId).request.refusal?.reason).toBe("not_permitted");
    expect(submit).not.toHaveBeenCalled();
    const assistant = detail(controller, FIXTURE_IDS.strategyThreadId).messages.find((m) => m.role === "assistant");
    expect(assistant).toMatchObject({ result: { meta: { author: { isSelf: false } } } });
  });
});

describe("stored results", () => {
  it("opens a stored snapshot by id and maps unavailable results to separate states", async () => {
    const { controller, result } = setup();
    await controller.start();
    await controller.openThread(FIXTURE_IDS.strategyThreadId);
    await controller.openResult(FIXTURE_IDS.strategyThreadId, FIXTURE_IDS.strategyAssistantMessageId);
    expect(result).toHaveBeenCalledWith(FIXTURE_IDS.strategyAssistantMessageId);
    expect(detail(controller, FIXTURE_IDS.strategyThreadId).messages.find((m) => m.id === FIXTURE_IDS.strategyAssistantMessageId)).toMatchObject({
      result: { status: "available" },
    });

    await controller.openThread(FIXTURE_IDS.formatUnsupportedThreadId);
    expect(detail(controller, FIXTURE_IDS.formatUnsupportedThreadId).messages.find((m) => m.role === "assistant")).toMatchObject({
      result: { status: "format_unsupported" },
    });
  });

  it("result error codes map to corrupted / unreadable / not_ready / gone", async () => {
    const { controller, api } = setup();
    await controller.start();
    const id = await newRequest(controller, "direct_result");
    const assistantId = detail(controller, id).messages.find((m) => m.role === "assistant")!.id;
    for (const [code, status] of [
      ["result_corrupted", "corrupted"],
      ["result_unreadable", "unreadable"],
      ["result_not_ready", "not_ready"],
      ["result_gone", "gone"],
      ["result_format_unsupported", "format_unsupported"],
    ] as const) {
      const { WebApiError } = await import("@/lib/api/v2/errors");
      vi.spyOn(api, "getMessageResult").mockRejectedValueOnce(new WebApiError({ kind: "http", operation: "getMessageResult", status: 409, code }));
      await controller.openResult(id, assistantId);
      expect(detail(controller, id).messages.find((m) => m.id === assistantId)).toMatchObject({ result: { status } });
    }
  });
});

describe("mergeMessages", () => {
  it("keeps seq order and marks older revisions of the same key as not latest", () => {
    const user = (id: string, seq: number, revision: number): ThreadMessageView => ({
      role: "user",
      id,
      seq,
      revision,
      isLatestRevision: true,
      requestKey: "k",
      text: "t",
      createdAt: "",
      state: "completed",
      stateLabel: "",
      author: { displayName: null, isSelf: true },
      context: [],
      confirmedStatements: 0,
    });
    const merged = mergeMessages([user("b", 3, 2)], [user("a", 1, 1)]);
    expect(merged.map((m) => m.id)).toEqual(["a", "b"]);
    expect(merged.map((m) => m.role === "user" && m.isLatestRevision)).toEqual([false, true]);
  });
});
