import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectsView } from "@/features/projects/ProjectsView";
import { CabinetProjectsView } from "@/features/projects/CabinetProjectsView";
import { CABINET_ENABLED } from "@/lib/cabinet-mode";

export const metadata: Metadata = { title: "Проекты" };

export default function ProjectsPage() {
  if (CABINET_ENABLED) return <CabinetProjectsView />;
  return (
    <Suspense>
      <ProjectsView />
    </Suspense>
  );
}
