"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, FileText, FlaskConical, FolderSearch, Inbox, MessagesSquare, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Monogram, BrandDot } from "@/components/ui/Monogram";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from "@/components/ui/States";
import { Page } from "@/components/ui/PageHeader";
import { useProjectContext } from "@/features/projects/context";
import { contextCompleteness } from "@/features/projects/model";
import { REQUEST_STATE_TEXT } from "@/features/workspace/components/ThreadList";
import { ThreadKindIcon } from "@/features/workspace/components/ResultBadges";
import { useDocuments } from "@/features/documents/store";
import { FileIcon } from "@/features/documents/components/FileVisual";
import { kindLabel } from "@/features/documents/model";
import { PROJECT_ROLE_LABEL } from "@/lib/api/v2/presenters";
import { countLabel, formatRelative } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { Briefing } from "./Briefing";
import styles from "./Dashboard.module.css";

/**
 * Dashboard (F3). Brands and Copilot threads come from the unified Web API v2 project context — the same project
 * and thread ids the AI Workspace uses. Documents are the separate legacy demo dataset and are labelled as such.
 * Nothing here shows metrics the contract does not provide (no result approval queue, no document counts per
 * project).
 */
export function DashboardView() {
  return (
    <Page wide>
      <Briefing />
      <div className={styles.grid}>
        <ProjectsPanel />
        <ThreadsPanel />
        <DocumentsPanel />
      </div>
    </Page>
  );
}

