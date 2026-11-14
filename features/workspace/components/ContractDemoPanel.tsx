"use client";

import { useEffect, useRef, useState } from "react";
import { CircleStop, Play } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Form";
import { useWebApiV2 } from "@/lib/api/provider";
import { WEB_API_V2_CONTRACT } from "@/lib/api/generated/web-api-v2.meta";
import type { ExecutionView } from "@/lib/api/v2/presenters";
import { demoCases, type DemoCaseId } from "../contract-demo/cases";
import type { DemoRun, DemoStep } from "../contract-demo/run";
import { ContractResultCard } from "./ContractResultCard";
import styles from "./ContractDemo.module.css";

const toneMap: Record<ExecutionView["tone"], BadgeTone> = {
  neutral: "neutral",
  info: "info",
  success: "success",
  warning: "warning",
  danger: "danger",
};

/** Demo polling delay: the real client honours `poll_after_ms`; the demo shortens waits to keep it watchable. */
const DEMO_POLL_MS = 700;

/**
 * Interactive, read-only walkthrough of the Web API v2 client against contract fixtures.
 * Runs entirely in the browser memory: no `/api/v2` request, no AI call, no persistence.
 */
export function ContractDemoPanel() {
  const { mode } = useWebApiV2();
  const [caseId, setCaseId] = useState<DemoCaseId>("direct");
  const [steps, setSteps] = useState<DemoStep[]>([]);
  const [summary, setSummary] = useState<Pick<DemoRun, "simulatedCoreAdmissions" | "submitCalls"> | null>(null);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const meta = demoCases.find((c) => c.id === caseId)!;

  useEffect(() => () => abortRef.current?.abort(), []);

  async function run() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSteps([]);
    setSummary(null);
    setFailed(false);
    setRunning(true);
    try {
      const { runDemoCase } = await import("../contract-demo/run");
      const { defaultSleep } = await import("@/lib/api/v2/requests");
      const result = await runDemoCase(caseId, {
        signal: controller.signal,
        sleep: (_ms, signal) => defaultSleep(DEMO_POLL_MS, signal),
        onStep: (step) => {
          if (!controller.signal.aborted) setSteps((prev) => [...prev, step]);
        },
      });
      if (!controller.signal.aborted) setSummary({ simulatedCoreAdmissions: result.simulatedCoreAdmissions, submitCalls: result.submitCalls });
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (abortRef.current === controller) setRunning(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
    setRunning(false);
    setSteps((prev) => [...prev, { title: "Ожидание остановлено", note: "Остановлено только ожидание в браузере. Запрос не отменён и не отправлен повторно." }]);
  }

  return (
    <div className={styles.panel}>
      <div className={styles.badges}>
        <Badge tone="warning" dot>
          Режим: тестовые данные ({mode})
        </Badge>
        <Badge tone="outline">HTTP-режим не подключён</Badge>
        <Badge tone="outline">Контракт {WEB_API_V2_CONTRACT.version}</Badge>
      </div>
      <p className={styles.note}>
        Примеры показывают, как клиент Web API v2 обрабатывает ответы сервера. Всё выполняется в памяти браузера: запросы к{" "}
        <code>/api/v2</code> не отправляются, AI не вызывается, ничего не сохраняется. Содержимое — тестовые данные контракта, а не
        ответы AI.
      </p>

      <div className={styles.controls}>
        <Field label="Пример" hint={meta.description} className={styles.caseField}>
          {(p) => (
            <Select {...p} value={caseId} onChange={(e) => setCaseId(e.target.value as DemoCaseId)} disabled={running}>
              {demoCases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className={styles.actions}>
          <Button variant="primary" icon={Play} onClick={run} disabled={running}>
            Показать пример
          </Button>
          {running && meta.polls && (
            <Button icon={CircleStop} onClick={stop}>
              Остановить ожидание
            </Button>
          )}
        </div>
      </div>

      <ol className={styles.steps} aria-live="polite" aria-label="Шаги примера">
        {steps.map((step, i) => (
          <li key={i} className={styles.step}>
            <p className={styles.stepTitle}>
              <span className={styles.stepIndex}>{i + 1}</span>
              {step.title}
            </p>
            {step.execution && (
              <div className={styles.execution}>
                <Badge tone={toneMap[step.execution.tone]} dot>
                  {step.execution.label}
                </Badge>
                <span className={styles.mono}>
                  {step.execution.requestKey} · ревизия {step.execution.revision} · next_action: {step.execution.nextAction}
                </span>
                <p className={styles.stepText}>{step.execution.description}</p>
                {step.execution.newRequestWarning && <p className={styles.warning}>{step.execution.newRequestWarning}</p>}
              </div>
            )}
            {step.error && (
              <div className={styles.execution}>
                <Badge tone="danger">
                  {step.error.status ? `HTTP ${step.error.status}` : "Нет ответа"}
                  {step.error.code ? ` · ${step.error.code}` : ""}
                </Badge>
                <p className={styles.stepText}>
                  {step.error.text}
                  {step.error.resetsAt ? ` Сброс лимита: ${new Date(step.error.resetsAt).toLocaleString("ru-RU", { timeZone: "UTC" })} UTC.` : ""}
                </p>
                {step.error.requestId && <span className={styles.mono}>request_id: {step.error.requestId}</span>}
              </div>
            )}
            {step.note && <p className={styles.stepNote}>{step.note}</p>}
            {(step.result ?? step.execution?.result) && <ContractResultCard view={(step.result ?? step.execution?.result)!} />}
          </li>
        ))}
      </ol>

      {failed && <p className={styles.warning}>Пример не удалось показать.</p>}
      {summary && (
        <p className={styles.summary}>
          Итог: POST-запросов в тестовый сервер — {summary.submitCalls}, принято бы ядром — {summary.simulatedCoreAdmissions}, сетевых
          запросов — 0.
        </p>
      )}
    </div>
  );
}
