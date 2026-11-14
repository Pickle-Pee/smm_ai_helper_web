"use client";

import { useId } from "react";
import { FileWarning, FlaskConical, ShieldAlert, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { ResultView } from "@/lib/api/v2/presenters";
import { cx } from "@/lib/cx";
import { ResultBlockView } from "./ResultCard";
import resultStyles from "./ResultCard.module.css";
import styles from "./ContractDemo.module.css";

export const DEMO_RESULT_LABEL = "Пример из тестовых данных";

/**
 * Read-only rendering of a Web API v2 result view model.
 *
 * Deliberately different from `ResultCard` (no violet "AI" edge, no approve/copy actions): everything rendered
 * here comes from contract fixtures, never from a model, and is labelled «Пример из тестовых данных».
 * Content is `presentation.payload`; stored/provenance metadata and the viewer projection are shown apart.
 */
export function ContractResultCard({ view }: { view: ResultView }) {
  const titleId = useId();

  if (view.status !== "available") {
    const Icon = view.status === "corrupted" ? ShieldAlert : view.status === "format_unsupported" ? FileWarning : TriangleAlert;
    return (
      <article className={cx(styles.resultCard, styles.unavailable)} aria-labelledby={titleId} data-result-status={view.status}>
        <header className={styles.resultHeader}>
          <Badge tone="outline" size="sm" icon={FlaskConical}>
            {DEMO_RESULT_LABEL}
          </Badge>
          <Badge tone={view.status === "corrupted" ? "danger" : "warning"} size="sm">
            {view.status}
          </Badge>
        </header>
        <div className={styles.unavailableBody}>
          <Icon size={20} aria-hidden />
          <div>
            <h4 id={titleId} className={styles.resultTitle}>
              {view.title}
            </h4>
            <p className={styles.resultSummary}>{view.description}</p>
          </div>
        </div>
      </article>
    );
  }

  const { meta } = view;
  return (
    <article className={styles.resultCard} aria-labelledby={titleId} data-result-status="available">
      <header className={styles.resultHeader}>
        <Badge tone="outline" size="sm" icon={FlaskConical}>
          {DEMO_RESULT_LABEL}
        </Badge>
        <Badge tone="neutral" size="sm">
          {view.kind}
        </Badge>
      </header>
      <h4 id={titleId} className={styles.resultTitle}>
        {view.title}
      </h4>
      <p className={styles.resultSummary}>{view.summary}</p>
      <div className={cx(resultStyles.blocks, styles.blocks)}>
        {view.blocks.map((block, index) => (
          <ResultBlockView key={index} block={block} />
        ))}
      </div>
      <dl className={styles.meta}>
        <div>
          <dt>Сохранено</dt>
          <dd>
            {meta.stored.schemaVersion} · sha256 {meta.stored.payloadSha256.slice(0, 12)}…
          </dd>
        </div>
        <div>
          <dt>Представление</dt>
          <dd>
            {meta.presentation.schemaVersion}
            {meta.presentation.upcasters.length ? ` · upcast: ${meta.presentation.upcasters.join(", ")}` : ""}
          </dd>
        </div>
        <div>
          <dt>Происхождение</dt>
          <dd>
            {meta.provenance.sourceKind} · ревизия {meta.provenance.revision}
          </dd>
        </div>
        <div>
          <dt>Автор</dt>
          <dd>
            {meta.author.displayName ?? "Участник"}
            {meta.author.isSelf ? " (вы)" : ""}
          </dd>
        </div>
      </dl>
    </article>
  );
}
