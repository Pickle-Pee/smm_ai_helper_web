import { describe, expect, it } from "vitest";
import { WebApiError } from "./errors";
import { fixtures } from "./fixtures";
import { presentAssistantMessage, presentError, presentExecution, presentResultError, presentSnapshot, toUiProject, toUiThread } from "./presenters";
import { createRequestKey, isRequestKey } from "./request-key";
import type { AssistantMessage, ResultSnapshot } from "./types";

function assistantOf(name: keyof typeof fixtures.responses): AssistantMessage {
  const r = (fixtures.responses[name] as () => { assistant_message: AssistantMessage | null })();
  if (!r.assistant_message) throw new Error(`${name} has no assistant message`);
  return r.assistant_message;
}

describe("DTO → existing UI models", () => {
  it("maps a project and its brand to lib/types Project", () => {
    const dto = fixtures.responses.project();
    const ui = toUiProject(dto);
    expect(ui).toMatchObject({ id: dto.id, name: dto.name, status: dto.status, createdAt: dto.created_at, updatedAt: dto.updated_at });
    expect(ui.description).toBe(dto.brand.product_description ?? "");
    expect(ui.toneOfVoice).toBe(dto.brand.tone ?? "");
    expect(ui.channels).toEqual(dto.brand.channels);
    expect(ui.goals).toBe(dto.brand.goals.join("; "));
    expect(ui.industry).toBe(dto.brand.extra.industry ?? "");
  });

  it("handles nullable brand fields and a null color", () => {
    const dto = fixtures.responses.projectsList().items[1];
    const ui = toUiProject({ ...dto, color: null });
    expect(ui).toMatchObject({ color: "teal", description: "", audience: "", usp: "", toneOfVoice: "", goals: "", competitors: [] });
  });

  it("maps thread metadata without inventing messages or scenarios", () => {
    const ui = toUiThread(fixtures.responses.threadCreated());
    expect(ui).toMatchObject({ projectId: fixtures.responses.threadCreated().project_id, scenarioId: null, messages: [] });
  });
});

describe("result presentation: stored vs presentation vs viewer", () => {
  it("renders content only from presentation.payload and keeps immutable metadata apart", () => {
    const snapshot = fixtures.responses.resultSnapshotRun();
    const view = presentSnapshot(snapshot);
    if (view.status !== "available") throw new Error();
    const content = JSON.stringify([view.title, view.summary, view.blocks]);
    expect(content).toContain(snapshot.result_kind === "RUN" ? snapshot.presentation.payload.strategy!.strategic_diagnosis.text : "");
    expect(content).not.toContain(snapshot.stored.payload_sha256);
    expect(content).not.toContain(snapshot.provenance.request_key);
    expect(view.meta.stored).toEqual({
      schemaVersion: snapshot.stored.schema_version,
      payloadSha256: snapshot.stored.payload_sha256,
      writerVersion: snapshot.stored.writer_version,
    });
    expect(view.meta.provenance.authorUserId).toBe(42);
    expect(view.meta.author).toEqual({ displayName: "Мария", isSelf: true });
    expect(presentSnapshot(fixtures.responses.resultSnapshotRunOtherMember())).toMatchObject({ meta: { author: { isSelf: false } } });
  });

  it("an upcast presentation is shown as available and its version is reported, never as corrupted", () => {
    const snapshot = fixtures.responses.resultSnapshotRun() as ResultSnapshot & { result_kind: "RUN" };
    const upcast = { ...snapshot, presentation: { ...snapshot.presentation, upcasters: ["copilot_api.v0->copilot_api.v1/RUN"] } };
    const view = presentSnapshot(upcast);
    expect(view.status).toBe("available");
    if (view.status === "available") expect(view.meta.presentation.upcasters).toEqual(["copilot_api.v0->copilot_api.v1/RUN"]);
  });

  it.each([
    ["messageDirect", "DIRECT_RESULT", "Расчёт"],
    ["messageModule", "MODULE_RESULT", "Публикация"],
    ["messageClarificationCompleted", "MODULE_RESULT", "Позиционирование"],
    ["messageNeedsInput", "NEEDS_INPUT", "Нужно уточнение"],
    ["messageStrategyCompleted", "RUN", "Стратегия продвижения"],
    ["messageRunFailed", "RUN", "Стратегия не сформирована"],
    ["messageUnsupported", "UNSUPPORTED", "Свободный диалог пока недоступен"],
  ] as const)("%s → %s view", (name, kind, title) => {
    const view = presentAssistantMessage(assistantOf(name));
    expect(view).toMatchObject({ status: "available", kind, title });
    if (view.status === "available") expect(view.blocks.length).toBeGreaterThan(0);
  });

  it("NEEDS_INPUT exposes the clarification groups with readable labels and site candidates", () => {
    const view = presentAssistantMessage(assistantOf("messageNeedsInput"));
    if (view.status !== "available" || !view.clarification) throw new Error();
    expect(view.clarification.code).toBe("POSITIONING_CONTEXT_MISSING");
    expect(view.clarification.alternatives[0]).toContain("Задача или потребность клиента");
    expect(view.clarification.candidates).toHaveLength(2);
  });

  it("format_unsupported, corrupted and unreadable are separate non-content states", () => {
    const page = fixtures.responses.threadMessagesFormatUnsupported();
    const am = page.items.find((m): m is AssistantMessage => m.role === "assistant")!;
    expect(presentAssistantMessage(am)).toMatchObject({ status: "format_unsupported" });
    expect(presentAssistantMessage({ ...am, result_status: "corrupted" })).toMatchObject({ status: "corrupted" });
    expect(presentAssistantMessage({ ...am, result_status: "unreadable" })).toMatchObject({ status: "unreadable" });
    const err = (code: "result_corrupted" | "result_unreadable" | "result_format_unsupported" | "not_found") =>
      new WebApiError({ kind: "http", operation: "getMessageResult", status: 503, code });
    expect(presentResultError(err("result_corrupted"))?.status).toBe("corrupted");
    expect(presentResultError(err("result_unreadable"))?.status).toBe("unreadable");
    expect(presentResultError(err("result_format_unsupported"))?.status).toBe("format_unsupported");
    expect(presentResultError(err("not_found"))).toBeNull();
  });
});

