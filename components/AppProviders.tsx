"use client";

import type { ReactNode } from "react";
import { ApiProvider } from "@/lib/api/provider";
import { AccountProvider } from "@/features/account/store";
import { ProjectsProvider } from "@/features/projects/store";
import { WorkspaceProvider } from "@/features/workspace/store";
import { DocumentsProvider } from "@/features/documents/store";
import { ToastProvider } from "@/components/ui/Toast";

/** Feature state is kept in separate providers (account, projects, AI workspace, documents). */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ApiProvider>
      <AccountProvider>
        <ProjectsProvider>
          <WorkspaceProvider>
            <DocumentsProvider>
              <ToastProvider>{children}</ToastProvider>
            </DocumentsProvider>
          </WorkspaceProvider>
        </ProjectsProvider>
      </AccountProvider>
    </ApiProvider>
  );
}
