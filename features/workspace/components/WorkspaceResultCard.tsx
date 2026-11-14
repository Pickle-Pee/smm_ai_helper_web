"use client";

import { useId, type ReactNode } from "react";
import { Copy, FileWarning, FlaskConical, RotateCcw, ShieldAlert, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { ResultView } from "@/lib/api/v2/presenters";
import { formatTime } from "@/lib/format";
import { cx } from "@/lib/cx";
import { resultToPlainText } from "../model";
import { FIXTURE_LABEL } from "../v2/simulation";
import { ResultBlockView } from "./ResultCard";
import resultStyles from "./ResultCard.module.css";
import styles from "./RequestState.module.css";

const KIND_LABEL: Record<string, string> = {
  DIRECT_RESULT: "Расчёт",
  MODULE_RESULT: "Модуль",
  RUN: "Процесс",
  NEEDS_INPUT: "Уточнение",
  UNSUPPORTED: "Не поддерживается",
};

/**
 * A Web API v2 result in the AI Workspace. Content comes from `presentation.payload` (via presenters); stored
 * data / provenance stay out of the content and only a human summary of them is offered under «О результате».
 * Always labelled as test data: in F2 no AI model produced it.
 */
export function WorkspaceResultCard({ view, onReopen, children }: { view: ResultView; onReopen?: () => void; children?: ReactNode }) {
  const titleId = useId();
  const { notify } = useToast();

  if (view.status !== "available") {
    const Icon = view.status === "corrupted" ? ShieldAlert : view.status === "format_unsupported" ? FileWarning : TriangleAlert;
    const canReopen = onReopen && (view.status === "unreadable" || view.status === "not_ready");
    return (
      <article className={styles.fixtureCard} aria-labelledby={titleId} data-result-status={view.status}>
        <header>
          <div className={resultStyles.badges}>
            <Badge tone="outline" size="sm" icon={FlaskConical}>
              {FIXTURE_LABEL}
            </Badge>
          </div>
        </header>
        <div className={styles.unavailableBody}>
          <Icon size={20} aria-hidden />
          <div>
            <h3 id={titleId} className={styles.unavailableTitle}>
              {view.title}
            </h3>
            <p>{view.description}</p>
            {canReopen && (
              <Button size="sm" icon={RotateCcw} onClick={onReopen} className={styles.reopen}>
                Открыть ещё раз
              </Button>
            )}
          </div>
        </div>
      </article>
    );
  }

  async function copy() {
    if (view.status !== "available") return;
    try {
      await navigator.clipboard.writeText(`${resultToPlainText(view)}\n\n${FIXTURE_LABEL}`);
      notify({ title: "Скопировано", description: "Текст тестового примера в буфере обмена." });
    } catch {
      notify({ tone: "info", title: "Не удалось скопировать", description: "Браузер запретил доступ к буферу обмена." });
    }
  }

  const { meta } = view;
  const materialized = meta.provenance.materializedAt;
  return (
    <article className={styles.fixtureCard} aria-labelledby={titleId} data-result-status="available">
      <header>
        <div className={resultStyles.badges}>
          <Badge tone="outline" size="sm" icon={FlaskConical}>
            {FIXTURE_LABEL}
          </Badge>
          <Badge tone="ai" size="sm">
            {KIND_LABEL[view.kind] ?? "Результат"}
          </Badge>
        </div>
        <h3 id={titleId} className={resultStyles.title}>
          {view.title}
        </h3>
        <p className={resultStyles.summary}>{view.summary}</p>
      </header>
      <div className={cx(resultStyles.blocks, styles.fixtureBlocks)}>
        {view.blocks.map((block, index) => (
          <ResultBlockView key={index} block={block} />
        ))}
      </div>
      {children}
      <footer className={styles.fixtureFooter}>
        <Button size="sm" icon={Copy} onClick={copy}>
          Копировать
        </Button>
        {onReopen && (
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={onReopen}>
            Открыть сохранённый результат
          </Button>
        )}
        <span className={styles.author}>
          Автор запроса: {meta.author.displayName ?? "участник проекта"}
          {meta.author.isSelf ? " (вы)" : ""}
        </span>
        <details className={styles.about}>
          <summary>О результате</summary>
          <dl>
            <dt>Сохранён</dt>
            <dd>
              <time dateTime={materialized}>{new Date(materialized).toLocaleDateString("ru-RU")} {formatTime(materialized)}</time>
            </dd>
            <dt>Версия запроса</dt>
            <dd>{meta.provenance.revision}</dd>
            <dt>Данные</dt>
            <dd>тестовый набор Web API v2, без вызова AI</dd>
          </dl>
        </details>
      </footer>
    </article>
  );
}
