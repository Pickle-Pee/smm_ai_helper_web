"use client";

import { useState, type FormEvent } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Textarea } from "@/components/ui/Form";
import { inputLabel, type ClarificationView } from "@/lib/api/v2/presenters";
import styles from "./RequestState.module.css";

export interface ClarificationAnswer {
  context: Record<string, string>;
  confirmStatementIds: string[];
}

/**
 * Answer to a Copilot `NEEDS_INPUT`. The answer continues the SAME request (same key, next revision, same
 * message) — the controller/coordinator guarantee that; this form only collects the missing context.
 */
export function ClarificationForm({
  clarification,
  disabled,
  onSubmit,
}: {
  clarification: ClarificationView;
  disabled?: boolean;
  onSubmit: (answer: ClarificationAnswer) => void;
}) {
  const keys = [...new Set(clarification.alternativeKeys.flat())];
  const [values, setValues] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const filled = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));
  const empty = Object.keys(filled).length === 0 && confirmed.length === 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (empty || disabled) return;
    onSubmit({ context: filled, confirmStatementIds: confirmed });
  }

  return (
    <form className={styles.clarify} onSubmit={submit} aria-label="Ответ на уточнение">
      <p className={styles.hint}>
        Ответ продолжит этот же запрос — новый запрос не создаётся. {clarification.alternativeKeys.length > 1 ? "Достаточно заполнить одну из групп." : ""}
      </p>
      {keys.map((key) => (
        <Field key={key} label={inputLabel(key)}>
          {(control) => (
            <Textarea
              {...control}
              rows={2}
              value={values[key] ?? ""}
              disabled={disabled}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
            />
          )}
        </Field>
      ))}
      {clarification.candidates.length > 0 && (
        <fieldset>
          <legend>Подтвердите утверждения с вашего сайта</legend>
          {clarification.candidates.map((c) => (
            <label key={c.statementId} className={styles.check}>
              <input
                type="checkbox"
                disabled={disabled}
                checked={confirmed.includes(c.statementId)}
                onChange={(e) => setConfirmed((list) => (e.target.checked ? [...list, c.statementId] : list.filter((id) => id !== c.statementId)))}
              />
              <span>{c.statement}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div>
        <Button type="submit" variant="ai" size="sm" icon={SendHorizontal} disabled={empty || disabled}>
          Ответить на уточнение
        </Button>
      </div>
    </form>
  );
}
