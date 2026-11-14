"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, CornerDownLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAccount } from "@/features/account/store";
import { useProjectContext } from "@/features/projects/context";
import { useWorkspace } from "@/features/workspace/store";
import { scenarioPrompt, scenarios } from "@/features/workspace/scenarios";
import { countLabel, formatWeekday, greeting } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { ScenarioId } from "@/lib/types";
import styles from "./Dashboard.module.css";

/**
 * Dashboard Briefing (F3): the brand selector lists Web API v2 fixture projects and IS the session's selected
 * brand (`useProjectContext`), so Projects and the AI Workspace open the same `project_id`. «Открыть в AI
 * Workspace» only hands over a draft (text, project, scenario, origin): nothing is sent until the user confirms in
 * the Workspace.
 */
export function Briefing() {
  const router = useRouter();
  const { notify } = useToast();
  const now = useNow();
  const { profile } = useAccount();
  const { projects, threads, status: projectsStatus, selectedProjectId, selectedProject, selectProject } = useProjectContext();
  const { prepareDraft } = useWorkspace();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const brandSelectId = useId();

  const selectable = projects.filter((p) => p.project.status !== "archived");
  const [scenarioId, setScenarioId] = useState<ScenarioId | null>(null);
  const [text, setText] = useState("");

  // First visit: the most recently updated active brand becomes the session's brand. An existing selection is kept
  // as is — a stale one is shown as "not selected", never replaced by another project.
  const firstActive = selectable.find((p) => p.project.status === "active") ?? selectable[0] ?? null;
  useEffect(() => {
    if (projectsStatus === "ready" && !selectedProjectId && firstActive) selectProject(firstActive.project.id);
  }, [projectsStatus, selectedProjectId, firstActive, selectProject]);

  const brand = selectedProject?.project ?? null;
  const runningCount = threads.filter((t) => t.inFlight).length;
  const activeCount = projects.filter((p) => p.project.status === "active").length;

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
    // The AI Workspace sends requests itself (Web API v2 test data); here we only hand over a draft.
    const projectId = brand?.id ?? null;
    prepareDraft({ projectId, scenarioId, text: clean, origin: { label: "Обзор", href: "/" } });
    notify({
      tone: "info",
      title: "Черновик открыт в AI Workspace",
      description: "Проверьте проект и отправьте запрос там. AI не подключён: ответы берутся из тестовых данных.",
    });
    setText("");
    setScenarioId(null);
    router.push(projectId ? `/workspace?new=1&project=${encodeURIComponent(projectId)}` : "/workspace?new=1");
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
              {runningCount > 0 && <> · {countLabel(runningCount, ["запрос выполняется", "запроса выполняются", "запросов выполняются"])}</>}
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
              value={brand?.id ?? ""}
              onChange={(e) => selectProject(e.target.value || null)}
              disabled={selectable.length === 0}
            >
              {(selectable.length === 0 || !brand) && <option value="">{selectable.length === 0 ? "Без проекта" : "Выберите бренд"}</option>}
              {selectable.map((p) => (
                <option key={p.project.id} value={p.project.id}>
                  {p.canSubmit ? p.project.name : `${p.project.name} · только просмотр`}
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
