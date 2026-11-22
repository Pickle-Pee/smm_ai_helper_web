"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { OrganizationSelector } from "@/features/projects/CabinetProjectsView";
import { useCabinetSession } from "./CabinetSession";

export function CabinetSettings() {
  const { me, logout } = useCabinetSession();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await logout();
    } catch {
      setFailed(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Page>
      <PageHeader title="Настройки" />
      <Card padded>
        <CardHeader plain title="Аккаунт" description={me.user.display_name ?? "Пользователь Brenvio"} />
        <Button disabled={busy} onClick={() => void signOut()}>Выйти из аккаунта</Button>
        {failed && <p role="alert">Не удалось завершить сессию. Проверьте подключение и повторите.</p>}
      </Card>
      <section id="workspace" aria-label="Организация"><OrganizationSelector /></section>
    </Page>
  );
}
