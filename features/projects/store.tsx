"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { useApi } from "@/lib/api/provider";
import { applyDemoView, type ResourceStatus } from "@/lib/resource";
import { createId } from "@/lib/format";
import type { ID, Project, ProjectInput } from "@/lib/types";
import { useAccount } from "@/features/account/store";
import { buildProject, initialProjectsState, projectsReducer } from "./model";

interface ProjectsContextValue {
  status: ResourceStatus;
  items: Project[];
  reload: () => Promise<void>;
  createProject: (input: ProjectInput) => Project;
  updateProject: (id: ID, patch: Partial<Omit<Project, "id" | "createdAt">>) => void;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [state, dispatch] = useReducer(projectsReducer, initialProjectsState);
  const countRef = useRef(0);
  countRef.current = state.items.length;

  const reload = useCallback(async () => {
    dispatch({ type: "loading" });
    try {
      dispatch({ type: "loaded", items: await api.projects.list() });
    } catch {
      dispatch({ type: "failed" });
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createProject = useCallback((input: ProjectInput) => {
    const project = buildProject(input, createId("p"), new Date().toISOString(), countRef.current);
    dispatch({ type: "created", project });
    return project;
  }, []);

  const updateProject = useCallback((id: ID, patch: Partial<Omit<Project, "id" | "createdAt">>) => {
    dispatch({ type: "updated", id, patch, at: new Date().toISOString() });
  }, []);

  const value = useMemo(
    () => ({ status: state.status, items: state.items, reload, createProject, updateProject }),
    [state, reload, createProject, updateProject],
  );

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

/** Projects as the UI should render them, with the demo-state override applied. */
export function useProjects() {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used inside <ProjectsProvider>");
  const { demoView, setDemoView } = useAccount();
  const view = applyDemoView(demoView, ctx.status, ctx.items);

  const retry = useCallback(() => {
    if (demoView !== "live") setDemoView("live");
    else void ctx.reload();
  }, [demoView, setDemoView, ctx]);

  const byId = useMemo(() => new Map(view.items.map((p) => [p.id, p])), [view.items]);

  return {
    status: view.status,
    projects: view.items,
    byId,
    retry,
    reload: ctx.reload,
    createProject: ctx.createProject,
    updateProject: ctx.updateProject,
  };
}
