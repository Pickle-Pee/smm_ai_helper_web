"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import { useApi } from "@/lib/api/provider";
import { applyDemoView, type ResourceStatus } from "@/lib/resource";
import { createId } from "@/lib/format";
import type { ID, ResultStatus, ScenarioId, Thread } from "@/lib/types";
import { useAccount } from "@/features/account/store";
import { initialWorkspaceState, NEW_THREAD_TITLE, titleFromText, workspaceReducer, type DraftIntent } from "./model";

interface CreateThreadOptions {
  projectId: ID | null;
  scenarioId?: ScenarioId | null;
  /** Optional first message; stored locally and never sent to an AI provider. */
  text?: string;
}

interface WorkspaceContextValue {
  status: ResourceStatus;
  threads: Thread[];
  pendingDraft: DraftIntent | null;
  reload: () => Promise<void>;
  createThread: (options: CreateThreadOptions) => Thread;
  addLocalMessage: (threadId: ID, text: string) => void;
  setThreadProject: (threadId: ID, projectId: ID | null) => void;
  deleteThread: (threadId: ID) => void;
  setResultStatus: (threadId: ID, messageId: ID, status: ResultStatus) => void;
  toggleChecklistItem: (threadId: ID, messageId: ID, itemId: ID) => void;
  prepareDraft: (draft: DraftIntent) => void;
  consumeDraft: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

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

  const createThread = useCallback(({ projectId, scenarioId = null, text }: CreateThreadOptions) => {
    const now = new Date().toISOString();
    const clean = text?.trim();
    const thread: Thread = {
      id: createId("t"),
      title: clean ? titleFromText(clean) : NEW_THREAD_TITLE,
      projectId,
      scenarioId,
      createdAt: now,
      updatedAt: now,
      messages: clean ? [{ id: createId("m"), role: "user", text: clean, createdAt: now, delivery: "local" }] : [],
    };
    dispatch({ type: "threadCreated", thread });
    return thread;
  }, []);

  const addLocalMessage = useCallback((threadId: ID, text: string) => {
    dispatch({
      type: "messageAdded",
      threadId,
      message: { id: createId("m"), role: "user", text, createdAt: new Date().toISOString(), delivery: "local" },
    });
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      status: state.status,
      threads: state.threads,
      pendingDraft: state.pendingDraft,
      reload,
      createThread,
      addLocalMessage,
      setThreadProject: (threadId, projectId) => dispatch({ type: "threadProjectChanged", threadId, projectId }),
      deleteThread: (threadId) => dispatch({ type: "threadDeleted", threadId }),
      setResultStatus: (threadId, messageId, status) => dispatch({ type: "resultStatusChanged", threadId, messageId, status }),
      toggleChecklistItem: (threadId, messageId, itemId) => dispatch({ type: "checklistToggled", threadId, messageId, itemId }),
      prepareDraft: (draft) => dispatch({ type: "draftPrepared", draft }),
      consumeDraft: () => dispatch({ type: "draftConsumed" }),
    }),
    [state, reload, createThread, addLocalMessage],
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
