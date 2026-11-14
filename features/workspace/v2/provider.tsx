"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useWebApiV2 } from "@/lib/api/provider";
import { createAppWorkspaceController, type WorkspaceV2Controller, type WorkspaceV2State } from "./controller";

/**
 * Holds the AI Workspace controller for the app session (it survives page navigation, not a reload — fixture data
 * and pending requests of the public preview are transient). The controller is created lazily, the first time a
 * screen asks for it, from the app's ONE Web API v2 transport (`useWebApiV2().load`, fixture-only,
 * `lib/api/v2/mode.ts`).
 *
 * Since F3 the same controller is also the single read source of project and Copilot-thread identity for Dashboard,
 * Projects, project pages, the sidebar and search (`useWorkspaceV2Data`, wrapped by `features/projects/context.tsx`).
 * There is no second copy of projects or threads anywhere in the app.
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
  projectDetails: {},
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

/**
 * Read-only subscription for screens other than the AI Workspace (Dashboard, Projects, project page, sidebar,
 * search). Starts the one-time project/thread load (reads only) but, unlike `useWorkspaceV2`, never stops polls
 * or loads when it unmounts: navigating between sections must not change the state of an active request.
 */
export function useWorkspaceV2Data(): { controller: WorkspaceV2Controller | null; state: WorkspaceV2State } {
  const ctx = useContext(WorkspaceV2Context);
  if (!ctx) throw new Error("useWorkspaceV2Data must be used inside <WorkspaceV2Provider>");
  const [controller, setController] = useState<WorkspaceV2Controller | null>(null);

  useEffect(() => {
    let alive = true;
    void ctx.get().then((c) => {
      if (!alive) return;
      setController(c);
      void c.start();
    });
    return () => {
      alive = false;
    };
  }, [ctx]);

  const state = useSyncExternalStore(controller?.subscribe ?? noopSubscribe, controller?.getSnapshot ?? (() => IDLE), () => IDLE);
  return { controller, state };
}
