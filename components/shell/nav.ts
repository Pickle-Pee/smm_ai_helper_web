import { FolderKanban, Files, LayoutDashboard, MessagesSquare, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the mobile tab bar. */
  short: string;
  icon: LucideIcon;
}

export const primaryNav: NavItem[] = [
  { href: "/", label: "Обзор", short: "Обзор", icon: LayoutDashboard },
  { href: "/workspace", label: "AI Workspace", short: "AI", icon: MessagesSquare },
  { href: "/projects", label: "Проекты", short: "Проекты", icon: FolderKanban },
  { href: "/documents", label: "Документы", short: "Файлы", icon: Files },
];

export const settingsNav: NavItem = { href: "/settings", label: "Настройки", short: "Настройки", icon: Settings };

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
