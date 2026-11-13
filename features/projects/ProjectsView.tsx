"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderPlus, LayoutGrid, List, Plus, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SearchField, Select } from "@/components/ui/Form";
import { Monogram } from "@/components/ui/Monogram";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { useWorkspace } from "@/features/workspace/store";
import { countThreadsByProject } from "@/features/workspace/model";
import { useDocuments } from "@/features/documents/store";
import { formatRelative, quoted } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { cx } from "@/lib/cx";
import { useProjects } from "./store";
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
import { ProjectFormDialog } from "./components/ProjectFormDialog";
import styles from "./Projects.module.css";

type View = "grid" | "list";

export function ProjectsView() {
  const router = useRouter();
  const params = useSearchParams();
  const now = useNow();
  const { notify } = useToast();
  const { projects, status, retry, createProject } = useProjects();
  const { threads } = useWorkspace();
  const { documents } = useDocuments();
  const [filter, setFilter] = useState<ProjectFilter>(defaultProjectFilter);
  const [view, setView] = useState<View>("grid");
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (params.get("create") === "1") {
      setCreateOpen(true);
      router.replace("/projects", { scroll: false });
    }
  }, [params, router]);

  const counts = useMemo(() => countByStatus(projects), [projects]);
  const visible = useMemo(() => filterProjects(projects, filter), [projects, filter]);
  const threadCounts = useMemo(() => countThreadsByProject(threads), [threads]);
  const statsFor = (id: string) => ({
    threads: threadCounts.get(id) ?? 0,
    documents: documents.filter((d) => d.projectId === id).length,
  });
  const filtersActive = filter.query.trim() !== "" || filter.status !== "all";

  return (
    <Page>
      <PageHeader
        title="Проекты и бренды"
        description="Бизнес-контекст каждого бренда: продукт, аудитория, конкуренты и каналы. AI учитывает его в запросах."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreateOpen(true)} disabled={status !== "ready"}>
            Новый проект
          </Button>
        }
      />

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
            icon={FolderPlus}
            title="Создайте первый проект"
            description="Проект хранит контекст бренда — описание продукта, аудиторию, конкурентов. С ним ответы AI становятся точнее."
            action={
              <Button variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
                Новый проект
              </Button>
            }
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
                <th scope="col">Файлы</th>
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
                          <Link href={`/projects/${p.id}`} className={styles.rowLink} title={p.name}>
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
                    <td data-label="Файлы" className="tabular">
                      {stats.documents}
                    </td>
                    <td data-label="Обновлён">{now ? formatRelative(p.updatedAt, now) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ProjectFormDialog
        open={createOpen}
        mode="create"
        onClose={() => setCreateOpen(false)}
        onSubmit={(values) => {
          const project = createProject(values);
          setCreateOpen(false);
          notify({ title: `Проект ${quoted(project.name)} создан`, description: "Сохранён только в этой вкладке до перезагрузки страницы." });
          router.push(`/projects/${project.id}`);
        }}
      />
    </Page>
  );
}
