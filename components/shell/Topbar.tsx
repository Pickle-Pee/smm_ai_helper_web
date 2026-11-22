"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { Badge } from "@/components/ui/Badge";
import { useAccount } from "@/features/account/store";
import { initials } from "@/lib/format";
import { GlobalSearch } from "./GlobalSearch";
import { PreviewBanner } from "./PreviewBanner";
import styles from "./Shell.module.css";

const demoViewLabel = {
  live: null,
  loading: "Демо: загрузка",
  empty: "Демо: пустые данные",
  error: "Демо: ошибка",
} as const;

export function Topbar() {
  const { profile, demoView } = useAccount();
  const override = demoViewLabel[demoView];

  return (
    <TopbarFrame name={profile.name} preview={<PreviewBanner />} search={<GlobalSearch />} override={override} />
  );
}

export function TopbarFrame({ name, preview, search, override }: { name: string; preview?: ReactNode; search?: ReactNode; override?: string | null }) {
  return (
    <div className={styles.chrome}>
      {preview}
      <header className={styles.topbar}>
      <Link href="/" className={styles.topbarLogo} aria-label="Brenvio — на рабочий стол">
        <Logo />
      </Link>
      {search}
      <div className={styles.topbarEnd}>
        {override && (
          <Link href="/settings#demo" className={styles.demoOverride}>
            <Badge tone="warning" dot>
              {override}
            </Badge>
          </Link>
        )}
        <Link href="/settings" className={styles.avatar} aria-label={`Профиль: ${name}. Открыть настройки`}>
          {initials(name)}
        </Link>
      </div>
      </header>
    </div>
  );
}
