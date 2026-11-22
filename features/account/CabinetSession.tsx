"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { createCabinetApi, type CabinetApi } from "@/lib/api/v2/cabinet";
import type { Me } from "@/lib/api/v2/types";
import styles from "./TelegramLogin.module.css";

type Session = { api: CabinetApi; me: Me; logout: () => Promise<void> };
const SessionContext = createContext<Session | null>(null);

export function useCabinetSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("Cabinet session is unavailable");
  return session;
}

export function CabinetSession({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me>();
  const [failed, setFailed] = useState(false);
  const [check, setCheck] = useState(0);
  const [api] = useState(() => createCabinetApi(endSession));

  function endSession() {
    setMe(undefined);
    window.location.replace("/auth/telegram");
  }

  useEffect(() => {
    let controller: AbortController | undefined;
    const verify = () => {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      void api.getMe({ signal: current.signal }).then(
        (value) => {
          if (current.signal.aborted) return;
          setMe(value);
          setFailed(false);
        },
        () => {
          if (current.signal.aborted) return;
          setMe(undefined);
          setFailed(true);
        },
      );
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setMe(undefined);
        verify();
      }
    };
    verify();
    window.addEventListener("focus", verify);
    window.addEventListener("pageshow", restore);
    return () => {
      controller?.abort();
      window.removeEventListener("focus", verify);
      window.removeEventListener("pageshow", restore);
    };
  }, [api, check]);

  async function logout() {
    await api.getCsrfToken();
    await api.logout();
    endSession();
  }

  if (!me) {
    return (
      <main className={styles.page}>
        {failed ? (
          <div className={styles.card}>
            <p role="alert">Не удалось проверить сессию Brenvio.</p>
            <Button onClick={() => { setFailed(false); setCheck((value) => value + 1); }}>Повторить</Button>
          </div>
        ) : <p role="status">Проверяем сессию…</p>}
      </main>
    );
  }
  return <SessionContext.Provider value={{ api, me, logout }}>{children}</SessionContext.Provider>;
}
