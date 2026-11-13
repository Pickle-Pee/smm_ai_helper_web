"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { DemoView } from "@/lib/resource";

export interface AccountProfile {
  name: string;
  role: "owner" | "marketer" | "agency";
}

export interface WorkspaceSettings {
  name: string;
  timezone: string;
}

interface AccountContextValue {
  profile: AccountProfile;
  workspace: WorkspaceSettings;
  demoView: DemoView;
  updateProfile: (patch: Partial<AccountProfile>) => void;
  updateWorkspace: (patch: Partial<WorkspaceSettings>) => void;
  setDemoView: (view: DemoView) => void;
}

export const defaultProfile: AccountProfile = { name: "Мария", role: "marketer" };
export const defaultWorkspace: WorkspaceSettings = { name: "Демо-агентство «Сигнал»", timezone: "Europe/Moscow" };

export const roleLabel: Record<AccountProfile["role"], string> = {
  owner: "Владелец бизнеса",
  marketer: "Маркетолог",
  agency: "Агентство",
};

const AccountContext = createContext<AccountContextValue | null>(null);

/** Account state is local-only: there is no authentication in this prototype. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState(defaultProfile);
  const [workspace, setWorkspace] = useState(defaultWorkspace);
  const [demoView, setDemoView] = useState<DemoView>("live");

  const value = useMemo<AccountContextValue>(
    () => ({
      profile,
      workspace,
      demoView,
      updateProfile: (patch) => setProfile((p) => ({ ...p, ...patch })),
      updateWorkspace: (patch) => setWorkspace((w) => ({ ...w, ...patch })),
      setDemoView,
    }),
    [profile, workspace, demoView],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used inside <AccountProvider>");
  return ctx;
}
