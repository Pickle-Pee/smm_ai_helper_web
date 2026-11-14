"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MessageSquarePlus, MessagesSquare, SearchX } from "lucide-react";
import { IconButton, Button } from "@/components/ui/Button";
import { SearchField, Select } from "@/components/ui/Form";
import { BrandDot } from "@/components/ui/Monogram";
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from "@/components/ui/States";
import { dayBucket, dayBucketLabel, formatRelative, type DayBucket } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { cx } from "@/lib/cx";
import type { BrandColor, ID } from "@/lib/types";
import styles from "../Workspace.module.css";

export interface ThreadListItem {
  id: ID;
  title: string;
  projectId: ID | null;
  updatedAt: string;
  /** A request of this thread is pending/running on the server. */
  busy?: boolean;
}

export interface ThreadListProject {
  id: ID;
  name: string;
  color: BrandColor;
}

/** Presentational thread history (search by title, brand filter, day groups). Data comes from the caller. */
export function ThreadList({
  threads,
  projects,
  status,
  onRetry,
  activeId,
  onNavigate,
  onNew,
}: {
  threads: ThreadListItem[];
  projects: ThreadListProject[];
  status: "loading" | "ready" | "error";
  onRetry: () => void;
  activeId: ID | null;
  onNavigate?: () => void;
  onNew: () => void;
}) {
  const now = useNow();
  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<ID | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ru");
    return [...threads]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .filter((t) => (projectFilter === "all" || t.projectId === projectFilter) && (!q || t.title.toLocaleLowerCase("ru").includes(q)));
  }, [threads, query, projectFilter]);
  const groups = useMemo(() => {
    const map = new Map<DayBucket, typeof filtered>();
    if (!now) return map;
    for (const t of filtered) {
      const bucket = dayBucket(t.updatedAt, now);
      map.set(bucket, [...(map.get(bucket) ?? []), t]);
    }
    return map;
  }, [filtered, now]);

  return (
    <div className={styles.threads}>
      <div className={styles.threadsHead}>
        <h2 className={styles.panelTitle}>Диалоги</h2>
        <IconButton icon={MessageSquarePlus} label="Новый диалог" onClick={onNew} tooltipAlign="end" />
      </div>
      <div className={styles.threadsFilters}>
        <SearchField controlSize="sm" label="Поиск по диалогам" placeholder="Поиск по диалогам" value={query} onValueChange={setQuery} />
        <Select controlSize="sm" aria-label="Фильтр по бренду" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="all">Все бренды</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>

      <div className={styles.threadsScroll}>
        {status === "loading" && (
          <LoadingRegion label="Загрузка диалогов">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={styles.threadSkeleton}>
                <Skeleton width="85%" height={12} />
                <Skeleton width="50%" height={10} style={{ marginTop: 8 }} />
              </div>
            ))}
          </LoadingRegion>
        )}
        {status === "error" && <ErrorState compact onRetry={onRetry} title="Диалоги не загрузились" description="История временно недоступна." />}
        {status === "ready" && threads.length === 0 && (
          <EmptyState compact icon={MessagesSquare} title="Диалогов пока нет" description="Начните с одного из сценариев — история появится здесь." />
        )}
        {status === "ready" && threads.length > 0 && filtered.length === 0 && (
          <EmptyState
            compact
            icon={SearchX}
            title="Ничего не найдено"
            description="Измените запрос или выберите другой бренд."
            action={
              <Button
                size="sm"
                onClick={() => {
                  setQuery("");
                  setProjectFilter("all");
                }}
              >
                Сбросить фильтры
              </Button>
            }
          />
        )}
        {status === "ready" &&
          [...groups.entries()].map(([bucket, items]) => (
            <section key={bucket} className={styles.threadGroup} aria-label={dayBucketLabel[bucket]}>
              <h3 className={styles.threadGroupTitle}>{dayBucketLabel[bucket]}</h3>
              <ul>
                {items.map((t) => {
                  const project = t.projectId ? byId.get(t.projectId) : undefined;
                  const active = t.id === activeId;
                  return (
                    <li key={t.id}>
                      <Link
                        href={`/workspace?thread=${t.id}`}
                        className={cx(styles.threadItem, active && styles.threadItemActive)}
                        aria-current={active ? "page" : undefined}
                        onClick={onNavigate}
                      >
                        <span className={styles.threadTitle}>{t.title}</span>
                        <span className={styles.threadMeta}>
                          {project ? (
                            <span className={styles.threadBrand}>
                              <BrandDot color={project.color} />
                              <span>{project.name}</span>
                            </span>
                          ) : (
                            <span className={styles.threadBrand}>Без бренда</span>
                          )}
                          <span className={styles.threadTime}>{now ? formatRelative(t.updatedAt, now) : ""}</span>
                        </span>
                        {t.busy && (
                          <span className={styles.reviewDot} title="Запрос выполняется">
                            <span className="sr-only">Запрос выполняется</span>
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
      </div>
    </div>
  );
}
