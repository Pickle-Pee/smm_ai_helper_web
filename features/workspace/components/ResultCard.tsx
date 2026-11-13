"use client";

import { useId } from "react";
import { Copy, Download, Info, RotateCcw, Check, TriangleAlert } from "lucide-react";
import { Badge, SoonBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { ID, ResultBlock, StructuredResult } from "@/lib/types";
import { cx } from "@/lib/cx";
import { resultToPlainText } from "../model";
import { useWorkspace } from "../store";
import { ResultStatusBadge, scenarioTitle } from "./ResultBadges";
import { scenarioById } from "../scenarios";
import styles from "./ResultCard.module.css";

export function ResultCard({ threadId, messageId, result }: { threadId: ID; messageId: ID; result: StructuredResult }) {
  const { setResultStatus, toggleChecklistItem } = useWorkspace();
  const { notify } = useToast();
  const titleId = useId();
  const Icon = scenarioById.get(result.kind)?.icon;

  async function copy() {
    try {
      await navigator.clipboard.writeText(resultToPlainText(result));
      notify({ title: "Результат скопирован", description: "Текст в буфере обмена — можно вставить в документ или мессенджер." });
    } catch {
      notify({ tone: "info", title: "Не удалось скопировать", description: "Браузер запретил доступ к буферу обмена." });
    }
  }

  function toggleApproved() {
    const next = result.status === "approved" ? "review" : "approved";
    setResultStatus(threadId, messageId, next);
    notify({
      title: next === "approved" ? "Отмечено как проверенное" : "Возвращено на проверку",
      description: "Статус сохранён только в этой вкладке.",
    });
  }

  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <header className={styles.header}>
        <div className={styles.badges}>
          <Badge tone="ai" icon={Icon}>
            {scenarioTitle(result.kind)}
          </Badge>
          <ResultStatusBadge status={result.status} />
        </div>
        <h3 id={titleId} className={styles.title}>
          {result.title}
        </h3>
        <p className={styles.summary}>{result.summary}</p>
      </header>

      <div className={styles.blocks}>
        {result.blocks.map((block, index) => (
          <Block key={index} block={block} onToggle={(itemId) => toggleChecklistItem(threadId, messageId, itemId)} />
        ))}
      </div>

      <footer className={styles.footer}>
        <Button
          size="sm"
          variant={result.status === "approved" ? "ghost" : "primary"}
          icon={result.status === "approved" ? RotateCcw : Check}
          onClick={toggleApproved}
        >
          {result.status === "approved" ? "Вернуть на проверку" : "Отметить проверенным"}
        </Button>
        <Button size="sm" icon={Copy} onClick={copy}>
          Копировать
        </Button>
        <span className={styles.unavailable}>
          <Button size="sm" variant="ghost" icon={Download} disabled aria-describedby={`${titleId}-soon`}>
            Экспорт в DOCX
          </Button>
          <SoonBadge id={`${titleId}-soon`}>Скоро</SoonBadge>
        </span>
      </footer>
    </article>
  );
}

function Block({ block, onToggle }: { block: ResultBlock; onToggle: (itemId: ID) => void }) {
  switch (block.type) {
    case "heading":
      return <h4 className={styles.heading}>{block.text}</h4>;
    case "paragraph":
      return <p className={styles.paragraph}>{block.text}</p>;
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List className={cx(styles.list, block.ordered && styles.ordered)}>
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </List>
      );
    }
    case "metrics":
      return (
        <dl className={styles.metrics}>
          {block.items.map((m) => (
            <div key={m.label} className={styles.metric}>
              <dt>{m.label}</dt>
              <dd className={styles.metricValue}>{m.value}</dd>
              {m.hint && <dd className={styles.metricHint}>{m.hint}</dd>}
            </div>
          ))}
        </dl>
      );
    case "stages":
      return (
        <ol className={styles.stages} aria-label="Этапы">
          {block.items.map((s, i) => (
            <li key={s.title} className={styles.stage}>
              <div className={styles.stageMarker} aria-hidden>
                {i + 1}
              </div>
              <div className={styles.stagePeriod}>{s.period}</div>
              <div className={styles.stageTitle}>{s.title}</div>
              <ul className={styles.stagePoints}>
                {s.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      );
    case "table":
      return (
        <figure className={styles.tableFigure}>
          {block.caption && <figcaption className={styles.caption}>{block.caption}</figcaption>}
          <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={block.caption ?? "Таблица результата"}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {block.columns.map((c) => (
                    <th key={c} scope="col">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) =>
                      c === 0 ? (
                        <th key={c} scope="row">
                          {cell}
                        </th>
                      ) : (
                        <td key={c}>{cell}</td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </figure>
      );
    case "checklist": {
      const done = block.items.filter((i) => i.done).length;
      return (
        <fieldset className={styles.checklist}>
          <legend className={styles.checklistTitle}>
            {block.title ?? "Чек-лист"}
            <span className={styles.checklistCount}>
              {done} из {block.items.length}
            </span>
          </legend>
          {block.items.map((item) => (
            <label key={item.id} className={cx(styles.checkItem, item.done && styles.checkDone)}>
              <input type="checkbox" checked={item.done} onChange={() => onToggle(item.id)} />
              <span>{item.text}</span>
            </label>
          ))}
        </fieldset>
      );
    }
    case "callout": {
      const Icon = block.tone === "warning" ? TriangleAlert : Info;
      return (
        <div className={cx(styles.callout, styles[block.tone])}>
          <Icon size={17} aria-hidden />
          <p>{block.text}</p>
        </div>
      );
    }
    default:
      return null;
  }
}
