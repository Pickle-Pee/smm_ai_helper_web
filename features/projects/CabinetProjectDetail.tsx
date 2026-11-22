"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { FolderSearch } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useCabinetSession } from "@/features/account/CabinetSession";
import { isWebApiError } from "@/lib/api/v2/errors";
import { PROJECT_ROLE_LABEL } from "@/lib/api/v2/presenters";
import type { Project, ProjectBrand, ProjectBrandPatch, ProjectPatch } from "@/lib/api/v2/types";
import { brandWithUpdatedProject, cabinetWriteError, loadCabinetProject, useCabinetProjects, useCabinetResource } from "./cabinet";
import { projectStatusLabel } from "./model";
import { statusTone } from "./components/ProjectCard";
import styles from "./CabinetProjects.module.css";

export function CabinetProjectDetail({ projectId }: { projectId: string }) {
  const { api } = useCabinetSession();
  const load = useCallback((signal: AbortSignal) => loadCabinetProject(api, projectId, signal), [api, projectId]);
  const { resource, reload } = useCabinetResource(load);

  if (resource.status === "loading") return <Page><p role="status">Загружаем проект…</p></Page>;
  if (resource.status === "error") {
    const missing = isWebApiError(resource.error) && [403, 404, 422].includes(resource.error.status ?? 0);
    return (
      <Page>
        {missing ? <EmptyState icon={FolderSearch} title="Проект недоступен" action={<ButtonLink href="/projects">К проектам</ButtonLink>} />
          : <ErrorState title="Не удалось загрузить проект" onRetry={reload} />}
      </Page>
    );
  }

  return <ProjectEditor initialProject={resource.data.project} initialBrand={resource.data.brand} reload={reload} />;
}

function ProjectEditor({ initialProject, initialBrand, reload }: { initialProject: Project; initialBrand: ProjectBrand; reload: () => void }) {
  const { api } = useCabinetSession();
  const { memberships, reloadProjects } = useCabinetProjects();
  const [project, setProject] = useState(initialProject);
  const [brand, setBrand] = useState(initialBrand);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  const org = memberships.status === "ready" ? memberships.data.find((item) => item.organization.id === project.org_id) : undefined;

  async function mutate(action: () => Promise<void>, success: string) {
    if (pending.current || refreshRequired) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      reloadProjects();
      setMessage(success);
    } catch (err) {
      setError(cabinetWriteError(err));
      if (isWebApiError(err) && (err.code === "stale_project" || err.outcomeUnknown)) setRefreshRequired(true);
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }

  function applyBrand(next: ProjectBrand) {
    setBrand(next);
    setProject((previous) => brandWithUpdatedProject(previous, next));
  }

  const canEdit = project.permissions.can_edit;
  const canImport = project.permissions.can_import_telegram_brand && !brand.imported_from;
  const blocked = busy || refreshRequired;

  return (
    <Page>
      <ButtonLink href="/projects" variant="ghost">К проектам</ButtonLink>
      <PageHeader title={project.name} description={[org?.organization.name, PROJECT_ROLE_LABEL[project.role]].filter(Boolean).join(" · ")}
        actions={<Badge tone={statusTone[project.status]}>{projectStatusLabel[project.status]}</Badge>} />
      {error && <Card padded><p role="alert">{error}</p>{refreshRequired && <Button onClick={() => { reloadProjects(); reload(); }}>Обновить данные и сбросить черновик</Button>}</Card>}
      {message && <p role="status">{message}</p>}
      <Card padded>
        {canEdit
          ? <ProjectForm key={project.version} project={project} disabled={blocked} onSave={(body) => void mutate(async () => {
            const next = await api.updateProject(project.id, body);
            setProject(next);
            // Project settings and the brand have independent versions. Keep a newer brand already on screen.
            setBrand((current) => current.version > next.brand.version ? current : next.brand);
          }, "Проект сохранён.")} />
          : <p>Доступ к проекту только для просмотра.</p>}
      </Card>
      <Card padded>
        <div className={styles.form}>
          <h2>Бренд</h2>
          {brand.imported_from && <p>Скопирован из Telegram {new Date(brand.imported_from.imported_at).toLocaleDateString("ru-RU")}.</p>}
          {canEdit
            ? <BrandForm key={brand.version} brand={brand} disabled={blocked} onSave={(body) => void mutate(async () => {
              applyBrand(await api.updateProjectBrand(project.id, body));
            }, "Бренд сохранён.")} />
            : <BrandFields brand={brand} />}
          {canImport && <Button disabled={blocked} onClick={() => setImportOpen(true)}>Импортировать бренд из Telegram</Button>}
        </div>
      </Card>
      <Dialog open={importOpen} onClose={() => setImportOpen(false)} title="Импортировать бренд из Telegram?"
        description="Brenvio скопирует профиль из Telegram, заменив поля веб-бренда. Дальнейшие изменения в Telegram и кабинете сохраняются независимо, автоматической синхронизации нет."
        footer={<>
          <Button onClick={() => setImportOpen(false)}>Отмена</Button>
          <Button variant="primary" disabled={blocked} onClick={() => {
            setImportOpen(false);
            void mutate(async () => {
              applyBrand(await api.importTelegramBrand(project.id, { expected_version: brand.version, confirm_overwrite: true }));
            }, "Бренд скопирован из Telegram.");
          }}>Подтвердить импорт</Button>
        </>} />
    </Page>
  );
}

