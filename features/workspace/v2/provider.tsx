"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useWebApiV2 } from "@/lib/api/provider";
import { createAppWorkspaceController, type WorkspaceV2Controller, type WorkspaceV2State } from "./controller";

/**
 * Holds the AI Workspace controller for the app session (it survives page navigation, not a reload — fixture data
 * and pending requests of the public preview are transient). The controller is created lazily, the first time the
 * Workspace screen asks for it, from the app's Web API v2 transport (fixture-only, `lib/api/v2/mode.ts`).
 */
interface Ctx {
  get: () => Promise<WorkspaceV2Controller>;
}

const WorkspaceV2Context = createContext<Ctx | null>(null);

export function WorkspaceV2Provider({ controller, children }: { controller?: WorkspaceV2Controller; children: ReactNode }) {
  const { load } = useWebApiV2();
  const ref = useRef<Promise<WorkspaceV2Controller> | null>(null);
  const [ctx] = useState<Ctx>(() => ({
    get: () => (ref.current ??= controller ? Promise.resolve(controller) : load().then(createAppWorkspaceController)),
  }));
  return <WorkspaceV2Context.Provider value={ctx}>{children}</WorkspaceV2Context.Provider>;
}

const IDLE: WorkspaceV2State = {
  status: "idle",
  storeKind: "transient",
  orgId: null,
  projects: [],
  threads: [],
  details: {},
  creating: false,
  createError: null,
};
const noopSubscribe = () => () => {};

/**
 * Subscribes to the controller. Starts it (projects + thread summaries) on first use and stops every poll when the
 * component using it unmounts (navigation away): waiting stops, server requests are not cancelled.
 */
export function useWorkspaceV2(): { controller: WorkspaceV2Controller | null; state: WorkspaceV2State } {
  const ctx = useContext(WorkspaceV2Context);
  if (!ctx) throw new Error("useWorkspaceV2 must be used inside <WorkspaceV2Provider>");
  const [controller, setController] = useState<WorkspaceV2Controller | null>(null);

  useEffect(() => {
    let alive = true;
    let current: WorkspaceV2Controller | null = null;
    void ctx.get().then((c) => {
      if (!alive) return;
      current = c;
      setController(c);
      void c.start();
    });
    return () => {
      alive = false;
      current?.stopAll();
    };
  }, [ctx]);

  const state = useSyncExternalStore(controller?.subscribe ?? noopSubscribe, controller?.getSnapshot ?? (() => IDLE), () => IDLE);
  return { controller, state };
}
