"use client";

import type { ReactNode } from "react";
import { Sidebar, SidebarFrame, type SidebarFrameProps } from "./Sidebar";
import { Topbar, TopbarFrame } from "./Topbar";
import { MobileTabBar } from "./MobileTabBar";
import styles from "./Shell.module.css";

export function AppShell({ children, cabinet }: { children: ReactNode; cabinet?: SidebarFrameProps & { name: string } }) {
  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skipLink}>
        Перейти к содержимому
      </a>
      {cabinet ? <SidebarFrame {...cabinet} /> : <Sidebar />}
      <div className={styles.column}>
        {cabinet ? <TopbarFrame name={cabinet.name} /> : <Topbar />}
        <main id="main" className={styles.main} tabIndex={-1}>
          {children}
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}
