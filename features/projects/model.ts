import type { BrandColor, ID, Project, ProjectInput, ProjectStatus } from "@/lib/types";
import type { ResourceStatus } from "@/lib/resource";

export interface ProjectsState {
  status: ResourceStatus;
  items: Project[];
}

export type ProjectsAction =
  | { type: "loading" }
  | { type: "loaded"; items: Project[] }
  | { type: "failed" }
  | { type: "created"; project: Project }
  | { type: "updated"; id: ID; patch: Partial<Omit<Project, "id" | "createdAt">>; at: string };

export const initialProjectsState: ProjectsState = { status: "loading", items: [] };

export function projectsReducer(state: ProjectsState, action: ProjectsAction): ProjectsState {
  switch (action.type) {
    case "loading":
      return { ...state, status: "loading" };
    case "loaded":
      return { status: "ready", items: action.items };
    case "failed":
      return { ...state, status: "error" };
    case "created":
      return { ...state, items: [action.project, ...state.items] };
    case "updated":
      return {
        ...state,
        items: state.items.map((p) => (p.id === action.id ? { ...p, ...action.patch, updatedAt: action.at } : p)),
      };
    default:
      return state;
  }
}

const palette: BrandColor[] = ["teal", "violet", "coral", "amber", "blue", "green"];

export function buildProject(input: ProjectInput, id: ID, at: string, existingCount = 0): Project {
  return {
    id,
    name: input.name.trim(),
    industry: input.industry.trim(),
    status: "draft",
    color: input.color ?? palette[existingCount % palette.length],
    description: input.description?.trim() ?? "",
    audience: input.audience?.trim() ?? "",
    usp: input.usp?.trim() ?? "",
    toneOfVoice: input.toneOfVoice?.trim() ?? "",
    goals: input.goals?.trim() ?? "",
    competitors: input.competitors ?? [],
    channels: input.channels ?? [],
    createdAt: at,
    updatedAt: at,
  };
}

export interface ProjectValidation {
  name?: string;
  industry?: string;
}

export function validateProjectInput(input: { name: string; industry: string }): ProjectValidation {
  const errors: ProjectValidation = {};
  const name = input.name.trim();
  if (!name) errors.name = "Укажите название проекта или бренда";
  else if (name.length > 80) errors.name = "Не более 80 символов";
  if (!input.industry.trim()) errors.industry = "Укажите сферу бизнеса — AI использует её как контекст";
  return errors;
}

/* ---------------- Filtering ---------------- */

export type ProjectStatusFilter = ProjectStatus | "all";
export type ProjectSort = "recent" | "name";

export interface ProjectFilter {
  query: string;
  status: ProjectStatusFilter;
  sort: ProjectSort;
}

export const defaultProjectFilter: ProjectFilter = { query: "", status: "all", sort: "recent" };

export function filterProjects(items: Project[], filter: ProjectFilter): Project[] {
  const query = filter.query.trim().toLocaleLowerCase("ru");
  const filtered = items.filter((p) => {
    if (filter.status !== "all" && p.status !== filter.status) return false;
    if (!query) return true;
    return [p.name, p.industry, p.description].some((v) => v.toLocaleLowerCase("ru").includes(query));
  });
  return filtered.sort((a, b) =>
    filter.sort === "name" ? a.name.localeCompare(b.name, "ru") : b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function countByStatus(items: Project[]): Record<ProjectStatusFilter, number> {
  return {
    all: items.length,
    active: items.filter((p) => p.status === "active").length,
    draft: items.filter((p) => p.status === "draft").length,
    archived: items.filter((p) => p.status === "archived").length,
  };
}

/* ---------------- Business context completeness ---------------- */

export const contextFields = [
  { key: "description", label: "Описание продукта" },
  { key: "audience", label: "Целевая аудитория" },
  { key: "usp", label: "УТП" },
  { key: "toneOfVoice", label: "Tone of voice" },
  { key: "goals", label: "Цели" },
  { key: "competitors", label: "Конкуренты" },
  { key: "channels", label: "Каналы" },
] as const satisfies readonly { key: keyof Project; label: string }[];

export function contextCompleteness(project: Project): { percent: number; missing: string[] } {
  const missing = contextFields
    .filter(({ key }) => {
      const value = project[key];
      return Array.isArray(value) ? value.length === 0 : !String(value).trim();
    })
    .map((f) => f.label);
  const percent = Math.round(((contextFields.length - missing.length) / contextFields.length) * 100);
  return { percent, missing };
}

export const projectStatusLabel: Record<ProjectStatus, string> = {
  active: "Активный",
  draft: "Черновик",
  archived: "Архив",
};

/** Parses a comma / newline separated list typed into a form field. */
export function parseList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
}
