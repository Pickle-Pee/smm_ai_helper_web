"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { createCabinetApi } from "@/lib/api/v2/cabinet";
import { isWebApiError } from "@/lib/api/v2/errors";
import styles from "./TelegramLogin.module.css";

type Step = "loading" | "waiting" | "link" | "challenge" | "verify" | "checkAgain";

const linkHelp = "В личном чате с ботом нажмите «Открыть Brenvio» и перейдите по новой ссылке.";
const retryHelp = "Не удалось связаться с Brenvio. Проверьте подключение и повторите проверку.";

export function takeTelegramFragment(location: Location, history: History): string | null {
  const fragment = location.hash;
  if (!fragment) return null;
  history.replaceState(history.state, "", location.pathname + location.search);
  const token = /^#t=([A-Za-z0-9_-]{32,256})$/.exec(fragment)?.[1];
  return token ?? "";
}

export function TelegramLogin() {
  const router = useRouter();
  const [api] = useState(() => createCabinetApi());
  const token = useRef<string | null>(null);
  const readFragment = useRef(false);
  const pending = useRef(false);
  const expectedUser = useRef<number | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [attempt, setAttempt] = useState<{ command: string; expiresAt: number }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const requestNewLink = useCallback((message: string) => {
    token.current = null;
    expectedUser.current = null;
    setAttempt(undefined);
    setStep("waiting");
    setError(message);
  }, []);

  const checkSession = useCallback(async (signal?: AbortSignal) => {
    try {
      const me = await api.getMe({ signal });
      if (signal?.aborted) return;
      if (expectedUser.current !== null && me.user.id !== expectedUser.current) {
        requestNewLink("Аккаунт в браузере сменился. Запросите новую ссылку в Telegram.");
        return;
      }
      router.replace("/");
    } catch (err) {
      if (signal?.aborted) return;
      if (isWebApiError(err) && err.status === 401) {
        requestNewLink(expectedUser.current === null ? "" : "Сессия входа недоступна. Запросите новую ссылку.");
      } else {
        setStep("checkAgain");
        setError(retryHelp);
      }
    }
  }, [api, requestNewLink, router]);

  useEffect(() => {
    if (!readFragment.current) {
      token.current = takeTelegramFragment(window.location, window.history);
      readFragment.current = true;
    }
    if (token.current !== null) {
      if (token.current) setStep("link");
      else requestNewLink("Ссылка входа повреждена.");
      return;
    }
    const controller = new AbortController();
    void checkSession(controller.signal);
    return () => controller.abort();
  }, [checkSession, requestNewLink]);

  useEffect(() => {
    function onNewLink() {
      const next = takeTelegramFragment(window.location, window.history);
      if (next === null) return;
      // An in-flight exchange can still replace the browser cookie. Finish that
      // attempt before accepting another link in the same tab.
      if (pending.current) {
        setError("Дождитесь завершения запроса, затем снова откройте ссылку.");
        return;
      }
      requestNewLink(next ? "" : "Ссылка входа повреждена.");
      if (next) {
        token.current = next;
        setCopied(false);
        setStep("link");
      }
    }
    window.addEventListener("hashchange", onNewLink);
    return () => window.removeEventListener("hashchange", onNewLink);
  }, [requestNewLink]);

  useEffect(() => {
    if (!attempt) return;
    const timer = window.setTimeout(() => requestNewLink("Срок действия ссылки истёк."), Math.max(0, attempt.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [attempt]);

  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function authError(err: unknown) {
    if (isWebApiError(err) && err.code === "feature_disabled") return "Вход через Telegram сейчас выключен.";
    if (isWebApiError(err) && err.code === "csrf_failed") return "Откройте ссылку напрямую в браузере Brenvio.";
    return "Не удалось завершить запрос. Запросите новую ссылку в Telegram.";
  }

  async function challenge() {
    if (!token.current) return;
    try {
      const result = await api.startTelegramLoginChallenge({ token: token.current });
      const expiresAt = Date.parse(result.expires_at);
      if (!Number.isFinite(expiresAt) || !/^[A-Za-z0-9_-]{22}$/.test(result.confirmation_code)) {
        requestNewLink("Не удалось получить код подтверждения.");
        return;
      }
      setAttempt({ command: `/confirm ${result.confirmation_code}`, expiresAt });
      setStep("challenge");
    } catch (err) {
      if (isWebApiError(err) && err.status === 401) requestNewLink("Срок действия ссылки истёк или ссылка уже использована.");
      else if (isWebApiError(err) && err.status === 429) setError("Слишком много попыток. Подождите перед повтором.");
      else requestNewLink(authError(err));
    }
  }

  async function exchange() {
    if (!token.current || !attempt || Date.now() >= attempt.expiresAt) {
      requestNewLink("Срок действия ссылки истёк.");
      return;
    }
    try {
      const session = await api.exchangeTelegramLoginToken({ token: token.current });
      token.current = null;
      setAttempt(undefined);
      expectedUser.current = session.me.user.id;
      setStep("verify");
      await checkSession();
    } catch (err) {
      if (isWebApiError(err) && err.code === "login_token_invalid" && Date.now() < attempt.expiresAt) {
        setError("Бот ещё не подтвердил вход или попытка уже недействительна. Проверьте команду и ответ бота. Если ошибка повторится, откройте новую ссылку.");
      } else if (isWebApiError(err) && err.status === 429) {
        setError("Слишком много попыток. Подождите перед повтором.");
      } else {
        requestNewLink(authError(err));
      }
    }
  }

  return (
    <main className={styles.page}>
      <Card padded className={styles.card} aria-labelledby="login-title">
        <Logo />
        <h1 id="login-title">Вход через Telegram</h1>
        {step === "loading" || step === "verify" ? <p role="status">Проверяем сессию…</p> : null}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {step === "waiting" && <p>{linkHelp}</p>}
        {step === "link" && (
          <>
            <p>Начните вход, чтобы получить команду подтверждения для личного чата с ботом.</p>
            <Button variant="primary" disabled={busy} onClick={() => void run(challenge)}>Получить код</Button>
          </>
        )}
        {step === "challenge" && attempt && (
          <>
            <p>Отправьте эту команду в личном чате с ботом. После ответа бота вернитесь в эту вкладку и нажмите «Войти».</p>
            <code className={styles.command}>{attempt.command}</code>
            <Button onClick={async () => {
              try {
                await navigator.clipboard.writeText(attempt.command);
                setCopied(true);
              } catch {
                setError("Выделите команду и скопируйте её вручную.");
              }
            }}>Скопировать команду</Button>
            {copied && <p role="status">Команда скопирована</p>}
            <Button variant="primary" disabled={busy} onClick={() => void run(exchange)}>Войти</Button>
            <p>{linkHelp}</p>
          </>
        )}
        {step === "checkAgain" && <Button disabled={busy} onClick={() => void run(() => checkSession())}>Проверить сессию</Button>}
      </Card>
    </main>
  );
}
