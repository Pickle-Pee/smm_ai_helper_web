import type { Metadata } from "next";
import { Suspense } from "react";
import { WorkspaceView } from "@/features/workspace/WorkspaceView";
import { ComingSoon } from "@/components/ui/ComingSoon";
import { CABINET_ENABLED } from "@/lib/cabinet-mode";

export const metadata: Metadata = { title: "AI Workspace" };

export default function WorkspacePage() {
  if (CABINET_ENABLED) return <ComingSoon title="AI Workspace" description="Запросы и история AI Workspace появятся в кабинете позже." />;
  return (
    <Suspense>
      <WorkspaceView />
    </Suspense>
  );
}
