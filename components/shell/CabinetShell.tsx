"use client";

import type { ReactNode } from "react";
import { CabinetSession, useCabinetSession } from "@/features/account/CabinetSession";
import { CabinetProjectsProvider, useCabinetProjects } from "@/features/projects/cabinet";
import { toUiProject } from "@/lib/api/v2/presenters";
import { AppShell } from "./AppShell";

export function CabinetShell({ children }: { children: ReactNode }) {
  return (
    <CabinetSession>
      <CabinetProjectsProvider>
        <CabinetChrome>{children}</CabinetChrome>
      </CabinetProjectsProvider>
    </CabinetSession>
  );
}

function CabinetChrome({ children }: { children: ReactNode }) {
  const { me } = useCabinetSession();
  const { memberships, organization, projects } = useCabinetProjects();
  return (
    <AppShell cabinet={{
      name: me.user.display_name ?? "Пользователь Brenvio",
      workspaceName: organization?.organization.name,
      status: memberships.status === "ready" ? projects.status : memberships.status,
      projects: projects.status === "ready" ? projects.data.map(toUiProject) : [],
    }}>
      {children}
    </AppShell>
  );
}
