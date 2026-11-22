import type { Metadata } from "next";
import { SettingsView } from "@/features/account/SettingsView";
import { CabinetSettings } from "@/features/account/CabinetSettings";
import { CABINET_ENABLED } from "@/lib/cabinet-mode";

export const metadata: Metadata = { title: "Настройки" };

export default function SettingsPage() {
  return CABINET_ENABLED ? <CabinetSettings /> : <SettingsView />;
}
