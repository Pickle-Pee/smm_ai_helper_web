"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FlaskConical, FolderSearch, LayoutGrid, List, Plus, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SearchField, Select } from "@/components/ui/Form";
import { Monogram } from "@/components/ui/Monogram";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { PROJECT_ROLE_LABEL } from "@/lib/api/v2/presenters";
import { formatRelative } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { cx } from "@/lib/cx";
import { useProjectContext } from "./context";
import {
  contextCompleteness,
  countByStatus,
  defaultProjectFilter,
  filterProjects,
  projectStatusLabel,
  type ProjectFilter,
  type ProjectSort,
  type ProjectStatusFilter,
} from "./model";
import { ProjectCard, statusTone } from "./components/ProjectCard";
import { PROJECT_WRITES_UNAVAILABLE } from "./copy";
import styles from "./Projects.module.css";

type View = "grid" | "list";

/**
 * Projects (F3): the list comes from the unified Web API v2 project context — the same ids as Dashboard and the AI
 * Workspace. Read-only: no local or simulated project creation.
 */
export function ProjectsView() {
  const router = useRouter();
  const params = useSearchParams();
  const now = useNow();
  const { notify } = useToast();
  const { projects: views, byId, status, retry, threadsFor } = useProjectContext();
  const [filter, setFilter] = useState<ProjectFilter>(defaultProjectFilter);
  const [view, setView] = useState<View>("grid");

  // Old links `/projects?create=1` (and bookmarks) explain why nothing opens instead of showing a fake form.
  useEffect(() => {
    if (params.get("create") === "1") {
      router.replace("/projects", { scroll: false });
      notify({ tone: "info", title: "Создание проектов пока недоступно", description: PROJECT_WRITES_UNAVAILABLE });
    }
  }, [params, router, notify]);

  const projects = useMemo(() => views.map((v) => v.project), [views]);
  const counts = useMemo(() => countByStatus(projects), [projects]);
  const visible = useMemo(() => filterProjects(projects, filter), [projects, filter]);
  const statsFor = (id: string) => {
    const role = byId.get(id)?.role;
    return { threads: threadsFor(id).length, roleLabel: role ? PROJECT_ROLE_LABEL[role] : "—" };
  };
  const filtersActive = filter.query.trim() !== "" || filter.status !== "all";

  return (
    <Page>
      <PageHeader
        title="Проекты и бренды"
        description="Бизнес-контекст каждого бренда: продукт, аудитория, конкуренты и каналы. AI учитывает его в запросах."
        actions={
          <Button variant="primary" icon={Plus} disabled aria-describedby="projects-writes-note" title={PROJECT_WRITES_UNAVAILABLE}>
            Новый проект
          </Button>
        }
      />

      <p className={styles.notice} id="projects-writes-note">
        <FlaskConical size={16} aria-hidden />
        <span>Проекты — тестовые данные Web API v2: те же, что на Обзоре и в AI Workspace. {PROJECT_WRITES_UNAVAILABLE}</span>
      </p>

      <div className={styles.toolbar}>
        <SearchField
          label="Поиск по проектам"
          placeholder="Название, сфера или описание"
          value={filter.query}
          onValueChange={(query) => setFilter((f) => ({ ...f, query }))}
          wrapperClassName={styles.search}
        />
        <SegmentedControl<ProjectStatusFilter>
          legend="Статус проекта"
          value={filter.status}
          onChange={(value) => setFilter((f) => ({ ...f, status: value }))}
          options={[
            { value: "all", label: "Все", count: counts.all },
            { value: "active", label: "Активные", count: counts.active },
            { value: "draft", label: "Черновики", count: counts.draft },
            { value: "archived", label: "Архив", count: counts.archived },
          ]}
        />
        <div className={styles.toolbarEnd}>
          <Select
            aria-label="Сортировка"
            value={filter.sort}
            onChange={(e) => setFilter((f) => ({ ...f, sort: e.target.value as ProjectSort }))}
            wrapperClassName={styles.sort}
          >
            <option value="recent">Недавно обновлённые</option>
            <option value="name">По названию</option>
          </Select>
          <SegmentedControl<View>
            legend="Вид списка"
            value={view}
            onChange={setView}
            className={styles.viewToggle}
            options={[
              { value: "grid", label: <LayoutGrid size={16} aria-hidden />, ariaLabel: "Карточки" },
              { value: "list", label: <List size={16} aria-hidden />, ariaLabel: "Таблица" },
            ]}
          />
        </div>
      </div>

      {status === "loading" && (
        <LoadingRegion label="Загрузка проектов" className={styles.grid}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={styles.card}>
              <Skeleton width={52} height={52} radius={12} />
              <Skeleton width="60%" height={16} style={{ marginTop: 18 }} />
              <Skeleton width="40%" height={12} style={{ marginTop: 8 }} />
              <Skeleton height={12} style={{ marginTop: 18 }} />
              <Skeleton width="80%" height={12} style={{ marginTop: 8 }} />
            </div>
          ))}
        </LoadingRegion>
      )}

      {status === "error" && (
        <div className={styles.panel}>
          <ErrorState onRetry={retry} title="Не удалось загрузить проекты" />
        </div>
      )}

      {status === "ready" && projects.length === 0 && (
        <div className={styles.panel}>
          <EmptyState
            icon={FolderSearch}
            title="Проектов пока нет"
            description="В тестовых данных Web API v2 нет доступных вам проектов. Создание проектов появится вместе с подключением Web API."
          />
        </div>
      )}

      {status === "ready" && projects.length > 0 && visible.length === 0 && (
        <div className={styles.panel}>
          <EmptyState
            icon={SearchX}
            title="Ничего не найдено"
            description={filter.query ? `По запросу «${filter.query.trim()}» проектов нет.` : "В этом статусе пока нет проектов."}
            action={filtersActive && <Button onClick={() => setFilter(defaultProjectFilter)}>Сбросить фильтры</Button>}
          />
        </div>
      )}

      {status === "ready" && visible.length > 0 && view === "grid" && (
        <ul className={styles.grid}>
          {visible.map((p) => (
            <li key={p.id}>
              <ProjectCard project={p} stats={statsFor(p.id)} now={now} />
            </li>
          ))}
        </ul>
      )}

      {status === "ready" && visible.length > 0 && view === "list" && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">Проекты</caption>
            <thead>
              <tr>
                <th scope="col">Бренд</th>
                <th scope="col">Статус</th>
                <th scope="col">Контекст</th>
                <th scope="col">Диалоги</th>
                <th scope="col">Роль</th>
                <th scope="col">Обновлён</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const stats = statsFor(p.id);
                const percent = contextCompleteness(p).percent;
                return (
                  <tr key={p.id}>
                    <th scope="row">
                      <div className={styles.rowBrand}>
                        <Monogram name={p.name} color={p.color} size="sm" />
                        <div className={styles.rowBrandText}>
                          <Link href={`/projects/${encodeURIComponent(p.id)}`} className={styles.rowLink} title={p.name}>
                            {p.name}
                          </Link>
                          <span>{p.industry}</span>
                        </div>
                      </div>
                    </th>
                    <td data-label="Статус">
                      <Badge tone={statusTone[p.status]} size="sm">
                        {projectStatusLabel[p.status]}
                      </Badge>
                    </td>
                    <td data-label="Контекст" className="tabular">
                      <span className={cx(styles.percent, percent < 60 && styles.percentLow)}>{percent}%</span>
                    </td>
                    <td data-label="Диалоги" className="tabular">
                      {stats.threads}
                    </td>
                    <td data-label="Роль">{stats.roleLabel}</td>
                    <td data-label="Обновлён">{now ? formatRelative(p.updatedAt, now) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

    </Page>
  );
}
