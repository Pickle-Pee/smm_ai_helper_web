"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import { useApi } from "@/lib/api/provider";
import { applyDemoView, type ResourceStatus } from "@/lib/resource";
import type { Project } from "@/lib/types";
import { useAccount } from "@/features/account/store";
import { initialProjectsState, projectsReducer } from "./model";

/**
 * LEGACY demo brands (F0 mock dataset, ids `p-…`).
 *
 * Since F3 no project screen reads this store: Dashboard, Projects, project pages, the sidebar, search and the AI
 * Workspace use the unified Web API v2 project context (`./context.tsx`). What is left:
 * - the Documents demo, whose files are tagged with these legacy brands (labelled as a separate demo dataset);
 * - recognising stale `p-…` links and drafts, so they are explained instead of silently mapped to another project.
 *
 * It is read-only: creating or editing projects locally was removed in F3, because a local project would look like a
 * real one while the AI Workspace could never find it. Remove this store once Documents move to a real API.
 */
interface LegacyProjectsContextValue {
  status: ResourceStatus;
  items: Project[];
  reload: () => Promise<void>;
}

const LegacyProjectsContext = createContext<LegacyProjectsContextValue | null>(null);

export function LegacyDemoProjectsProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [state, dispatch] = useReducer(projectsReducer, initialProjectsState);

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

  const value = useMemo(() => ({ status: state.status, items: state.items, reload }), [state, reload]);

  return <LegacyProjectsContext.Provider value={value}>{children}</LegacyProjectsContext.Provider>;
}

/** Legacy demo brands of the Documents demo, with the demo-state override applied. Not a project source. */
export function useLegacyDemoProjects() {
  const ctx = useContext(LegacyProjectsContext);
  if (!ctx) throw new Error("useLegacyDemoProjects must be used inside <LegacyDemoProjectsProvider>");
  const { demoView, setDemoView } = useAccount();
  const view = applyDemoView(demoView, ctx.status, ctx.items);

  const retry = useCallback(() => {
    if (demoView !== "live") setDemoView("live");
    else void ctx.reload();
  }, [demoView, setDemoView, ctx]);

  const byId = useMemo(() => new Map(view.items.map((p) => [p.id, p])), [view.items]);

  return { status: view.status, projects: view.items, byId, retry, reload: ctx.reload };
}
