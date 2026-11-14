"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import { useApi } from "@/lib/api/provider";
import { applyDemoView, type ResourceStatus } from "@/lib/resource";
import type { ID, ResultStatus, Thread } from "@/lib/types";
import { useAccount } from "@/features/account/store";
import { initialWorkspaceState, workspaceReducer, type DraftIntent } from "./model";

interface WorkspaceContextValue {
  status: ResourceStatus;
  threads: Thread[];
  pendingDraft: DraftIntent | null;
  reload: () => Promise<void>;
  setThreadProject: (threadId: ID, projectId: ID | null) => void;
  deleteThread: (threadId: ID) => void;
  setResultStatus: (threadId: ID, messageId: ID, status: ResultStatus) => void;
  toggleChecklistItem: (threadId: ID, messageId: ID, itemId: ID) => void;
  prepareDraft: (draft: DraftIntent) => void;
  consumeDraft: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/**
 * LEGACY local demo store (F0 mock dataset). Since F2 the AI Workspace screen no longer uses it for threads or
 * requests (see `./v2/controller.ts`); Dashboard, Projects, Documents and global search still read its demo
 * threads/results, and other screens hand drafts to the Workspace through `prepareDraft`. It cannot create
 * threads or messages any more, so there is no second, local imitation of AI requests.
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);

  const reload = useCallback(async () => {
    dispatch({ type: "loading" });
    try {
      dispatch({ type: "loaded", threads: await api.threads.list() });
    } catch {
      dispatch({ type: "failed" });
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      status: state.status,
      threads: state.threads,
      pendingDraft: state.pendingDraft,
      reload,
      setThreadProject: (threadId, projectId) => dispatch({ type: "threadProjectChanged", threadId, projectId }),
      deleteThread: (threadId) => dispatch({ type: "threadDeleted", threadId }),
      setResultStatus: (threadId, messageId, status) => dispatch({ type: "resultStatusChanged", threadId, messageId, status }),
      toggleChecklistItem: (threadId, messageId, itemId) => dispatch({ type: "checklistToggled", threadId, messageId, itemId }),
      prepareDraft: (draft) => dispatch({ type: "draftPrepared", draft }),
      consumeDraft: () => dispatch({ type: "draftConsumed" }),
    }),
    [state, reload],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  const { demoView, setDemoView } = useAccount();
  const view = applyDemoView(demoView, ctx.status, ctx.threads);

  const retry = useCallback(() => {
    if (demoView !== "live") setDemoView("live");
    else void ctx.reload();
  }, [demoView, setDemoView, ctx]);

  return { ...ctx, status: view.status, threads: view.items, retry };
}
