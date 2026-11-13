import type { Metadata } from "next";
import { ProjectDetailView } from "@/features/projects/ProjectDetailView";

export const metadata: Metadata = { title: "Проект" };

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectDetailView projectId={projectId} />;
}
