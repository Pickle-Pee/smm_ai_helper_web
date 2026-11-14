"use client";

import Link from "next/link";
import { ArrowUpRight, Building2 } from "lucide-react";
import { Meter } from "@/components/ui/Card";
import { Monogram } from "@/components/ui/Monogram";
import { EmptyState } from "@/components/ui/States";
import { contextCompleteness } from "@/features/projects/model";
import type { Project, ScenarioId } from "@/lib/types";
import { scenarios } from "../scenarios";
import styles from "../Workspace.module.css";

export function ContextPanel({
  project,
  onUseScenario,
  projectLink = true,
  emptyDescription = "Выберите бренд в шапке диалога — AI будет учитывать описание бизнеса, аудиторию и конкурентов.",
}: {
  project: Project | null;
  onUseScenario: (id: ScenarioId) => void;
  /** Link to the project page (same Web API v2 project id as the Workspace since F3). */
  projectLink?: boolean;
  emptyDescription?: string;
}) {
  return (
    <div className={styles.context}>
      <h2 className={styles.panelTitle}>Контекст бренда</h2>

      {!project ? (
        <EmptyState
          compact
          icon={Building2}
          title="Бренд не выбран"
          description={emptyDescription}
        />
      ) : (
        <BrandContext project={project} projectLink={projectLink} />
      )}

      <section className={styles.contextSection} aria-labelledby="ctx-scenarios">
        <h3 className={styles.contextLabel} id="ctx-scenarios">
          Сценарии
        </h3>
        <ul className={styles.scenarioList}>
          {scenarios.map((s) => {
            const Icon = s.icon;
            return (
              <li key={s.id}>
                <button type="button" className={styles.scenarioItem} onClick={() => onUseScenario(s.id)}>
                  <span className={styles.scenarioIcon} aria-hidden>
                    <Icon size={15} />
                  </span>
                  <span className={styles.scenarioText}>
                    <span className={styles.scenarioName}>{s.title}</span>
                    <span className={styles.scenarioDesc}>{s.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/**
 * Brand context of a Web API v2 project. Documents are not listed here: they belong to a separate legacy demo
 * dataset that is not linked to Web API v2 projects (F3).
 */
function BrandContext({ project, projectLink }: { project: Project; projectLink: boolean }) {
  const { percent, missing } = contextCompleteness(project);
  const fields: { label: string; value: string }[] = [
    { label: "Продукт", value: project.description },
    { label: "Аудитория", value: project.audience },
    { label: "УТП", value: project.usp },
    { label: "Tone of voice", value: project.toneOfVoice },
  ];

  return (
    <>
      <div className={styles.brandCard}>
        <Monogram name={project.name} color={project.color} />
        <div className={styles.brandText}>
          <p className={styles.brandName} title={project.name}>
            {project.name}
          </p>
          <p className={styles.brandIndustry}>{project.industry}</p>
        </div>
      </div>
      {projectLink && (
        <Link href={`/projects/${project.id}`} className={styles.brandLink}>
          Открыть карточку проекта <ArrowUpRight size={14} aria-hidden />
        </Link>
      )}

      <div className={styles.contextSection}>
        <Meter
          value={percent}
          label="Полнота контекста"
          hint={missing.length > 0 ? `Не заполнено: ${missing.join(", ").toLocaleLowerCase("ru")}` : "Контекст заполнен полностью"}
        />
      </div>

      <dl className={styles.contextFields}>
        {fields.map((f) => (
          <div key={f.label} className={styles.contextField}>
            <dt className={styles.contextLabel}>{f.label}</dt>
            <dd className={f.value ? styles.contextValue : styles.contextMissing}>{f.value || "Не заполнено"}</dd>
          </div>
        ))}
        <div className={styles.contextField}>
          <dt className={styles.contextLabel}>Конкуренты</dt>
          <dd>
            {project.competitors.length ? (
              <ul className={styles.chips}>
                {project.competitors.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : (
              <span className={styles.contextMissing}>Не заполнено</span>
            )}
          </dd>
        </div>
        <div className={styles.contextField}>
          <dt className={styles.contextLabel}>Каналы</dt>
          <dd>
            {project.channels.length ? (
              <ul className={styles.chips}>
                {project.channels.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : (
              <span className={styles.contextMissing}>Не заполнено</span>
            )}
          </dd>
        </div>
      </dl>
    </>
  );
}
