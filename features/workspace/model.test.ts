import { describe, expect, it } from "vitest";
import { createMockDataset } from "@/lib/mock/data";
import type { Thread } from "@/lib/types";
import {
  countThreadsByProject,
  filterThreads,
  initialWorkspaceState,
  NEW_THREAD_TITLE,
  resultToPlainText,
  selectResults,
  titleFromText,
  workspaceReducer,
  type WorkspaceState,
} from "./model";
import { scenarioPrompt, scenarios } from "./scenarios";

const now = new Date("2026-11-13T10:00:00Z");
const { threads } = createMockDataset(now);
const loaded: WorkspaceState = workspaceReducer(initialWorkspaceState, { type: "loaded", threads });

const emptyThread: Thread = {
  id: "t-new",
  title: NEW_THREAD_TITLE,
  projectId: null,
  scenarioId: null,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  messages: [],
};

describe("workspace reducer", () => {
  it("adds trimmed local messages and names an empty thread after the first message", () => {
    let state = workspaceReducer(loaded, { type: "threadCreated", thread: emptyThread });
    state = workspaceReducer(state, {
      type: "messageAdded",
      threadId: "t-new",
      message: { id: "m1", role: "user", text: "  Нужен контент-план на декабрь  ", createdAt: "2026-11-13T11:00:00Z", delivery: "local" },
    });
    const thread = state.threads.find((t) => t.id === "t-new")!;
    expect(thread.title).toBe("Нужен контент-план на декабрь");
    expect(thread.messages[0]).toMatchObject({ text: "Нужен контент-план на декабрь", delivery: "local" });
    expect(thread.updatedAt).toBe("2026-11-13T11:00:00Z");
  });

  it("ignores empty messages", () => {
    const state = workspaceReducer(loaded, {
      type: "messageAdded",
      threadId: "t-lf-strategy",
      message: { id: "m-empty", role: "user", text: "   ", createdAt: now.toISOString() },
    });
    expect(state).toBe(loaded);
  });

  it("changes result status and toggles checklist items", () => {
    let state = workspaceReducer(loaded, { type: "resultStatusChanged", threadId: "t-lf-strategy", messageId: "m-lf-2", status: "approved" });
    state = workspaceReducer(state, { type: "checklistToggled", threadId: "t-lf-strategy", messageId: "m-lf-2", itemId: "c-2" });
    const result = state.threads.find((t) => t.id === "t-lf-strategy")!.messages[1].result!;
    expect(result.status).toBe("approved");
    const checklist = result.blocks.find((b) => b.type === "checklist");
    expect(checklist?.type === "checklist" && checklist.items.find((i) => i.id === "c-2")?.done).toBe(true);
  });

  it("deletes threads and changes their brand", () => {
    let state = workspaceReducer(loaded, { type: "threadProjectChanged", threadId: "t-mb-audience", projectId: "p-forma" });
    expect(state.threads.find((t) => t.id === "t-mb-audience")?.projectId).toBe("p-forma");
    state = workspaceReducer(state, { type: "threadDeleted", threadId: "t-mb-audience" });
    expect(state.threads.some((t) => t.id === "t-mb-audience")).toBe(false);
  });

  it("stores and consumes a draft intent", () => {
    let state = workspaceReducer(loaded, { type: "draftPrepared", draft: { projectId: "p-forma", scenarioId: "strategy", text: "x" } });
    expect(state.pendingDraft?.projectId).toBe("p-forma");
    state = workspaceReducer(state, { type: "draftConsumed" });
    expect(state.pendingDraft).toBeNull();
  });
});

describe("selectors", () => {
  it("collects AI results newest first", () => {
    const results = selectResults(threads);
    expect(results.length).toBe(5);
    expect(results.map((r) => r.createdAt)).toEqual([...results.map((r) => r.createdAt)].sort().reverse());
    expect(results.filter((r) => r.result.status === "review")).toHaveLength(2);
  });

  it("searches thread titles and message text", () => {
    expect(filterThreads(threads, "бранч").map((t) => t.id)).toEqual(["t-sb-brunch"]);
    expect(filterThreads(threads, "", "p-little-feet")).toHaveLength(2);
    // Matches inside an AI result summary, not only in message text.
    expect(filterThreads(threads, "главный страх").map((t) => t.id)).toEqual(["t-lf-usp"]);
  });

  it("counts threads per project", () => {
    expect(countThreadsByProject(threads).get("p-sea-bottom")).toBe(2);
  });

  it("serialises a result to plain text for the clipboard", () => {
    const text = resultToPlainText(selectResults(threads).find((r) => r.result.kind === "competitors")!.result);
    expect(text).toContain("Конкурент | Позиционирование");
    expect(text).toContain("• Запустить деловой сет");
  });
});

describe("titles and prompts", () => {
  it("shortens long titles at a word boundary", () => {
    const title = titleFromText("Сделай подробный анализ конкурентов в сегменте детских садов премиум-класса в Казани", 40);
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(41);
  });

  it("does not double-quote brand names that already contain quotes", () => {
    const scenario = scenarios[0];
    expect(scenarioPrompt(scenario, "Little Feet")).toContain("бренда «Little Feet»");
    expect(scenarioPrompt(scenario, "Кофейня «Зерно»")).toContain("бренда Кофейня «Зерно»");
    expect(scenarioPrompt(scenario, null)).toContain("моего бренда");
  });
});
