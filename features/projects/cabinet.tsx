"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useCabinetSession } from "@/features/account/CabinetSession";
import { isWebApiError } from "@/lib/api/v2/errors";
import type { CabinetApi } from "@/lib/api/v2/cabinet";
import type { OrganizationList, Project, ProjectBrand } from "@/lib/api/v2/types";

type Resource<T> =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; data: T };

const LOADING = { status: "loading" } as const;

export function useCabinetResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [request, setRequest] = useState(0);
  const [result, setResult] = useState<{ load: typeof load; request: number; resource: Resource<T> }>();
  useEffect(() => {
    const controller = new AbortController();
    function publish(resource: Resource<T>) {
      if (!controller.signal.aborted) setResult({ load, request, resource });
    }
    void load(controller.signal).then(
      (data) => publish({ status: "ready", data }),
      (error) => publish({ status: "error", error }),
    );
    return () => controller.abort();
  }, [load, request]);
  return {
    resource: result?.load === load && result.request === request ? result.resource : LOADING,
    reload: useCallback(() => setRequest((value) => value + 1), []),
  };
}

export async function listCabinetProjects(api: CabinetApi, orgId: string, signal: AbortSignal) {
  const projects = new Map<string, Project>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await api.listProjects(orgId, { limit: 50, cursor }, { signal });
    for (const item of page.items) {
      if (item.org_id !== orgId) throw new Error("Project organization mismatch");
      projects.set(item.id, item);
    }
    cursor = page.next_cursor ?? undefined;
    if (cursor) {
      if (cursors.has(cursor)) throw new Error("Repeated project cursor");
      cursors.add(cursor);
    }
  } while (cursor);
  return [...projects.values()];
}

export async function loadCabinetProject(api: CabinetApi, projectId: string, signal: AbortSignal) {
  const project = await api.getProject(projectId, { signal });
  if (project.id.toLowerCase() !== projectId.toLowerCase()) throw new Error("Project id mismatch");
  const brand = await api.getProjectBrand(project.id, { signal });
  if (brand.project_id !== project.id) throw new Error("Brand project mismatch");
  return { project, brand };
}

type Membership = OrganizationList["items"][number];
type CabinetProjects = {
  memberships: Resource<Membership[]>;
  organization?: Membership;
  chooseOrganization: (id: string) => void;
  projects: Resource<Project[]>;
  reloadOrganizations: () => void;
  reloadProjects: () => void;
};

const CabinetProjectsContext = createContext<CabinetProjects | null>(null);

export function useCabinetProjects() {
  const value = useContext(CabinetProjectsContext);
  if (!value) throw new Error("Cabinet projects are unavailable");
  return value;
}

export function CabinetProjectsProvider({ children }: { children: ReactNode }) {
  const { api } = useCabinetSession();
  const [selected, chooseOrganization] = useState<string>();
  const loadOrgs = useCallback(async (signal: AbortSignal) => (await api.listOrganizations({ signal })).items, [api]);
  const { resource: memberships, reload: reloadOrganizations } = useCabinetResource(loadOrgs);
  const items = memberships.status === "ready" ? memberships.data : [];
  const organization = items.find((item) => item.organization.id === selected)
    ?? items.find((item) => item.organization.kind === "personal")
    ?? items[0];
  const orgId = organization?.organization.id;
  const loadProjects = useCallback((signal: AbortSignal) => orgId ? listCabinetProjects(api, orgId, signal) : Promise.resolve([]), [api, orgId]);
  const { resource: projects, reload: reloadProjects } = useCabinetResource(loadProjects);

  return (
    <CabinetProjectsContext.Provider value={{ memberships, organization, chooseOrganization, projects, reloadOrganizations, reloadProjects }}>
      {children}
    </CabinetProjectsContext.Provider>
  );
}

export function cabinetWriteError(error: unknown) {
  if (isWebApiError(error)) {
    switch (error.code) {
      case "stale_project": return "Данные изменились. Загрузите актуальную версию перед сохранением.";
      case "forbidden": return "У вашей роли нет права на это действие.";
      case "not_found": return "Проект больше недоступен.";
      case "csrf_failed": return "Не удалось подтвердить запрос. Обновите страницу.";
      case "feature_disabled": return "Импорт для этого бренда уже выполнен или недоступен.";
      case "import_source_missing": return "В Telegram нет сохранённого профиля бренда.";
      case "telegram_identity_required": return "Для импорта нужен привязанный Telegram-аккаунт.";
      case "invalid_request": return "Проверьте значения полей и повторите.";
      case "idempotency_conflict": return "Эта попытка создания уже использована. Проверьте список проектов.";
    }
    if (error.outcomeUnknown) return "Ответ не получен. Проверьте актуальные данные перед повтором.";
  }
  return "Не удалось сохранить изменения.";
}

export function brandWithUpdatedProject(project: Project, brand: ProjectBrand): Project {
  return { ...project, updated_at: brand.updated_at, brand, permissions: {
    ...project.permissions,
    can_import_telegram_brand: !brand.imported_from && project.permissions.can_import_telegram_brand,
  } };
}