function ProjectForm({ project, disabled, onSave }: { project: Project; disabled: boolean; onSave: (body: ProjectPatch) => void }) {
  const [name, setName] = useState(project.name);
  const [status, setStatus] = useState(project.status);
  const changed = (name.trim() && name.trim() !== project.name) || status !== project.status;

  return (
    <form className={styles.form} onSubmit={(event) => {
      event.preventDefault();
      if (disabled || !name.trim() || !changed) return;
      const body: ProjectPatch = { expected_version: project.version };
      if (name.trim() !== project.name) body.name = name.trim();
      if (status !== project.status) body.status = status;
      onSave(body);
    }}>
      <h2>Настройки проекта</h2>
      <div className={styles.columns}>
        <Field label="Название проекта" required>
          {(control) => <Input {...control} value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />}
        </Field>
        <Field label="Статус проекта">
          {(control) => <Select {...control} value={status} onChange={(event) => setStatus(event.target.value as Project["status"])}>
            {Object.entries(projectStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>}
        </Field>
      </div>
      <div><Button variant="primary" type="submit" disabled={disabled || !name.trim() || !changed}>Сохранить проект</Button></div>
    </form>
  );
}

const BRAND_TEXT = [
  { key: "brand_name", label: "Название бренда", max: 255 },
  { key: "product_description", label: "Продукт", max: 4000 },
  { key: "audience", label: "Аудитория", max: 4000 },
  { key: "tone", label: "Тон общения", max: 4000 },
] as const;
const BRAND_LIST = [
  { key: "goals", label: "Цели", count: 10, max: 300 },
  { key: "channels", label: "Каналы", count: 20, max: 100 },
] as const;

function BrandFields({ brand }: { brand: ProjectBrand }) {
  return <dl className={styles.brandFields}>
    {BRAND_TEXT.map(({ key, label }) => <div key={key}><dt>{label}</dt><dd>{brand[key] || "—"}</dd></div>)}
    {BRAND_LIST.map(({ key, label }) => <div key={key}><dt>{label}</dt><dd>{brand[key].join("\n") || "—"}</dd></div>)}
  </dl>;
}

function BrandForm({ brand, disabled, onSave }: { brand: ProjectBrand; disabled: boolean; onSave: (body: ProjectBrandPatch) => void }) {
  const [dirty, setDirty] = useState(false);
  const [validation, setValidation] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const fields = new FormData(event.currentTarget);
    const body: ProjectBrandPatch = { expected_version: brand.version };
    for (const { key } of BRAND_TEXT) {
      const value = String(fields.get(key) ?? "");
      if (value !== (brand[key] ?? "")) body[key] = value.trim() || null;
    }
    for (const { key, label, count, max } of BRAND_LIST) {
      const value = String(fields.get(key) ?? "");
      if (value === brand[key].join("\n")) continue;
      const entries = value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
      if (entries.length > count || entries.some((entry) => entry.length > max)) {
        setValidation(`«${label}» — максимум ${count} строк по ${max} символов.`);
        return;
      }
      body[key] = entries;
    }
    if (Object.keys(body).length > 1) onSave(body);
    else setDirty(false);
  }

  return (
    <form className={styles.form} onSubmit={submit} onChange={() => { setDirty(true); setValidation(""); }}>
      {BRAND_TEXT.map(({ key, label, max }) => (
        <Field key={key} label={label}>
          {(control) => key === "brand_name"
            ? <Input {...control} name={key} maxLength={max} defaultValue={brand[key] ?? ""} />
            : <Textarea {...control} name={key} maxLength={max} rows={3} defaultValue={brand[key] ?? ""} />}
        </Field>
      ))}
      <div className={styles.columns}>
        {BRAND_LIST.map(({ key, label }) => (
          <Field key={key} label={label} hint="Одна запись на строку">
            {(control) => <Textarea {...control} name={key} rows={4} defaultValue={brand[key].join("\n")} />}
          </Field>
        ))}
      </div>
      {validation && <p role="alert">{validation}</p>}
      <div><Button variant="primary" type="submit" disabled={disabled || !dirty}>Сохранить бренд</Button></div>
    </form>
  );
}
