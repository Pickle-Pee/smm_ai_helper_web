"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/cx";
import { isActive, primaryNav, settingsNav } from "./nav";
import styles from "./Shell.module.css";

export function MobileTabBar() {
  const pathname = usePathname();
  const items = [...primaryNav, settingsNav];
  return (
    <nav className={styles.tabbar} aria-label="Разделы">
      <ul>
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link href={item.href} className={cx(styles.tab, active && styles.tabActive)} aria-current={active ? "page" : undefined}>
                <Icon size={21} strokeWidth={active ? 2.1 : 1.8} aria-hidden />
                <span>{item.short}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
