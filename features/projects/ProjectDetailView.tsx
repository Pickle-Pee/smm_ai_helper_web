"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, FlaskConical, FolderSearch, Info, MessagesSquare, Pencil, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader, Meter } from "@/components/ui/Card";
import { Monogram } from "@/components/ui/Monogram";
import { Page } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from "@/components/ui/States";
import { TabPanel, Tabs, useTabsId } from "@/components/ui/Tabs";
import { useWorkspace } from "@/features/workspace/store";
import { scenarioPrompt, scenarios } from "@/features/workspace/scenarios";
import { REQUEST_STATE_TEXT } from "@/features/workspace/components/ThreadList";
import { ThreadKindIcon } from "@/features/workspace/components/ResultBadges";
import { PROJECT_ROLE_LABEL, type BrandContextView, type WorkspaceProjectView } from "@/lib/api/v2/presenters";
import { formatDate, formatRelative, quoted } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { Project, ScenarioId } from "@/lib/types";
import { useProjectContext, useProjectDetail } from "./context";
import { useLegacyDemoProjects } from "./store";
import { contextCompleteness, projectStatusLabel } from "./model";
import { PROJECT_WRITES_UNAVAILABLE } from "./copy";
import { statusTone } from "./components/ProjectCard";
import styles from "./Projects.module.css";

type Tab = "overview" | "threads" | "documents";

/**
 * Project page (F3): `getProject` + `getProjectBrand` from the unified Web API v2 project context. The id in the URL
 * is used as is — an unknown, foreign or legacy demo id is a «not found» page, never another project.
 */
export function ProjectDetailView({ projectId }: { projectId: string }) {
  const { detail, retry } = useProjectDetail(projectId);
  const { byId: legacyProjects } = useLegacyDemoProjects();
  const { selectProject } = useProjectContext();
  const resolved = detail.status === "ready";

  // Opening a project makes it the session's brand: Dashboard Briefing and a new Workspace conversation use it.
  useEffect(() => {
    if (resolved) selectProject(projectId);
  }, [resolved, projectId, selectProject]);

  if (detail.status === "loading") {
    return (
      <Page>
        <LoadingRegion label="Загрузка проекта">
          <div className={styles.detailHeader}>
            <Skeleton width={64} height={64} radius={16} />
            <div style={{ flex: 1 }}>
              <Skeleton width={140} height={12} />
              <Skeleton width="40%" height={26} style={{ marginTop: 10 }} />
            </div>
          </div>
          <Skeleton height={42} style={{ marginTop: 28 }} />
          <Skeleton height={320} radius={12} style={{ marginTop: 24 }} />
        </LoadingRegion>
      </Page>
    );
  }

  if (detail.status === "error") {
    return (
      <Page>
        <BackLink />
        <div className={styles.panel}>
          <ErrorState onRetry={retry} title="Не удалось загрузить проект" description="Тестовые данные временно недоступны. Попробуйте ещё раз." />
        </div>
      </Page>
    );
  }

  if (detail.status === "not_found" || !detail.project) {
    const legacy = legacyProjects.get(projectId);
    return (
      <Page>
        <BackLink />
        <div className={styles.panel}>
          <EmptyState
            icon={FolderSearch}
            title={legacy ? "Этот проект из старого демо-набора" : "Проект не найден"}
            description={
              legacy
                ? `${quoted(legacy.name)} есть только в демо-наборе раздела «Документы». Проекты, Обзор и AI Workspace работают с тестовыми данными Web API v2, где такого проекта нет.`
                : "В тестовых данных Web API v2 нет такого проекта или у вас нет к нему доступа. Возможно, ссылка устарела."
            }
            action={
              <ButtonLink href="/projects" variant="primary">
                К списку проектов
              </ButtonLink>
            }
          />
        </div>
      </Page>
    );
  }

  return <ProjectDetail view={detail.project} brand={detail.brand} brandError={detail.brandError} />;
}

function BackLink() {
  return (
    <Link href="/projects" className={styles.backLink}>
      <ArrowLeft size={16} aria-hidden /> Все проекты
    </Link>
  );
}

/** The UI project with the brand fields of `getProjectBrand` (fresher than the copy embedded in `Project`). */
function withBrand(project: Project, brand: BrandContextView | null): Project {
  if (!brand) return project;
  return {
    ...project,
    industry: brand.industry || project.industry,
    description: brand.description,
    audience: brand.audience,
    usp: brand.usp,
    toneOfVoice: brand.tone,
    goals: brand.goals.join("; "),
    competitors: brand.competitors,
    channels: brand.channels,
  };
}

