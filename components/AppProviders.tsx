"use client";

import type { ReactNode } from "react";
import { ApiProvider } from "@/lib/api/provider";
import { AccountProvider } from "@/features/account/store";
import { LegacyDemoProjectsProvider } from "@/features/projects/store";
import { ProjectContextProvider } from "@/features/projects/context";
import { WorkspaceProvider } from "@/features/workspace/store";
import { WorkspaceV2Provider } from "@/features/workspace/v2/provider";
import { DocumentsProvider } from "@/features/documents/store";
import { ToastProvider } from "@/components/ui/Toast";

/**
 * Feature state is kept in separate providers (account, projects, AI workspace, documents).
 *
 * - `WorkspaceV2Provider` holds the session's Web API v2 controller (ONE fixture transport from `ApiProvider`). It is
 *   the single source of project and Copilot-thread identity for every screen; `ProjectContextProvider` adds only
 *   the session's selected brand on top of it (F3).
 * - `LegacyDemoProjectsProvider` / `WorkspaceProvider` / `DocumentsProvider` are the legacy demo dataset: Documents
 *   and its demo brands, draft handoff to the Workspace, and recognising stale legacy links.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ApiProvider>
      <AccountProvider>
        <LegacyDemoProjectsProvider>
          <WorkspaceProvider>
            <WorkspaceV2Provider>
              <ProjectContextProvider>
                <DocumentsProvider>
                  <ToastProvider>{children}</ToastProvider>
                </DocumentsProvider>
              </ProjectContextProvider>
            </WorkspaceV2Provider>
          </WorkspaceProvider>
        </LegacyDemoProjectsProvider>
      </AccountProvider>
    </ApiProvider>
  );
}