function ProjectsPanel() {
  const now = useNow();
  const { projects, status, retry, threadsFor } = useProjectContext();
  const visible = projects
    .filter((p) => p.project.status !== "archived")
    .sort((a, b) => b.project.updatedAt.localeCompare(a.project.updatedAt))
    .slice(0, 3);

  return (
    <Card className={styles.projects} aria-labelledby="dash-projects">
      <CardHeader
        id="dash-projects"
        title="Бренды в работе"
        description="Контекст брендов, который Copilot учитывает в запросах · тестовые данные Web API v2"
        action={
          <ButtonLink href="/projects" variant="ghost" size="sm" iconRight={ArrowRight}>
            Все проекты
          </ButtonLink>
        }
      />
      {status === "loading" && (
        <LoadingRegion label="Загрузка проектов" className={styles.projectGrid}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.projectTile}>
              <Skeleton width={40} height={40} radius={10} />
              <Skeleton width="70%" height={14} style={{ marginTop: 14 }} />
              <Skeleton width="50%" height={11} style={{ marginTop: 8 }} />
              <Skeleton height={6} style={{ marginTop: 22 }} />
            </div>
          ))}
        </LoadingRegion>
      )}
      {status === "error" && <ErrorState compact onRetry={retry} />}
      {status === "ready" && visible.length === 0 && (
        <EmptyState
          compact
          icon={FolderSearch}
          title="Проектов пока нет"
          description="В тестовых данных Web API v2 нет доступных вам проектов. Создание проектов появится вместе с подключением Web API."
        />
      )}
      {status === "ready" && visible.length > 0 && (
        <ul className={styles.projectGrid}>
          {visible.map(({ project: p, role }) => {
            const completeness = contextCompleteness(p).percent;
            return (
              <li key={p.id} className={styles.projectTile}>
                <div className={styles.projectTileTop}>
                  <Monogram name={p.name} color={p.color} />
                  <span className={styles.projectUpdated}>{now ? formatRelative(p.updatedAt, now) : ""}</span>
                </div>
                <Link href={`/projects/${encodeURIComponent(p.id)}`} className={styles.projectTileLink}>
                  {p.name}
                </Link>
                <p className={styles.projectIndustry}>{p.industry}</p>
                <div className={styles.projectStats}>
                  <span>
                    <MessagesSquare size={14} aria-hidden /> {countLabel(threadsFor(p.id).length, ["диалог", "диалога", "диалогов"])}
                  </span>
                  <span>
                    <UserRound size={14} aria-hidden /> {PROJECT_ROLE_LABEL[role]}
                  </span>
                </div>
                <div className={styles.miniMeter}>
                  <span className={styles.miniMeterLabel}>Контекст</span>
                  <span className={styles.miniMeterTrack} aria-hidden>
                    <span style={{ width: `${completeness}%` }} data-low={completeness < 60 || undefined} />
                  </span>
                  <span className={styles.miniMeterValue}>{completeness}%</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

type ThreadsFilter = "brand" | "all";

/**
 * Recent Copilot threads (Web API v2 thread summaries). Results themselves are opened in the thread: the contract
 * has no cross-thread result feed or review status, so none is invented here.
 */
function ThreadsPanel() {
  const now = useNow();
  const { threads, status, retry, byId, selectedProject, attentionOf } = useProjectContext();
  const [filter, setFilter] = useState<ThreadsFilter>("brand");
  const brandThreads = useMemo(() => (selectedProject ? threads.filter((t) => t.projectId === selectedProject.project.id) : []), [threads, selectedProject]);
  const effective: ThreadsFilter = selectedProject ? filter : "all";
  const visible = (effective === "brand" ? brandThreads : threads).slice(0, 5);

  return (
    <Card className={styles.results} aria-labelledby="dash-results">
      <CardHeader
        id="dash-results"
        title="Copilot-диалоги"
        description={
          effective === "brand" && selectedProject
            ? `Последние запросы бренда ${selectedProject.project.name}. Результаты открываются в диалоге`
            : "Последние запросы по всем брендам. Результаты открываются в диалоге"
        }
        action={
          selectedProject ? (
            <SegmentedControl
              legend="Какие диалоги показать"
              size="sm"
              value={effective}
              onChange={setFilter}
              options={[
                { value: "brand", label: "Бренд", ariaLabel: `Бренд ${selectedProject.project.name}`, count: brandThreads.length },
                { value: "all", label: "Все", count: threads.length },
              ]}
            />
          ) : undefined
        }
      />
      {status === "loading" && (
        <LoadingRegion label="Загрузка диалогов">
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.resultRow}>
              <Skeleton width={36} height={36} radius={10} />
              <div style={{ flex: 1 }}>
                <Skeleton width="60%" height={13} />
                <Skeleton width="35%" height={11} style={{ marginTop: 8 }} />
              </div>
            </div>
          ))}
        </LoadingRegion>
      )}
      {status === "error" && <ErrorState compact onRetry={retry} />}
      {status === "ready" && visible.length === 0 && (
        <EmptyState
          compact
          tone="ai"
          icon={Inbox}
          title="Диалогов пока нет"
          description="Опишите задачу выше или откройте AI Workspace — Copilot-диалоги этого бренда появятся здесь."
          action={
            <ButtonLink href={selectedProject ? `/workspace?new=1&project=${encodeURIComponent(selectedProject.project.id)}` : "/workspace?new=1"} size="sm">
              Открыть AI Workspace
            </ButtonLink>
          }
        />
      )}
      {status === "ready" && visible.length > 0 && (
        <ul className={styles.resultList}>
          {visible.map((t) => {
            const project = byId.get(t.projectId)?.project;
            const attention = attentionOf(t);
            return (
              <li key={t.id} className={styles.resultRow}>
                <ThreadKindIcon />
                <div className={styles.resultText}>
                  <Link href={`/workspace?thread=${encodeURIComponent(t.id)}`} className={styles.resultTitle}>
                    {t.title}
                  </Link>
                  <p className={styles.resultMeta}>
                    {project && (
                      <span className={styles.resultBrand}>
                        <BrandDot color={project.color} /> {project.name}
                      </span>
                    )}
                    <span>Copilot</span>
                    {now && <span>{formatRelative(t.updatedAt, now)}</span>}
                  </p>
                </div>
                {attention && (
                  <div className={styles.resultActions}>
                    <Badge tone={attention === "unresolved" ? "warning" : "info"} size="sm" data-request-state={attention}>
                      {REQUEST_STATE_TEXT[attention]}
                    </Badge>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Legacy demo documents: a separate dataset, not linked to Web API v2 projects (Documents integration is later). */
function DocumentsPanel() {
  const now = useNow();
  const { documents, status, retry } = useDocuments();
  const recent = [...documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);

  return (
    <Card className={styles.documents} aria-labelledby="dash-docs">
      <CardHeader
        id="dash-docs"
        title="Недавние документы"
        description="Отдельный демо-набор: файлы пока не связаны с проектами"
        action={
          <ButtonLink href="/documents" variant="ghost" size="sm" iconRight={ArrowRight}>
            Все файлы
          </ButtonLink>
        }
      />
      {status === "loading" && (
        <LoadingRegion label="Загрузка документов">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={styles.docRow}>
              <Skeleton width={30} height={30} radius={8} />
              <div style={{ flex: 1 }}>
                <Skeleton width="80%" height={12} />
                <Skeleton width="40%" height={10} style={{ marginTop: 7 }} />
              </div>
            </div>
          ))}
        </LoadingRegion>
      )}
      {status === "error" && <ErrorState compact onRetry={retry} />}
      {status === "ready" && recent.length === 0 && (
        <EmptyState compact icon={FileText} title="Документов пока нет" description="Здесь появятся таблицы, стратегии и презентации ваших брендов." />
      )}
      {status === "ready" && recent.length > 0 && (
        <ul className={styles.docList}>
          {recent.map((d) => (
            <li key={d.id}>
              <Link href={`/documents?doc=${d.id}`} className={styles.docRow}>
                <FileIcon kind={d.kind} size="sm" />
                <span className={styles.docText}>
                  <span className={styles.docName} title={d.name}>
                    {d.name}
                  </span>
                  <span className={styles.docMeta}>
                    {kindLabel[d.kind]} · <FlaskConical size={11} aria-hidden /> демо
                  </span>
                </span>
                <span className={styles.docTime}>{now ? formatRelative(d.updatedAt, now) : ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
