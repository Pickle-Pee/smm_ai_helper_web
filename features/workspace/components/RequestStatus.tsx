"use client";

import { useState } from "react";
import { CirclePause, CirclePlay, LoaderCircle, RefreshCw, RotateCcw, SendHorizontal, TriangleAlert } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import type { ThreadRequestView } from "../v2/controller";
import { cx } from "@/lib/cx";
import styles from "./RequestState.module.css";

const TONE: Record<string, BadgeTone> = {
  neutral: "neutral",
  info: "info",
  success: "success",
  warning: "warning",
  danger: "danger",
};

const RECORD_STATUS: Record<ThreadRequestView["fencedKeys"][number]["status"], string> = {
  sending: "отправка не подтверждена",
  accepted: "принят сервером",
  unresolved: "исход не подтверждён",
  rejected: "отклонён",
  superseded: "заменён новым запросом",
};

export interface RequestStatusActions {
  onCheckStatus: () => void;
  onStopWaiting: () => void;
  onResumeWaiting: () => void;
  onResubmitSameKey: () => void;
  /** Opens the explicit "start a new request" confirmation. */
  onStartNew: () => void;
}

/**
 * Shows the server-reported state of the thread's latest request and ONLY the actions the server/state allows.
 * Announced politely to assistive tech. Never offers an automatic retry.
 */
export function RequestStatus({ request, canAct, actions }: { request: ThreadRequestView; canAct: boolean; actions: RequestStatusActions }) {
  const { phase, execution, unknown, error, refusal, polling, stoppedWaiting } = request;
  const show = phase !== "idle" || !!execution || !!refusal;
  if (!show) return null;
  if (phase === "settled" && execution && (execution.status === "completed" || execution.status === "completed_with_limitations") && !refusal) {
    return <div role="status" aria-live="polite" className="sr-only">{execution.label}</div>;
  }

  let label = execution?.label ?? "";
  let tone: BadgeTone = execution ? TONE[execution.tone] : "neutral";
  let text = execution?.description ?? "";
  if (phase === "submitting") {
    label = "Отправляем запрос";
    tone = "info";
    text = "Ожидаем ответ тестового сервера. Повторное нажатие ничего не отправит.";
  } else if (phase === "unknown" && unknown) {
    label = "Исход не подтверждён";
    tone = "warning";
    text = unknown.text;
  } else if (phase === "rejected" && error) {
    label = "Запрос не принят";
    tone = "danger";
    text = `${error.text} Ничего не было запущено.`;
  } else if (phase === "refused" && refusal && !execution) {
    label = "Не отправлено";
    tone = "warning";
    text = refusal.text;
  }

  const warning = tone === "warning" || tone === "danger";
  const waiting = phase === "waiting";
  const offersNew = canAct && (execution?.offersNewRequest || phase === "unknown");

  return (
    <section className={cx(styles.status, warning && styles.statusWarning)} aria-label="Состояние запроса" data-phase={phase} data-state={execution?.status ?? ""}>
      <div role="status" aria-live="polite" className={styles.statusHead}>
        {(phase === "submitting" || (waiting && polling)) && <LoaderCircle size={16} className={styles.spinner} aria-hidden />}
        {warning && <TriangleAlert size={16} aria-hidden />}
        <Badge tone={tone} size="sm">
          {label}
        </Badge>
        <span className={styles.statusText}>{text}</span>
      </div>
      {phase === "unknown" && request.pendingMessage && <p className={styles.statusError}>Запрос: «{request.pendingMessage}»</p>}
      {refusal && phase !== "refused" && <p className={styles.statusText}>{refusal.text}</p>}
      {error && phase !== "rejected" && phase !== "unknown" && (
        <p className={styles.statusError}>
          {error.text}
          {error.requestId ? ` · код обращения ${error.requestId}` : ""}
        </p>
      )}
      {error?.requestId && phase === "unknown" && <p className={styles.statusError}>Код обращения для поддержки: {error.requestId}</p>}
      {phase === "rejected" && error?.resetsAt && <p className={styles.statusError}>Лимит обновится {new Date(error.resetsAt).toLocaleString("ru-RU")}.</p>}
      {waiting && stoppedWaiting && <p className={styles.statusError}>Ожидание остановлено только в браузере: запрос не отменён и не повторён.</p>}
      <div className={styles.statusActions}>
        {(phase === "unknown" || refusal?.reason === "store_unavailable") && (
          <Button size="sm" icon={RefreshCw} onClick={actions.onCheckStatus}>
            Проверить статус
          </Button>
        )}
        {waiting && !stoppedWaiting && (
          <Button size="sm" variant="ghost" icon={CirclePause} onClick={actions.onStopWaiting}>
            Перестать ждать
          </Button>
        )}
        {waiting && stoppedWaiting && (
          <Button size="sm" icon={CirclePlay} onClick={actions.onResumeWaiting}>
            Проверить статус
          </Button>
        )}
        {canAct && execution?.canResubmitSameKey && phase !== "submitting" && (
          <Button size="sm" variant="primary" icon={SendHorizontal} onClick={actions.onResubmitSameKey}>
            Отправить тот же запрос
          </Button>
        )}
        {offersNew && phase !== "submitting" && (
          <Button size="sm" icon={RotateCcw} onClick={actions.onStartNew}>
            Начать новый запрос…
          </Button>
        )}
      </div>
      {/* Technical identifiers only where support may need them: an outcome that is not confirmed. */}
      {phase === "unknown" && request.fencedKeys.length > 0 && (
        <details className={styles.diagnostics}>
          <summary>Данные для поддержки</summary>
          <ul>
            {request.fencedKeys.map((k) => (
              <li key={k.requestKey}>
                <code>{k.requestKey}</code> · версия {k.revision} · {RECORD_STATUS[k.status]}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/**
 * The ONLY way to a new key after an unknown/ambiguous/expired/failed outcome: a warning plus an explicit
 * acknowledgement. Confirming calls `startNewRequest(..., { acknowledgeMayRegenerate: true })`.
 */
export function StartNewRequestDialog({
  open,
  text,
  warning,
  inNewThread,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  text: string;
  warning: string;
  inNewThread: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [ack, setAck] = useState(false);
  const close = () => {
    setAck(false);
    onCancel();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Начать новый запрос?"
      description={warning}
      size="sm"
      footer={
        <>
          <Button onClick={close}>Отмена</Button>
          <Button
            variant="primary"
            disabled={!ack}
            onClick={() => {
              setAck(false);
              onConfirm();
            }}
          >
            Начать новый запрос
          </Button>
        </>
      }
    >
      <p className={styles.statusText}>
        Прежний запрос сохранится для проверки статуса — он не удаляется и не отменяется.
        {inNewThread ? " Прежний запрос ещё выполняется, поэтому новый будет создан в отдельном диалоге." : ""}
      </p>
      {text && (
        <blockquote className={styles.statusText}>
          «{text}»
        </blockquote>
      )}
      <label className={styles.check}>
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        <span>Понимаю, что результат может быть сгенерирован повторно</span>
      </label>
    </Dialog>
  );
}
