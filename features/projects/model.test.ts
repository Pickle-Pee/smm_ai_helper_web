import { describe, expect, it } from "vitest";
import { createMockDataset } from "@/lib/mock/data";
import {
  buildProject,
  contextCompleteness,
  countByStatus,
  filterProjects,
  initialProjectsState,
  parseList,
  projectsReducer,
  validateProjectInput,
} from "./model";

const now = new Date("2026-11-13T10:00:00Z");
const { projects } = createMockDataset(now);

describe("projects reducer", () => {
  it("loads, creates and updates projects", () => {
    let state = projectsReducer(initialProjectsState, { type: "loaded", items: projects });
    expect(state.status).toBe("ready");

    const created = buildProject({ name: "  Кофейня «Зерно» ", industry: "Кофейня" }, "p-new", now.toISOString(), state.items.length);
    state = projectsReducer(state, { type: "created", project: created });
    expect(state.items[0]).toMatchObject({ id: "p-new", name: "Кофейня «Зерно»", status: "draft" });

    state = projectsReducer(state, { type: "updated", id: "p-new", patch: { usp: "Свежая обжарка" }, at: "2026-11-14T00:00:00Z" });
    expect(state.items[0].usp).toBe("Свежая обжарка");
    expect(state.items[0].updatedAt).toBe("2026-11-14T00:00:00Z");
  });

  it("marks failures without dropping data", () => {
    const loaded = projectsReducer(initialProjectsState, { type: "loaded", items: projects });
    const failed = projectsReducer(loaded, { type: "failed" });
    expect(failed.status).toBe("error");
    expect(failed.items).toHaveLength(projects.length);
  });
});

describe("validateProjectInput", () => {
  it("requires name and industry", () => {
    expect(validateProjectInput({ name: " ", industry: "" })).toEqual({
      name: expect.any(String),
      industry: expect.any(String),
    });
    expect(validateProjectInput({ name: "Little Feet", industry: "Детский сад" })).toEqual({});
  });

  it("limits name length", () => {
    expect(validateProjectInput({ name: "x".repeat(81), industry: "a" }).name).toBeDefined();
  });
});

describe("filterProjects", () => {
  it("filters by status and query (case-insensitive, Cyrillic)", () => {
    expect(filterProjects(projects, { query: "", status: "archived", sort: "recent" }).map((p) => p.id)).toEqual(["p-warm-home"]);
    expect(filterProjects(projects, { query: "РЕСТОРАН", status: "all", sort: "recent" }).map((p) => p.id)).toEqual(["p-sea-bottom"]);
  });

  it("sorts by name using Russian collation", () => {
    const names = filterProjects(projects, { query: "", status: "all", sort: "name" }).map((p) => p.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "ru")));
  });

  it("sorts by most recent update by default", () => {
    const result = filterProjects(projects, { query: "", status: "all", sort: "recent" });
    expect(result[0].id).toBe("p-little-feet");
  });

  it("counts by status", () => {
    expect(countByStatus(projects)).toEqual({ all: 5, active: 3, draft: 1, archived: 1 });
  });
});

describe("contextCompleteness", () => {
  it("is 100% for a fully described brand", () => {
    const littleFeet = projects.find((p) => p.id === "p-little-feet")!;
    expect(contextCompleteness(littleFeet)).toEqual({ percent: 100, missing: [] });
  });

  it("lists missing fields for a partial brand", () => {
    const draft = projects.find((p) => p.id === "p-my-brand")!;
    const { percent, missing } = contextCompleteness(draft);
    expect(percent).toBe(43);
    expect(missing).toEqual(["Целевая аудитория", "УТП", "Цели", "Конкуренты"]);
  });
});

it("parseList splits on commas and new lines", () => {
  expect(parseList("VK, Telegram\n 2ГИС ,, ")).toEqual(["VK", "Telegram", "2ГИС"]);
});
