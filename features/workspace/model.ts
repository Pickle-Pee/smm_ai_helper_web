import type { ID, Message, ResultStatus, ScenarioId, StructuredResult, Thread } from "@/lib/types";
import type { ResourceStatus } from "@/lib/resource";

export interface DraftIntent {
  projectId: ID | null;
  scenarioId: ScenarioId | null;
  text: string;
}

export interface WorkspaceState {
  status: ResourceStatus;
  threads: Thread[];
  /** Prepared by other screens (dashboard, documents) and consumed by the AI Workspace composer. */
  pendingDraft: DraftIntent | null;
}

export type WorkspaceAction =
  | { type: "loading" }
  | { type: "loaded"; threads: Thread[] }
  | { type: "failed" }
  | { type: "threadCreated"; thread: Thread }
  | { type: "messageAdded"; threadId: ID; message: Message }
  | { type: "threadProjectChanged"; threadId: ID; projectId: ID | null }
  | { type: "threadDeleted"; threadId: ID }
  | { type: "resultStatusChanged"; threadId: ID; messageId: ID; status: ResultStatus }
  | { type: "checklistToggled"; threadId: ID; messageId: ID; itemId: ID }
  | { type: "draftPrepared"; draft: DraftIntent }
  | { type: "draftConsumed" };

export const initialWorkspaceState: WorkspaceState = { status: "loading", threads: [], pendingDraft: null };

export const NEW_THREAD_TITLE = "Новый диалог";

export function titleFromText(text: string, max = 56): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

function updateThread(threads: Thread[], id: ID, fn: (t: Thread) => Thread): Thread[] {
  return threads.map((t) => (t.id === id ? fn(t) : t));
}

function updateResult(thread: Thread, messageId: ID, fn: (r: StructuredResult) => StructuredResult): Thread {
  return {
    ...thread,
    messages: thread.messages.map((m) => (m.id === messageId && m.result ? { ...m, result: fn(m.result) } : m)),
  };
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "loading":
      return { ...state, status: "loading" };
    case "loaded":
      return { ...state, status: "ready", threads: action.threads };
    case "failed":
      return { ...state, status: "error" };
    case "threadCreated":
      return { ...state, threads: [action.thread, ...state.threads] };
    case "messageAdded": {
      const text = action.message.text.trim();
      if (!text) return state;
      return {
        ...state,
        threads: updateThread(state.threads, action.threadId, (t) => ({
          ...t,
          title: t.messages.length === 0 && t.title === NEW_THREAD_TITLE ? titleFromText(text) : t.title,
          updatedAt: action.message.createdAt,
          messages: [...t.messages, { ...action.message, text }],
        })),
      };
    }
    case "threadProjectChanged":
      return {
        ...state,
        threads: updateThread(state.threads, action.threadId, (t) => ({ ...t, projectId: action.projectId })),
      };
    case "threadDeleted":
      return { ...state, threads: state.threads.filter((t) => t.id !== action.threadId) };
    case "resultStatusChanged":
      return {
        ...state,
        threads: updateThread(state.threads, action.threadId, (t) =>
          updateResult(t, action.messageId, (r) => ({ ...r, status: action.status })),
        ),
      };
    case "checklistToggled":
      return {
        ...state,
        threads: updateThread(state.threads, action.threadId, (t) =>
          updateResult(t, action.messageId, (r) => ({
            ...r,
            blocks: r.blocks.map((b) =>
              b.type === "checklist"
                ? { ...b, items: b.items.map((i) => (i.id === action.itemId ? { ...i, done: !i.done } : i)) }
                : b,
            ),
          })),
        ),
      };
    case "draftPrepared":
      return { ...state, pendingDraft: action.draft };
    case "draftConsumed":
      return { ...state, pendingDraft: null };
    default:
      return state;
  }
}

/* ---------------- Selectors ---------------- */

export function sortThreads(threads: Thread[]): Thread[] {
  return [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function filterThreads(threads: Thread[], query: string, projectId: ID | "all" = "all"): Thread[] {
  const q = query.trim().toLocaleLowerCase("ru");
  return sortThreads(threads).filter((t) => {
    if (projectId !== "all" && t.projectId !== projectId) return false;
    if (!q) return true;
    return (
      t.title.toLocaleLowerCase("ru").includes(q) ||
      t.messages.some((m) =>
        [m.text, m.result?.title ?? "", m.result?.summary ?? ""].some((v) => v.toLocaleLowerCase("ru").includes(q)),
      )
    );
  });
}

export interface ResultEntry {
  threadId: ID;
  messageId: ID;
  projectId: ID | null;
  createdAt: string;
  result: StructuredResult;
}

export function selectResults(threads: Thread[]): ResultEntry[] {
  return threads
    .flatMap((t) =>
      t.messages
        .filter((m): m is Message & { result: StructuredResult } => Boolean(m.result))
        .map((m) => ({ threadId: t.id, messageId: m.id, projectId: t.projectId, createdAt: m.createdAt, result: m.result })),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function countThreadsByProject(threads: Thread[]): Map<ID, number> {
  const counts = new Map<ID, number>();
  for (const t of threads) if (t.projectId) counts.set(t.projectId, (counts.get(t.projectId) ?? 0) + 1);
  return counts;
}

export const resultStatusLabel: Record<ResultStatus, string> = {
  review: "Требует проверки",
  approved: "Проверено",
  draft: "Черновик",
};

/** Plain-text rendering of a result for the clipboard. */
export function resultToPlainText(result: Pick<StructuredResult, "title" | "summary" | "blocks">): string {
  const lines: string[] = [result.title, "", result.summary];
  for (const block of result.blocks) {
    lines.push("");
    switch (block.type) {
      case "paragraph":
      case "heading":
        lines.push(block.text);
        break;
      case "callout":
        lines.push(`Важно: ${block.text}`);
        break;
      case "list":
        block.items.forEach((item, i) => lines.push(`${block.ordered ? `${i + 1}.` : "•"} ${item}`));
        break;
      case "metrics":
        block.items.forEach((m) => lines.push(`${m.label}: ${m.value}${m.hint ? ` (${m.hint})` : ""}`));
        break;
      case "stages":
        block.items.forEach((s) => {
          lines.push(`${s.period} — ${s.title}`);
          s.points.forEach((p) => lines.push(`  • ${p}`));
        });
        break;
      case "table":
        if (block.caption) lines.push(block.caption);
        lines.push(block.columns.join(" | "));
        block.rows.forEach((r) => lines.push(r.join(" | ")));
        break;
      case "checklist":
        if (block.title) lines.push(block.title);
        block.items.forEach((i) => lines.push(`[${i.done ? "x" : " "}] ${i.text}`));
        break;
    }
  }
  return lines.join("\n");
}
