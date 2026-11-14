"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAccount } from "@/features/account/store";
import { useWorkspaceV2Data } from "@/features/workspace/v2/provider";
import type { ProjectDetailView, ThreadDetailView, WorkspaceV2Controller } from "@/features/workspace/v2/controller";
import type { ThreadSummaryView, WorkspaceProjectView } from "@/lib/api/v2/presenters";
import type { ResourceStatus } from "@/lib/resource";

/**
 * Unified project context (F3).
 *
 * ONE source of project and Copilot-thread identity for every screen: the session's `WorkspaceV2Controller`, which
 * reads Web API v2 through the app's single transport (fixture-only). This module is only a read-only view over
 * the controller's state — it never copies projects or threads into a reducer of its own, so there is nothing that
 * could drift from the source.
 *
 * The only state kept here is UI navigation state: which project the user is working on in this session
 * ("selected brand"), so Dashboard → Projects → AI Workspace keep the same `project_id`. It is never used to pick
 * another project when the selected one is missing: a stale id simply resolves to no project.
 */

interface SelectionCtx {
  selectedProjectId: string | null;
  selectProject: (projectId: string | null) => void;
}

const ProjectSelectionContext = createContext<SelectionCtx | null>(null);

export function ProjectContextProvider({ children }: { children: ReactNode }) {
  const [selectedProjectId, setSelected] = useState<string | null>(null);
  const value = useMemo<SelectionCtx>(() => ({ selectedProjectId, selectProject: setSelected }), [selectedProjectId]);
  return <ProjectSelectionContext.Provider value={value}>{children}</ProjectSelectionContext.Provider>;
}

/** Request state of a thread as list markers show it (same rule in the Workspace history and on Dashboard). */
export type ThreadAttention = "unresolved" | "running" | null;

export function threadAttention(summary: ThreadSummaryView, detail: ThreadDetailView | undefined): ThreadAttention {
  const request = detail?.request;
  if (request?.phase === "unknown" || request?.execution?.status === "ambiguous") return "unresolved";
  if (summary.inFlight || request?.phase === "waiting") return "running";
  return null;
}

export interface ProjectContextValue {
  status: ResourceStatus;
  /** Fixture Web API v2 projects (the only project identity the app uses). */
  projects: WorkspaceProjectView[];
  byId: ReadonlyMap<string, WorkspaceProjectView>;
  /** Copilot thread summaries of every project, newest first. */
  threads: ThreadSummaryView[];
  threadsFor: (projectId: string) => ThreadSummaryView[];
  attentionOf: (thread: ThreadSummaryView) => ThreadAttention;
  /** Session selection. `selectedProject` is null when nothing is selected OR the id no longer resolves. */
  selectedProjectId: string | null;
  selectedProject: WorkspaceProjectView | null;
  selectProject: (projectId: string | null) => void;
  retry: () => void;
  controller: WorkspaceV2Controller | null;
}

export function useProjectContext(): ProjectContextValue {
  const selection = useContext(ProjectSelectionContext);
  if (!selection) throw new Error("useProjectContext must be used inside <ProjectContextProvider>");
  const { controller, state } = useWorkspaceV2Data();
  const { demoView, setDemoView } = useAccount();

  // Demo-state override from Settings («Демо-состояния») applies here exactly as in the Workspace.
  const status: ResourceStatus =
    demoView === "loading" ? "loading" : demoView === "error" ? "error" : state.status === "error" ? "error" : state.status === "ready" ? "ready" : "loading";
  const empty = demoView === "empty" || status !== "ready";
  const projects = empty ? EMPTY_PROJECTS : state.projects;
  const threads = empty ? EMPTY_THREADS : state.threads;
  const details = state.details;

  const byId = useMemo(() => new Map(projects.map((p) => [p.project.id, p])), [projects]);
  const grouped = useMemo(() => {
    const map = new Map<string, ThreadSummaryView[]>();
    for (const t of threads) map.set(t.projectId, [...(map.get(t.projectId) ?? []), t]);
    return map;
  }, [threads]);
  const threadsFor = useCallback((projectId: string) => grouped.get(projectId) ?? EMPTY_THREADS, [grouped]);
  const attentionOf = useCallback((t: ThreadSummaryView) => threadAttention(t, details[t.id]), [details]);

  const retry = useCallback(() => {
    if (demoView !== "live") setDemoView("live");
    else void controller?.reload();
  }, [demoView, setDemoView, controller]);

  return {
    status,
    projects,
    byId,
    threads,
    threadsFor,
    attentionOf,
    selectedProjectId: selection.selectedProjectId,
    selectedProject: selection.selectedProjectId ? (byId.get(selection.selectedProjectId) ?? null) : null,
    selectProject: selection.selectProject,
    retry,
    controller,
  };
}

const EMPTY_PROJECTS: WorkspaceProjectView[] = [];
const EMPTY_THREADS: ThreadSummaryView[] = [];
const LOADING_DETAIL: ProjectDetailView = { status: "loading", project: null, brand: null, brandError: false };

/** One project with its brand context, read by id (`getProject` + `getProjectBrand`). Read-only. */
export function useProjectDetail(projectId: string): { detail: ProjectDetailView; retry: () => void } {
  const { controller, state } = useWorkspaceV2Data();
  const { demoView, setDemoView } = useAccount();

  useEffect(() => {
    if (controller && demoView === "live") void controller.loadProject(projectId);
  }, [controller, projectId, demoView]);

  const retry = useCallback(() => {
    if (demoView !== "live") setDemoView("live");
    else void controller?.loadProject(projectId);
  }, [controller, projectId, demoView, setDemoView]);

  const live = state.projectDetails[projectId] ?? LOADING_DETAIL;
  const detail: ProjectDetailView =
    demoView === "loading" ? LOADING_DETAIL : demoView === "error" ? { ...LOADING_DETAIL, status: "error" } : demoView === "empty" ? { ...LOADING_DETAIL, status: "not_found" } : live;
  return { detail, retry };
}
