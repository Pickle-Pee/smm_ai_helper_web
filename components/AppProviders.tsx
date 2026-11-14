"use client";

import type { ReactNode } from "react";
import { ApiProvider } from "@/lib/api/provider";
import { AccountProvider } from "@/features/account/store";
import { ProjectsProvider } from "@/features/projects/store";
import { WorkspaceProvider } from "@/features/workspace/store";
import { WorkspaceV2Provider } from "@/features/workspace/v2/provider";
import { DocumentsProvider } from "@/features/documents/store";
import { ToastProvider } from "@/components/ui/Toast";

/**
 * Feature state is kept in separate providers (account, projects, AI workspace, documents).
 * `WorkspaceProvider` is the legacy local demo store still read by Dashboard, Projects, Documents and search;
 * `WorkspaceV2Provider` backs the AI Workspace screen through Web API v2 (fixture transport only).
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ApiProvider>
      <AccountProvider>
        <ProjectsProvider>
          <WorkspaceProvider>
            <WorkspaceV2Provider>
              <DocumentsProvider>
                <ToastProvider>{children}</ToastProvider>
              </DocumentsProvider>
            </WorkspaceV2Provider>
          </WorkspaceProvider>
        </ProjectsProvider>
      </AccountProvider>
    </ApiProvider>
  );
}