function ProjectDetail({ view, brand, brandError }: { view: WorkspaceProjectView; brand: BrandContextView | null; brandError: boolean }) {
  const router = useRouter();
  const now = useNow();
  const { prepareDraft } = useWorkspace();
  const { threadsFor, attentionOf } = useProjectContext();
  const tabsId = useTabsId();
  const [tab, setTab] = useState<Tab>("overview");

  const project = useMemo(() => withBrand(view.project, brand), [view.project, brand]);
  const projectThreads = threadsFor(project.id);
  const { percent, missing } = contextCompleteness(project);
  const workspaceHref = `/workspace?new=1&project=${encodeURIComponent(project.id)}`;
  const editNoteId = "project-writes-note";

  /** Opens a NEW conversation of exactly this project. A scenario only pre-fills the composer: nothing is sent. */
  function ask(scenarioId: ScenarioId | null) {
    const scenario = scenarios.find((s) => s.id === scenarioId);
    if (scenario) {
      prepareDraft({
        projectId: project.id,
        scenarioId: scenario.id,
        text: scenarioPrompt(scenario, project.name),
        origin: { label: project.name, href: `/projects/${encodeURIComponent(project.id)}` },
      });
    }
    router.push(workspaceHref);
  }

  const contextRows: { label: string; value: string }[] = [
    { label: "Описание продукта", value: project.description },
    { label: "Целевая аудитория", value: project.audience },
    { label: "УТП", value: project.usp },
    { label: "Tone of voice", value: project.toneOfVoice },
    { label: "Цели", value: project.goals },
    { label: "География", value: brand?.geography ?? "" },
  ];

  return (
    <Page>
      <BackLink />
      <header className={styles.detailHeader}>
        <Monogram name={project.name} color={project.color} size="xl" />
        <div className={styles.detailHeading}>
          <div className={styles.detailEyebrow}>
            <span>{project.industry}</span>
            <Badge tone={statusTone[project.status]} size="sm" dot={project.status === "active"}>
              {projectStatusLabel[project.status]}
            </Badge>
            <Badge tone={view.canSubmit ? "outline" : "warning"} size="sm" className={styles.roleBadge}>
              {PROJECT_ROLE_LABEL[view.role]}
              {view.canSubmit ? "" : " · только просмотр"}
            </Badge>
          </div>
          <h1 className={styles.detailTitle}>{project.name}</h1>
          <p className={styles.detailMeta}>
            Создан {formatDate(project.createdAt)} · <FlaskConical size={12} aria-hidden /> тестовые данные Web API v2
          </p>
        </div>
        <div className={styles.detailActions}>
          <Button icon={Pencil} disabled aria-describedby={editNoteId} title={PROJECT_WRITES_UNAVAILABLE}>
            Редактировать контекст
          </Button>
          <Button variant="ai" icon={Sparkles} onClick={() => ask(null)}>
            Открыть в AI Workspace
          </Button>
        </div>
      </header>

      <p className={styles.notice} id={editNoteId}>
        <Info size={16} aria-hidden />
        <span>
          {view.canSubmit
            ? PROJECT_WRITES_UNAVAILABLE
            : `Ваша роль в проекте — ${PROJECT_ROLE_LABEL[view.role].toLocaleLowerCase("ru")}: можно смотреть контекст и диалоги, но не отправлять запросы. ${PROJECT_WRITES_UNAVAILABLE}`}
        </span>
      </p>

      <Tabs
        label="Разделы проекта"
        idBase={tabsId}
        value={tab}
        onChange={setTab}
        items={[
          { id: "overview", label: "Контекст" },
          { id: "threads", label: "Copilot-диалоги", count: projectThreads.length },
          { id: "documents", label: "Документы" },
        ]}
      />

      {tab === "overview" && (
        <TabPanel idBase={tabsId} tab="overview" className={styles.overview}>
          <Card aria-labelledby="ctx-title">
            <CardHeader id="ctx-title" title="Бизнес-контекст" description="Контекст бренда, который Copilot получает вместе с запросом" />
            {brandError && (
              <p className={`${styles.notice} ${styles.noticeInline}`} role="status">
                <Info size={16} aria-hidden />
                <span>Контекст бренда не удалось перечитать — показана копия из карточки проекта.</span>
              </p>
            )}
            <dl className={styles.contextList}>
              {contextRows.map((row) => (
                <div key={row.label} className={styles.contextRow}>
                  <dt>{row.label}</dt>
                  <dd>{row.value || <span className={styles.muted}>Не заполнено</span>}</dd>
                </div>
              ))}
              {brand && (
                <div className={styles.contextRow}>
                  <dt>Источник</dt>
                  <dd className={styles.muted}>
                    {brand.importedFrom ? `Скопирован из: ${brand.importedFrom.label}, ${formatDate(brand.importedFrom.at)}. ` : ""}
                    Обновлён {formatDate(brand.updatedAt)}
                    {brand.updatedBy ? ` · ${brand.updatedBy}` : ""}
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          <div className={styles.sideColumn}>
            <Card padded>
              <Meter
                value={percent}
                label="Полнота контекста"
                hint={missing.length ? `Не заполнено: ${missing.join(", ").toLocaleLowerCase("ru")}.` : "Всё заполнено — Copilot получает полный контекст."}
              />
            </Card>
            <Card aria-labelledby="competitors-title">
              <CardHeader id="competitors-title" title="Конкуренты" plain headingLevel={2} />
              <div className={styles.chipBlock}>
                {project.competitors.length ? (
                  <ul className={styles.chipList}>
                    {project.competitors.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.muted}>Не указаны</p>
                )}
              </div>
            </Card>
            <Card aria-labelledby="channels-title">
              <CardHeader id="channels-title" title="Каналы продвижения" plain />
              <div className={styles.chipBlock}>
                {project.channels.length ? (
                  <ul className={styles.chipList}>
                    {project.channels.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.muted}>Не указаны</p>
                )}
              </div>
            </Card>
            <Card aria-labelledby="quick-title">
              <CardHeader id="quick-title" title="Быстрый старт" plain />
              <ul className={styles.quickList}>
                {scenarios.slice(0, 4).map((s) => {
                  const Icon = s.icon;
                  return (
                    <li key={s.id}>
                      <button type="button" className={styles.quickItem} onClick={() => ask(s.id)}>
                        <span className={styles.quickIcon} aria-hidden>
                          <Icon size={15} />
                        </span>
                        {s.title}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
        </TabPanel>
      )}

      {tab === "threads" && (
        <TabPanel idBase={tabsId} tab="threads">
          <Card>
            {projectThreads.length === 0 ? (
              <EmptyState
                icon={MessagesSquare}
                title="Диалогов пока нет"
                description="Copilot-диалоги этого бренда появятся здесь."
                action={
                  <Button variant="ai" icon={Sparkles} onClick={() => ask(null)}>
                    Первый запрос
                  </Button>
                }
              />
            ) : (
              <ul className={styles.threadList} aria-label={`Copilot-диалоги проекта ${project.name}`}>
                {projectThreads.map((t) => {
                  const attention = attentionOf(t);
                  return (
                    <li key={t.id} className={styles.threadRow}>
                      <ThreadKindIcon size="sm" />
                      <div className={styles.threadText}>
                        <Link href={`/workspace?thread=${encodeURIComponent(t.id)}`} className={styles.threadTitle} title={t.title}>
                          {t.title}
                        </Link>
                        <p className={styles.threadMeta}>
                          Copilot · обновлён {now ? formatRelative(t.updatedAt, now) : formatDate(t.updatedAt)}
                        </p>
                      </div>
                      {attention && (
                        <Badge tone={attention === "unresolved" ? "warning" : "info"} size="sm" data-request-state={attention}>
                          {REQUEST_STATE_TEXT[attention]}
                        </Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </TabPanel>
      )}

      {tab === "documents" && (
        <TabPanel idBase={tabsId} tab="documents">
          <Card>
            <EmptyState
              icon={FileText}
              title="Документы пока не связаны с проектами"
              description="Раздел «Документы» — отдельный демо-набор со своими брендами. Связь файлов с проектами Web API v2 появится после подключения хранилища и авторизации."
              action={
                <ButtonLink href="/documents" variant="secondary">
                  Открыть демо-документы
                </ButtonLink>
              }
            />
          </Card>
        </TabPanel>
      )}
    </Page>
  );
}
