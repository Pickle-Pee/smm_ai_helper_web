import type { Metadata } from "next";
import { Suspense } from "react";
import { DocumentsView } from "@/features/documents/DocumentsView";
import { ComingSoon } from "@/components/ui/ComingSoon";
import { CABINET_ENABLED } from "@/lib/cabinet-mode";

export const metadata: Metadata = { title: "Документы" };

export default function DocumentsPage() {
  if (CABINET_ENABLED) return <ComingSoon title="Документы" description="Документы проектов появятся в кабинете позже." />;
  return (
    <Suspense>
      <DocumentsView />
    </Suspense>
  );
}
