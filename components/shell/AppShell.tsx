"use client";

import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MobileTabBar } from "./MobileTabBar";
import styles from "./Shell.module.css";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skipLink}>
        Перейти к содержимому
      </a>
      <Sidebar />
      <div className={styles.column}>
        <Topbar />
        <main id="main" className={styles.main} tabIndex={-1}>
          {children}
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}
