"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import type { Project, ProjectStatus } from "@/lib/types";
import { parseList, projectStatusLabel, validateProjectInput, type ProjectValidation } from "../model";
import styles from "../Projects.module.css";

export interface ProjectFormValues {
  name: string;
  industry: string;
  description: string;
  audience: string;
  usp: string;
  toneOfVoice: string;
  goals: string;
  competitors: string[];
  channels: string[];
  status: ProjectStatus;
}

interface ProjectFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  project?: Project;
  onClose: () => void;
  onSubmit: (values: ProjectFormValues) => void;
}

export function ProjectFormDialog({ open, mode, project, onClose, onSubmit }: ProjectFormDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size={mode === "edit" ? "lg" : "md"}
      title={mode === "create" ? "Новый проект" : "Контекст бренда"}
      description={
        mode === "create"
          ? "Проект объединяет диалоги, результаты и документы одного бренда. Изменения сохраняются только в этой вкладке."
          : "AI использует эти данные как контекст в каждом запросе по бренду. Изменения сохраняются только в этой вкладке."
      }
    >
      <ProjectForm mode={mode} project={project} onCancel={onClose} onSubmit={onSubmit} />
    </Dialog>
  );
}

function ProjectForm({
  mode,
  project,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  project?: Project;
  onCancel: () => void;
  onSubmit: (values: ProjectFormValues) => void;
}) {
  const [values, setValues] = useState({
    name: project?.name ?? "",
    industry: project?.industry ?? "",
    description: project?.description ?? "",
    audience: project?.audience ?? "",
    usp: project?.usp ?? "",
    toneOfVoice: project?.toneOfVoice ?? "",
    goals: project?.goals ?? "",
    competitors: project?.competitors.join(", ") ?? "",
    channels: project?.channels.join(", ") ?? "",
    status: project?.status ?? ("draft" as ProjectStatus),
  });
  const [errors, setErrors] = useState<ProjectValidation>({});
  const [submitted, setSubmitted] = useState(false);

  const set = (key: keyof typeof values) => (value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (submitted) setErrors(validateProjectInput({ ...values, [key]: value }));
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    const nextErrors = validateProjectInput(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      const firstInvalid = (event.currentTarget as HTMLFormElement).querySelector<HTMLElement>("[aria-invalid='true']");
      firstInvalid?.focus();
      return;
    }
    onSubmit({
      ...values,
      name: values.name.trim(),
      industry: values.industry.trim(),
      competitors: parseList(values.competitors),
      channels: parseList(values.channels),
    });
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.formRow}>
        <Field label="Название бренда" required error={errors.name}>
          {(p) => <Input {...p} value={values.name} onChange={(e) => set("name")(e.target.value)} autoFocus placeholder="Например, Little Feet" maxLength={120} />}
        </Field>
        <Field label="Сфера бизнеса" required error={errors.industry}>
          {(p) => <Input {...p} value={values.industry} onChange={(e) => set("industry")(e.target.value)} placeholder="Например, детский сад" />}
        </Field>
      </div>
      <Field label="Описание продукта" hint="Что продаёте, где, чем отличаетесь — 2–3 предложения.">
        {(p) => <Textarea {...p} rows={3} value={values.description} onChange={(e) => set("description")(e.target.value)} />}
      </Field>
      <Field label="Целевая аудитория" hint="Кто покупает и почему.">
        {(p) => <Textarea {...p} rows={3} value={values.audience} onChange={(e) => set("audience")(e.target.value)} />}
      </Field>

      {mode === "edit" && (
        <>
          <div className={styles.formRow}>
            <Field label="УТП">
              {(p) => <Textarea {...p} rows={2} value={values.usp} onChange={(e) => set("usp")(e.target.value)} />}
            </Field>
            <Field label="Tone of voice">
              {(p) => <Textarea {...p} rows={2} value={values.toneOfVoice} onChange={(e) => set("toneOfVoice")(e.target.value)} />}
            </Field>
          </div>
          <Field label="Цели">
            {(p) => <Textarea {...p} rows={2} value={values.goals} onChange={(e) => set("goals")(e.target.value)} />}
          </Field>
          <div className={styles.formRow}>
            <Field label="Конкуренты" hint="Через запятую">
              {(p) => <Input {...p} value={values.competitors} onChange={(e) => set("competitors")(e.target.value)} />}
            </Field>
            <Field label="Каналы" hint="Через запятую">
              {(p) => <Input {...p} value={values.channels} onChange={(e) => set("channels")(e.target.value)} />}
            </Field>
          </div>
          <Field label="Статус">
            {(p) => (
              <Select {...p} value={values.status} onChange={(e) => set("status")(e.target.value)}>
                {(Object.keys(projectStatusLabel) as ProjectStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {projectStatusLabel[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </>
      )}

      <div className={styles.formActions}>
        <Button onClick={onCancel}>Отмена</Button>
        <Button type="submit" variant="primary">
          {mode === "create" ? "Создать проект" : "Сохранить изменения"}
        </Button>
      </div>
    </form>
  );
}