describe("execution state presentation (server-authoritative)", () => {
  it.each([
    ["messageWorkflowStarted", "running", "poll", false],
    ["messageRunningOverdue", "running_overdue", "poll", true],
    ["messageNeedsInput", "needs_input", "answer_clarification", false],
    ["messageAmbiguous", "ambiguous", "start_new_request", true],
    ["messageExpired", "expired", "start_new_request", true],
    ["messagePendingResubmit", "pending", "resubmit_same_key", false],
    ["messageDirect", "completed", "none", false],
  ] as const)("%s → %s", (name, status, nextAction, offersNewRequest) => {
    const view = presentExecution((fixtures.responses[name] as () => Parameters<typeof presentExecution>[0])());
    expect(view).toMatchObject({ status, nextAction, offersNewRequest });
    expect(view.canResubmitSameKey).toBe(nextAction === "resubmit_same_key");
    expect(view.newRequestWarning !== null).toBe(offersNewRequest);
  });

  it("never derives ambiguous from time: an overdue running request stays running_overdue", () => {
    const r = fixtures.responses.messageRunningOverdue();
    r.user_message.created_at = "2000-01-01T00:00:00Z";
    expect(presentExecution(r).status).toBe("running_overdue");
  });

  it("explains that an expired window does not prove the model did not run", () => {
    const r = fixtures.responses.messagePendingResubmit();
    r.state = "expired";
    r.next_action = "start_new_request";
    r.user_message.state = "expired";
    r.user_message.state_reason = "recovery_window_elapsed";
    expect(presentExecution(r).description).toMatch(/не доказывает/);
  });
});

describe("errors and keys", () => {
  it("localizes by code and keeps request_id, Retry-After and resets_at", () => {
    const body = fixtures.errors.quotaExceeded();
    const err = new WebApiError({ kind: "http", operation: "submitMessage", status: 429, code: "quota_exceeded", requestId: body.request_id, retryAfterSeconds: 41400, quota: body.quota });
    expect(presentError(err)).toEqual({ text: "Достигнут дневной лимит генераций.", requestId: body.request_id, retryAfterSeconds: 41400, resetsAt: body.quota!.resets_at });
    expect(presentError(new WebApiError({ kind: "network", operation: "getMe", status: null, code: null })).text).toMatch(/не отправляя/);
  });

  it("mints UUIDv7 request keys that match the contract pattern", () => {
    const key = createRequestKey({ now: () => Date.parse("2026-11-20T10:00:00Z"), randomBytes: (b) => b.fill(0xab) });
    expect(isRequestKey(key)).toBe(true);
    expect(key).toBe("w-0193a0e2-8e00-7bab-abab-abababababab".replace("0193a0e2-8e00", key.slice(2, 15)));
    expect(key.slice(2, 15)).toBe(Date.parse("2026-11-20T10:00:00Z").toString(16).padStart(12, "0").replace(/^(.{8})/, "$1-"));
    expect(new Set(Array.from({ length: 50 }, () => createRequestKey())).size).toBe(50);
    expect(isRequestKey("tg:1:2:3")).toBe(false);
  });
});
