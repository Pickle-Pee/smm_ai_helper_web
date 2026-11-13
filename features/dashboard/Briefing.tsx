"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, CornerDownLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAccount } from "@/features/account/store";
import { useProjects } from "@/features/projects/store";
import { useWorkspace } from "@/features/workspace/store";
import { scenarioPrompt, scenarios } from "@/features/workspace/scenarios";
import { selectResults } from "@/features/workspace/model";
import { countLabel, formatWeekday, greeting } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { ScenarioId } from "@/lib/types";
import styles from "./Dashboard.module.css";

export function Briefing() {
  const router = useRouter();
  const { notify } = useToast();
  const now = useNow();
  const { profile } = useAccount();
  const { projects, status: projectsStatus } = useProjects();
  const { threads, createThread } = useWorkspace();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const brandSelectId = useId();

  const selectable = projects.filter((p) => p.status !== "archived");
  const [projectId, setProjectId] = useState<string>("");
  const [scenarioId, setScenarioId] = useState<ScenarioId | null>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    if (!projectId && selectable[0]) setProjectId(selectable[0].id);
  }, [projectId, selectable]);

  const brand = projects.find((p) => p.id === projectId) ?? null;
  const reviewCount = selectResults(threads).filter((r) => r.result.status === "review").length;
  const activeCount = projects.filter((p) => p.status === "active").length;

  function applyScenario(id: ScenarioId) {
    const scenario = scenarios.find((s) => s.id === id);
    if (!scenario) return;
    setScenarioId(id);
    setText(scenarioPrompt(scenario, brand?.name));
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const clean = text.trim();
    if (!clean) {
      textareaRef.current?.focus();
      return;
    }
    const thread = createThread({ projectId: brand?.id ?? null, scenarioId, text: clean });
    notify({
      tone: "info",
      title: "Запрос сохранён в AI Workspace",
      description: "Демо-версия: AI не подключён, ответ не будет сгенерирован.",
    });
    setText("");
    setScenarioId(null);
    router.push(`/workspace?thread=${thread.id}`);
  }

  return (
    <section className={styles.briefing} aria-labelledby="briefing-title">
      <div className={styles.briefingHead}>
        <p className={styles.briefingDate}>{now ? formatWeekday(now) : " "}</p>
        <h1 id="briefing-title" className={styles.briefingTitle}>
          {now ? greeting(now) : "Здравствуйте"}, {profile.name}
        </h1>
        <p className={styles.briefingSummary}>
          {projectsStatus === "ready" ? (
            <>
              {countLabel(activeCount, ["активный бренд", "активных бренда", "активных брендов"])}
              {reviewCount > 0 && <> · {countLabel(reviewCount, ["результат ждёт", "результата ждут", "результатов ждут"])} проверки</>}
            </>
          ) : (
            " "
          )}
        </p>
      </div>

      <form className={styles.composer} onSubmit={submit}>
        <label htmlFor="briefing-input" className="sr-only">
          Задача для AI
        </label>
        <textarea
          id="briefing-input"
          ref={textareaRef}
          className={styles.composerInput}
          rows={2}
          placeholder="Опишите задачу: например, «подготовь контент-план на декабрь для VK»"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (!e.target.value) setScenarioId(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
          }}
        />
        <div className={styles.composerBar}>
          <div className={styles.brandSelect}>
            <label htmlFor={brandSelectId} className="sr-only">
              Бренд для контекста
            </label>
            <select
              id={brandSelectId}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={selectable.length === 0}
            >
              {selectable.length === 0 && <option value="">Без проекта</option>}
              {selectable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown size={15} aria-hidden />
          </div>
          <span className={styles.composerHint}>
            <CornerDownLeft size={13} aria-hidden /> Ctrl + Enter
          </span>
          <Button type="submit" variant="ai" icon={Sparkles} disabled={!text.trim()}>
            Открыть в AI Workspace
          </Button>
        </div>
      </form>

      <div className={styles.scenarioRow} role="group" aria-label="Быстрые сценарии">
        {scenarios.slice(0, 5).map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              type="button"
              className={styles.scenarioChip}
              aria-pressed={scenarioId === s.id}
              onClick={() => applyScenario(s.id)}
            >
              <Icon size={15} aria-hidden />
              {s.title}
            </button>
          );
        })}
      </div>
    </section>
  );
}
