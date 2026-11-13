/**
 * Domain types shared by the API contracts and UI features.
 * These describe the frontend's view model; they are NOT the backend contract
 * (no authenticated Web API is approved yet — see AGENTS.md).
 */

export type ID = string;
export type ISODate = string;

/* ---------------- Projects / brands ---------------- */

export type ProjectStatus = "active" | "draft" | "archived";

export type BrandColor = "teal" | "violet" | "coral" | "amber" | "blue" | "green";

export interface Project {
  id: ID;
  name: string;
  industry: string;
  status: ProjectStatus;
  color: BrandColor;
  /** What the business sells, in the user's words. */
  description: string;
  audience: string;
  usp: string;
  toneOfVoice: string;
  goals: string;
  competitors: string[];
  channels: string[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type ProjectInput = Pick<Project, "name" | "industry"> &
  Partial<Pick<Project, "description" | "audience" | "usp" | "toneOfVoice" | "goals" | "competitors" | "channels" | "color">>;

/* ---------------- AI workspace ---------------- */

export type ScenarioId = "competitors" | "strategy" | "content-plan" | "positioning" | "audience" | "ad-copy";

export type ResultStatus = "review" | "approved" | "draft";

export type ResultBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "metrics"; items: { label: string; value: string; hint?: string }[] }
  | { type: "stages"; items: { title: string; period: string; points: string[] }[] }
  | { type: "table"; caption?: string; columns: string[]; rows: string[][] }
  | { type: "checklist"; title?: string; items: { id: ID; text: string; done: boolean }[] }
  | { type: "callout"; tone: "info" | "warning"; text: string };

export interface StructuredResult {
  kind: ScenarioId;
  title: string;
  summary: string;
  status: ResultStatus;
  blocks: ResultBlock[];
}

export type MessageRole = "user" | "assistant";

export interface Message {
  id: ID;
  role: MessageRole;
  createdAt: ISODate;
  text: string;
  /** Present on assistant messages that carry a structured marketing result. */
  result?: StructuredResult;
  /**
   * `local` marks messages typed in this browser tab. They are never sent to an AI provider
   * until the Web API exists, and the UI states this next to the message.
   */
  delivery?: "local";
}

export interface Thread {
  id: ID;
  title: string;
  projectId: ID | null;
  scenarioId: ScenarioId | null;
  createdAt: ISODate;
  updatedAt: ISODate;
  messages: Message[];
}

/* ---------------- Documents ---------------- */

export type DocumentKind = "sheet" | "doc" | "pdf" | "slides" | "card" | "file";

export type DocumentSource = "ai" | "upload" | "template";

export interface DocumentItem {
  id: ID;
  name: string;
  kind: DocumentKind;
  projectId: ID | null;
  source: DocumentSource;
  sizeKb: number;
  updatedAt: ISODate;
  favorite: boolean;
  /** Short human description shown in the preview panel. */
  summary: string;
}

export interface DocumentTemplate {
  id: ID;
  name: string;
  kind: DocumentKind;
  description: string;
  scenarioId: ScenarioId;
}
