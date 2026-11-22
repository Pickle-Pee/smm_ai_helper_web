"use client";

import { FolderSearch, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Form";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useCabinetSession } from "@/features/account/CabinetSession";
import { isWebApiError } from "@/lib/api/v2/errors";
import { PROJECT_ROLE_LABEL, toUiProject } from "@/lib/api/v2/presenters";
import type { ProjectCreate } from "@/lib/api/v2/types";
import { useNow } from "@/lib/hooks";
import { cabinetWriteError, useCabinetProjects } from "./cabinet";
import { ProjectCard } from "./components/ProjectCard";
import styles from "./Projects.module.css";
import cabinetStyles from "./CabinetProjects.module.css";

export function OrganizationSelector() {
  const { memberships, organization, chooseOrganization, reloadOrganizations } = useCabinetProjects();
  if (memberships.status === "loading") return <p role="status">Загружаем организации…</p>;
  if (memberships.status === "error") return <ErrorState compact title="Организации недоступны" onRetry={reloadOrganizations} />;
  if (!organization) return <p>Нет доступных организаций.</p>;

  return (
    <div className={cabinetStyles.organization}>
      <Field label="Активная организация">
        {(control) => <Select {...control} value={organization.organization.id} onChange={(event) => chooseOrganization(event.target.value)}>
          {memberships.data.map(({ organization: org }) => <option key={org.id} value={org.id}>{org.name}</option>)}
        </Select>}
      </Field>
      <p>Роль в организации — {PROJECT_ROLE_LABEL[organization.role]}</p>
    </div>
  );
}

export function CabinetProjectList({ limit }: { limit?: number }) {
  const { memberships, projects, reloadProjects, organization } = useCabinetProjects();
  const now = useNow();
  if (memberships.status !== "ready" || !organization) return null;
  if (projects.status === "loading") return <p role="status">Загружаем проекты…</p>;
  if (projects.status === "error") return <ErrorState title="Не удалось загрузить проекты" onRetry={reloadProjects} />;
  if (!projects.data.length) return <EmptyState icon={FolderSearch} title="Проектов пока нет" />;

  return (
    <ul className={styles.grid}>
      {projects.data.slice(0, limit).map((project) => (
        <li key={project.id}>
          <ProjectCard project={toUiProject(project)} stats={{ roleLabel: PROJECT_ROLE_LABEL[project.role] }} now={now} />
        </li>
      ))}
    </ul>
  );
}

export function CabinetProjectsView() {
  const { organization } = useCabinetProjects();
  const [creatingFor, setCreatingFor] = useState<string>();
  const orgId = organization?.organization.id;
  const canCreate = organization && organization.role !== "viewer";

  return (
    <Page>
      <PageHeader title="Проекты и бренды" actions={canCreate && <Button variant="primary" icon={Plus} onClick={() => setCreatingFor(orgId)}>Новый проект</Button>} />
      <OrganizationSelector />
      {canCreate && orgId && creatingFor === orgId && <CreateProject key={orgId} orgId={orgId} onClose={() => setCreatingFor(undefined)} />}
      <CabinetProjectList />
    </Page>
  );
}

function CreateProject({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const { api } = useCabinetSession();
  const { reloadProjects } = useCabinetProjects();
  const router = useRouter();
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"active" | "draft">("active");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef(false);
  const requestController = useRef<AbortController | null>(null);
  const attempt = useRef<{ key: string; body: ProjectCreate } | null>(null);
  useEffect(() => () => requestController.current?.abort(), []);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (pending.current || !name.trim()) return;
    const body = { name: name.trim(), status };
    const request = attempt.current ?? { key: crypto.randomUUID(), body };
    attempt.current = request;
    const controller = new AbortController();
    requestController.current = controller;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const project = await api.createProject(orgId, request.body, request.key, { signal: controller.signal });
      if (controller.signal.aborted) return;
      reloadProjects();
      onClose();
      router.push(`/projects/${encodeURIComponent(project.id)}`);
    } catch (err) {
      if (controller.signal.aborted) return;
      const unknown = isWebApiError(err) && err.outcomeUnknown;
      if (!unknown) attempt.current = null;
      setUncertain(unknown);
      setError(unknown ? "Ответ потерян. Повторить запрос можно с тем же ключом, чтобы не создать дубликат." : cabinetWriteError(err));
    } finally {
      pending.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <Card padded>
      <form className={cabinetStyles.form} onSubmit={create}>
        <h2>Новый проект</h2>
        <Field label="Название проекта" required>
          {(control) => <Input {...control} value={name} required maxLength={120} readOnly={busy || uncertain} onChange={(event) => setName(event.target.value)} />}
        </Field>
        <Field label="Статус">
          {(control) => <Select {...control} value={status} disabled={busy || uncertain} onChange={(event) => setStatus(event.target.value === "draft" ? "draft" : "active")}>
            <option value="active">Активный</option>
            <option value="draft">Черновик</option>
          </Select>}
        </Field>
        {error && <p role="alert">{error}</p>}
        <div className={cabinetStyles.actions}>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>{uncertain ? "Повторить создание" : "Создать проект"}</Button>
          <Button disabled={busy} onClick={() => { if (uncertain) reloadProjects(); onClose(); }}>{uncertain ? "Проверить список" : "Отмена"}</Button>
        </div>
      </form>
    </Card>
  );
}
