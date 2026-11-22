import type { ReactNode } from "react";
import { AppProviders } from "@/components/AppProviders";
import { AppShell } from "@/components/shell/AppShell";
import { CabinetShell } from "@/components/shell/CabinetShell";
import { CABINET_ENABLED } from "@/lib/cabinet-mode";

export default function AppLayout({ children }: { children: ReactNode }) {
  if (CABINET_ENABLED) return <CabinetShell>{children}</CabinetShell>;
  return (
    <AppProviders>
      <AppShell>{children}</AppShell>
    </AppProviders>
  );
}
