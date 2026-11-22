import type { Metadata } from "next";
import { ProjectDetailView } from "@/features/projects/ProjectDetailView";
import { CabinetProjectDetail } from "@/features/projects/CabinetProjectDetail";
import { CABINET_ENABLED } from "@/lib/cabinet-mode";

export const metadata: Metadata = { title: "Проект" };

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return CABINET_ENABLED ? <CabinetProjectDetail projectId={projectId} /> : <ProjectDetailView projectId={projectId} />;
}
