import type { Metadata } from "next";
import { DashboardView } from "@/features/dashboard/DashboardView";
import { CABINET_ENABLED } from "@/lib/cabinet-mode";

export const metadata: Metadata = { title: "Рабочий стол" };

export default function DashboardPage() {
  return <DashboardView cabinet={CABINET_ENABLED} />;
}
