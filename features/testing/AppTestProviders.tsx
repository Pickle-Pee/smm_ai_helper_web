import type { ReactNode } from "react";
import { ApiProvider } from "@/lib/api/provider";
import type { WebApiV2 } from "@/lib/api/v2/contract";
import { AccountProvider } from "@/features/account/store";
import { LegacyDemoProjectsProvider } from "@/features/projects/store";
import { ProjectContextProvider } from "@/features/projects/context";
import { WorkspaceProvider } from "@/features/workspace/store";
import { WorkspaceV2Provider } from "@/features/workspace/v2/provider";
import type { WorkspaceV2Controller } from "@/features/workspace/v2/controller";
import { DocumentsProvider } from "@/features/documents/store";
import { ToastProvider } from "@/components/ui/Toast";

/**
 * Test-only copy of the app's provider tree (`components/AppProviders.tsx`), with an injected fixture transport and
 * controller. Keep the order identical to AppProviders.
 */
export function AppTestProviders({ api, controller, children }: { api: WebApiV2; controller?: WorkspaceV2Controller; children: ReactNode }) {
  return (
    <ApiProvider webApiV2={api}>
      <AccountProvider>
        <LegacyDemoProjectsProvider>
          <WorkspaceProvider>
            <WorkspaceV2Provider controller={controller}>
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
