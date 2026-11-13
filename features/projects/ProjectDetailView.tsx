"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, FolderSearch, History, MessagesSquare, Pencil, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader, Meter } from "@/components/ui/Card";
import { Monogram } from "@/components/ui/Monogram";
import { Page } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from "@/components/ui/States";
import { TabPanel, Tabs, useTabsId } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { useWorkspace } from "@/features/workspace/store";
import { scenarioPrompt, scenarios } from "@/features/workspace/scenarios";
import { resultStatusLabel } from "@/features/workspace/model";
import { ResultKindIcon } from "@/features/workspace/components/ResultBadges";
import { useDocuments } from "@/features/documents/store";
import { FileIcon } from "@/features/documents/components/FileVisual";
import { kindLabel } from "@/features/documents/model";
import { formatDate, formatFileSize, formatRelative } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { Project, ScenarioId } from "@/lib/types";
import { useProjects } from "./store";
import { contextCompleteness, projectStatusLabel } from "./model";
import { statusTone } from "./components/ProjectCard";
import { ProjectFormDialog } from "./components/ProjectFormDialog";
import styles from "./Projects.module.css";

type Tab = "overview" | "history" | "documents";

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const { status, byId, retry } = useProjects();
  const project = byId.get(projectId);

  if (status === "loading") {
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

  if (status === "error") {
    return (
      <Page>
        <BackLink />
        <div className={styles.panel}>
          <ErrorState onRetry={retry} title="Не удалось загрузить проект" />
        </div>
      </Page>
    );
  }

  if (!project) {
    return (
      <Page>
        <BackLink />
        <div className={styles.panel}>
          <EmptyState
            icon={FolderSearch}
            title="Проект не найден"
            description="Возможно, ссылка устарела. В демо-версии созданные проекты хранятся только до перезагрузки страницы."
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

  return <ProjectDetail project={project} />;
}

function BackLink() {
  return (
    <Link href="/projects" className={styles.backLink}>
      <ArrowLeft size={16} aria-hidden /> Все проекты
    </Link>
  );
}

function ProjectDetail({ project }: { project: Project }) {
  const router = useRouter();
  const now = useNow();
  const { notify } = useToast();
  const { updateProject } = useProjects();
  const { threads, prepareDraft } = useWorkspace();
  const { documents } = useDocuments();
  const tabsId = useTabsId();
  const [tab, setTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);

  const projectThreads = useMemo(() => threads.filter((t) => t.projectId === project.id), [threads, project.id]);
  const projectDocs = useMemo(
    () => documents.filter((d) => d.projectId === project.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [documents, project.id],
  );
  const { percent, missing } = contextCompleteness(project);

  function ask(scenarioId: ScenarioId | null) {
    const scenario = scenarios.find((s) => s.id === scenarioId);
    prepareDraft({ projectId: project.id, scenarioId, text: scenario ? scenarioPrompt(scenario, project.name) : "" });
    router.push("/workspace?new=1");
  }

  const events = useMemo(() => {
    const list: { id: string; at: string; icon: "thread" | "result" | "doc"; title: string; detail: string; href: string; kind?: ScenarioId }[] = [];
    for (const t of projectThreads) {
      list.push({ id: `t-${t.id}`, at: t.createdAt, icon: "thread", title: `Начат диалог «${t.title}»`, detail: "AI Workspace", href: `/workspace?thread=${t.id}` });
      for (const m of t.messages) {
        if (m.result)
          list.push({
            id: `r-${m.id}`,
            at: m.createdAt,
            icon: "result",
            kind: m.result.kind,
            title: m.result.title,
            detail: `AI-результат · ${resultStatusLabel[m.result.status]}`,
            href: `/workspace?thread=${t.id}`,
          });
      }
    }
    for (const d of projectDocs) {
      list.push({ id: `d-${d.id}`, at: d.updatedAt, icon: "doc", title: d.name, detail: `${kindLabel[d.kind]} · обновлён`, href: `/documents?doc=${d.id}` });
    }
    return list.sort((a, b) => b.at.localeCompare(a.at));
  }, [projectThreads, projectDocs]);

  const contextRows: { label: string; value: string }[] = [
    { label: "Описание продукта", value: project.description },
    { label: "Целевая аудитория", value: project.audience },
    { label: "УТП", value: project.usp },
    { label: "Tone of voice", value: project.toneOfVoice },
    { label: "Цели", value: project.goals },
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
          </div>
          <h1 className={styles.detailTitle}>{project.name}</h1>
          <p className={styles.detailMeta}>Создан {formatDate(project.createdAt)}</p>
        </div>
        <div className={styles.detailActions}>
          <Button icon={Pencil} onClick={() => setEditOpen(true)}>
            Редактировать контекст
          </Button>
          <Button variant="ai" icon={Sparkles} onClick={() => ask(null)}>
            Запрос по бренду
          </Button>
        </div>
      </header>

      <Tabs
        label="Разделы проекта"
        idBase={tabsId}
        value={tab}
        onChange={setTab}
        items={[
          { id: "overview", label: "Контекст" },
          { id: "history", label: "История работы", count: events.length },
          { id: "documents", label: "Документы", count: projectDocs.length },
        ]}
      />

      {tab === "overview" && (
        <TabPanel idBase={tabsId} tab="overview" className={styles.overview}>
          <Card aria-labelledby="ctx-title">
            <CardHeader
              id="ctx-title"
              title="Бизнес-контекст"
              description="Эти данные AI подставляет в каждый запрос по бренду"
              action={
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditOpen(true)}>
                  Изменить
                </Button>
              }
            />
            <dl className={styles.contextList}>
              {contextRows.map((row) => (
                <div key={row.label} className={styles.contextRow}>
                  <dt>{row.label}</dt>
                  <dd>
                    {row.value || (
                      <button type="button" className={styles.fillLink} onClick={() => setEditOpen(true)}>
                        Не заполнено — добавить
                      </button>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          <div className={styles.sideColumn}>
            <Card padded>
              <Meter
                value={percent}
                label="Полнота контекста"
                hint={missing.length ? `Добавьте: ${missing.join(", ").toLocaleLowerCase("ru")}.` : "Всё заполнено — AI получает полный контекст."}
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

      {tab === "history" && (
        <TabPanel idBase={tabsId} tab="history">
          <Card>
            {events.length === 0 ? (
              <EmptyState
                icon={History}
                title="История пока пуста"
                description="Здесь появятся диалоги, AI-результаты и документы этого бренда."
                action={
                  <Button variant="ai" icon={Sparkles} onClick={() => ask(null)}>
                    Первый запрос
                  </Button>
                }
              />
            ) : (
              <ol className={styles.timeline}>
                {events.map((e) => (
                  <li key={e.id} className={styles.timelineItem}>
                    <span className={styles.timelineIcon}>
                      {e.icon === "result" && e.kind ? (
                        <ResultKindIcon kind={e.kind} size="sm" />
                      ) : (
                        <span className={styles.timelineGlyph} aria-hidden>
                          {e.icon === "thread" ? <MessagesSquare size={15} /> : <FileText size={15} />}
                        </span>
                      )}
                    </span>
                    <div className={styles.timelineText}>
                      <Link href={e.href} className={styles.timelineTitle}>
                        {e.title}
                      </Link>
                      <p className={styles.timelineDetail}>{e.detail}</p>
                    </div>
                    <time className={styles.timelineTime} dateTime={e.at}>
                      {now ? formatRelative(e.at, now) : ""}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </TabPanel>
      )}

      {tab === "documents" && (
        <TabPanel idBase={tabsId} tab="documents">
          <Card>
            {projectDocs.length === 0 ? (
              <EmptyState icon={FileText} title="Документов нет" description="Таблицы, стратегии и презентации бренда появятся здесь." />
            ) : (
              <ul className={styles.docList}>
                {projectDocs.map((d) => (
                  <li key={d.id}>
                    <Link href={`/documents?doc=${d.id}`} className={styles.docRow}>
                      <FileIcon kind={d.kind} />
                      <span className={styles.docText}>
                        <span className={styles.docName} title={d.name}>
                          {d.name}
                        </span>
                        <span className={styles.docMeta}>
                          {kindLabel[d.kind]} · {formatFileSize(d.sizeKb)}
                        </span>
                      </span>
                      <span className={styles.docTime}>{now ? formatRelative(d.updatedAt, now) : ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabPanel>
      )}

      <ProjectFormDialog
        open={editOpen}
        mode="edit"
        project={project}
        onClose={() => setEditOpen(false)}
        onSubmit={(values) => {
          updateProject(project.id, values);
          setEditOpen(false);
          notify({ title: "Контекст бренда обновлён", description: "Изменения сохранены только в этой вкладке." });
        }}
      />
    </Page>
  );
}
