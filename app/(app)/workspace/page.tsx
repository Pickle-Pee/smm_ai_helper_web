import type { Metadata } from "next";
import { Suspense } from "react";
import { WorkspaceView } from "@/features/workspace/WorkspaceView";

export const metadata: Metadata = { title: "AI Workspace" };

export default function WorkspacePage() {
  return (
    <Suspense>
      <WorkspaceView />
    </Suspense>
  );
}
