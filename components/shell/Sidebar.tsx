"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical, Plus } from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { BrandDot } from "@/components/ui/Monogram";
import { useProjects } from "@/features/projects/store";
import { useAccount } from "@/features/account/store";
import { initials } from "@/lib/format";
import { cx } from "@/lib/cx";
import { isActive, primaryNav, settingsNav, type NavItem } from "./nav";
import styles from "./Shell.module.css";

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link href={item.href} className={cx(styles.navLink, active && styles.navLinkActive)} aria-current={active ? "page" : undefined}>
      <Icon size={19} strokeWidth={1.85} aria-hidden />
      <span className={styles.navLabel}>{item.label}</span>
      <span className={styles.navTooltip} aria-hidden>
        {item.label}
      </span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { projects, status } = useProjects();
  const { workspace } = useAccount();
  const pinned = projects.filter((p) => p.status !== "archived").slice(0, 5);

  return (
    <aside className={styles.sidebar} aria-label="Основная навигация">
      <div className={styles.sidebarTop}>
        <Link href="/" className={styles.logoLink} aria-label="SMM AI Helper — на рабочий стол">
          <Logo onDark className={styles.logoFull} />
          <LogoMark onDark className={styles.logoCompact} />
        </Link>
      </div>

      <Link href="/workspace?new=1" className={styles.newRequest}>
        <Plus size={18} strokeWidth={2.2} aria-hidden />
        <span className={styles.navLabel}>Новый запрос</span>
        <span className={styles.navTooltip} aria-hidden>
          Новый запрос
        </span>
      </Link>

      <nav className={styles.nav} aria-label="Разделы">
        <ul className={styles.navList}>
          {primaryNav.map((item) => (
            <li key={item.href}>
              <NavLink item={item} pathname={pathname} />
            </li>
          ))}
        </ul>

        <div className={styles.navGroup}>
          <div className={styles.navGroupTitle} id="sidebar-projects">
            Проекты
          </div>
          {status === "ready" && pinned.length > 0 && (
            <ul className={styles.projectList} aria-labelledby="sidebar-projects">
              {pinned.map((p) => {
                const href = `/projects/${p.id}`;
                const active = pathname === href;
                return (
                  <li key={p.id}>
                    <Link
                      href={href}
                      className={cx(styles.projectLink, active && styles.navLinkActive)}
                      aria-current={active ? "page" : undefined}
                      title={p.name}
                    >
                      <BrandDot color={p.color} />
                      <span className={styles.projectName}>{p.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {status === "ready" && pinned.length === 0 && <p className={styles.navEmpty}>Активных проектов нет</p>}
          {status === "loading" && <p className={styles.navEmpty}>Загрузка…</p>}
          {status === "error" && <p className={styles.navEmpty}>Список недоступен</p>}
        </div>
      </nav>

      <div className={styles.sidebarBottom}>
        <NavLink item={settingsNav} pathname={pathname} />
        <div className={styles.demoCard}>
          <FlaskConical size={16} aria-hidden />
          <p>
            <strong>Демо-версия.</strong> Данные вымышленные, AI и сохранение на сервере не подключены.
          </p>
        </div>
        <Link href="/settings#workspace" className={styles.workspaceChip} title={workspace.name}>
          <span className={styles.workspaceAvatar} aria-hidden>
            {initials(workspace.name)}
          </span>
          <span className={styles.workspaceText}>
            <span className={styles.workspaceName}>{workspace.name}</span>
            <span className={styles.workspaceMeta}>Рабочее пространство</span>
          </span>
        </Link>
      </div>
    </aside>
  );
}
