"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Check, FileText, FolderPlus, Inbox, ListChecks, MessagesSquare } from "lucide-react";
import { ButtonLink, Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Monogram, BrandDot } from "@/components/ui/Monogram";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from "@/components/ui/States";
import { Page } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { useProjects } from "@/features/projects/store";
import { contextCompleteness } from "@/features/projects/model";
import { useWorkspace } from "@/features/workspace/store";
import { countThreadsByProject, selectResults } from "@/features/workspace/model";
import { ResultKindIcon, ResultStatusBadge, scenarioTitle } from "@/features/workspace/components/ResultBadges";
import { useDocuments } from "@/features/documents/store";
import { FileIcon } from "@/features/documents/components/FileVisual";
import { kindLabel } from "@/features/documents/model";
import { countLabel, formatRelative } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { Briefing } from "./Briefing";
import styles from "./Dashboard.module.css";

export function DashboardView() {
  return (
    <Page wide>
      <Briefing />
      <div className={styles.grid}>
        <ProjectsPanel />
        <ResultsPanel />
        <DocumentsPanel />
      </div>
    </Page>
  );
}

function ProjectsPanel() {
  const now = useNow();
  const { projects, status, retry } = useProjects();
  const { threads } = useWorkspace();
  const { documents } = useDocuments();
  const threadCounts = useMemo(() => countThreadsByProject(threads), [threads]);
  const visible = projects
    .filter((p) => p.status !== "archived")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3);

  return (
    <Card className={styles.projects} aria-labelledby="dash-projects">
      <CardHeader
        id="dash-projects"
        title="Бренды в работе"
        description="Контекст брендов, который AI учитывает в ответах"
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
          icon={FolderPlus}
          title="Добавьте первый бренд"
          description="Опишите бизнес, аудиторию и конкурентов — AI будет использовать этот контекст в каждом запросе."
          action={
            <ButtonLink href="/projects?create=1" variant="primary" size="sm">
              Создать проект
            </ButtonLink>
          }
        />
      )}
      {status === "ready" && visible.length > 0 && (
        <ul className={styles.projectGrid}>
          {visible.map((p) => {
            const completeness = contextCompleteness(p).percent;
            const docs = documents.filter((d) => d.projectId === p.id).length;
            return (
              <li key={p.id} className={styles.projectTile}>
                <div className={styles.projectTileTop}>
                  <Monogram name={p.name} color={p.color} />
                  <span className={styles.projectUpdated}>{now ? formatRelative(p.updatedAt, now) : ""}</span>
                </div>
                <Link href={`/projects/${p.id}`} className={styles.projectTileLink}>
                  {p.name}
                </Link>
                <p className={styles.projectIndustry}>{p.industry}</p>
                <div className={styles.projectStats}>
                  <span>
                    <MessagesSquare size={14} aria-hidden /> {countLabel(threadCounts.get(p.id) ?? 0, ["диалог", "диалога", "диалогов"])}
                  </span>
                  <span>
                    <FileText size={14} aria-hidden /> {countLabel(docs, ["файл", "файла", "файлов"])}
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

type ResultsFilter = "review" | "all";

function ResultsPanel() {
  const now = useNow();
  const { notify } = useToast();
  const { threads, status, retry, setResultStatus } = useWorkspace();
  const { byId } = useProjects();
  const [filter, setFilter] = useState<ResultsFilter>("review");
  const results = useMemo(() => selectResults(threads), [threads]);
  const reviewCount = results.filter((r) => r.result.status === "review").length;
  const visible = (filter === "review" ? results.filter((r) => r.result.status === "review") : results).slice(0, 5);

  return (
    <Card className={styles.results} aria-labelledby="dash-results">
      <CardHeader
        id="dash-results"
        title="AI-результаты"
        description="Стратегии, анализы и тексты из ваших диалогов"
        action={
          <SegmentedControl
            legend="Фильтр результатов"
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "review", label: "На проверке", count: reviewCount },
              { value: "all", label: "Все", count: results.length },
            ]}
          />
        }
      />
      {status === "loading" && (
        <LoadingRegion label="Загрузка результатов">
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
          icon={filter === "review" ? ListChecks : Inbox}
          title={filter === "review" ? "Всё проверено" : "Результатов пока нет"}
          description={
            filter === "review"
              ? "Новые стратегии и анализы появятся здесь, когда AI подготовит их в диалогах."
              : "Запустите сценарий в AI Workspace — структурированные результаты будут собираться здесь."
          }
          action={
            <ButtonLink href="/workspace?new=1" size="sm">
              Открыть AI Workspace
            </ButtonLink>
          }
        />
      )}
      {status === "ready" && visible.length > 0 && (
        <ul className={styles.resultList}>
          {visible.map((entry) => {
            const project = entry.projectId ? byId.get(entry.projectId) : undefined;
            return (
              <li key={entry.messageId} className={styles.resultRow}>
                <ResultKindIcon kind={entry.result.kind} />
                <div className={styles.resultText}>
                  <Link href={`/workspace?thread=${entry.threadId}`} className={styles.resultTitle}>
                    {entry.result.title}
                  </Link>
                  <p className={styles.resultMeta}>
                    {project && (
                      <span className={styles.resultBrand}>
                        <BrandDot color={project.color} /> {project.name}
                      </span>
                    )}
                    <span>{scenarioTitle(entry.result.kind)}</span>
                    {now && <span>{formatRelative(entry.createdAt, now)}</span>}
                  </p>
                </div>
                <div className={styles.resultActions}>
                  <ResultStatusBadge status={entry.result.status} size="sm" />
                  {entry.result.status === "review" && (
                    <Button
                      size="sm"
                      icon={Check}
                      onClick={() => {
                        setResultStatus(entry.threadId, entry.messageId, "approved");
                        notify({ title: "Результат отмечен как проверенный", description: "Изменение сохранено только в этой вкладке." });
                      }}
                      aria-label={`Отметить проверенным: ${entry.result.title}`}
                    >
                      Проверено
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function DocumentsPanel() {
  const now = useNow();
  const { documents, status, retry } = useDocuments();
  const { byId } = useProjects();
  const recent = [...documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);

  return (
    <Card className={styles.documents} aria-labelledby="dash-docs">
      <CardHeader
        id="dash-docs"
        title="Недавние документы"
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
          {recent.map((d) => {
            const project = d.projectId ? byId.get(d.projectId) : undefined;
            return (
              <li key={d.id}>
                <Link href={`/documents?doc=${d.id}`} className={styles.docRow}>
                  <FileIcon kind={d.kind} size="sm" />
                  <span className={styles.docText}>
                    <span className={styles.docName} title={d.name}>
                      {d.name}
                    </span>
                    <span className={styles.docMeta}>
                      {kindLabel[d.kind]}
                      {project ? ` · ${project.name}` : ""}
                    </span>
                  </span>
                  <span className={styles.docTime}>{now ? formatRelative(d.updatedAt, now) : ""}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
