import type { Metadata } from "next";
import { Suspense } from "react";
import { DocumentsView } from "@/features/documents/DocumentsView";

export const metadata: Metadata = { title: "Документы" };

export default function DocumentsPage() {
  return (
    <Suspense>
      <DocumentsView />
    </Suspense>
  );
}
