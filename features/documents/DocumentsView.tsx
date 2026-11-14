"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, FileText, LayoutGrid, List, LayoutTemplate, MessagesSquare, SearchX, Sparkles, Star, Upload } from "lucide-react";
import { Badge, SoonBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SearchField, Select } from "@/components/ui/Form";
import { BrandDot } from "@/components/ui/Monogram";
import { Page, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from "@/components/ui/States";
import { Tabs, TabPanel, useTabsId } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { useLegacyDemoProjects } from "@/features/projects/store";
import { useWorkspace } from "@/features/workspace/store";
import { scenarioById, scenarioPrompt } from "@/features/workspace/scenarios";
import { formatDate, formatFileSize, formatRelative } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { cx } from "@/lib/cx";
import type { DocumentItem, DocumentTemplate } from "@/lib/types";
import { useDocuments } from "./store";
import {
  countByKind,
  defaultDocumentFilter,
  extensionOf,
  filterDocuments,
  kindLabel,
  kindPluralLabel,
  sourceLabel,
  type DocumentFilter,
  type DocumentSort,
  type KindFilter,
} from "./model";
import { FileIcon, FileThumb } from "./components/FileVisual";
import styles from "./Documents.module.css";

type View = "grid" | "list";
const kindTabs: KindFilter[] = ["all", "favorites", "sheet", "doc", "pdf", "slides", "card", "file"];

/**
 * Documents stay on the legacy demo dataset (F3): files are tagged with legacy demo brands (`p-…`), which are NOT
 * Web API v2 projects. The UI says so, and drafts handed to the AI Workspace keep the legacy id so the Workspace
 * explains the mismatch instead of picking another project. Real documents come after Storage/Auth Foundation.
 */
export function DocumentsView() {
  const router = useRouter();
  const params = useSearchParams();
  const now = useNow();
  const { notify } = useToast();
  const { documents, templates, status, retry, toggleFavorite } = useDocuments();
  const { projects, byId } = useLegacyDemoProjects();
  const { prepareDraft } = useWorkspace();
  const tabsId = useTabsId();
  const [filter, setFilter] = useState<DocumentFilter>(defaultDocumentFilter);
  const [view, setView] = useState<View>("grid");
  const [previewId, setPreviewId] = useState<string | null>(null);

  // Deep link: /documents?doc=<id> opens the preview.
  useEffect(() => {
    const doc = params.get("doc");
    if (doc && status === "ready") {
      setPreviewId(doc);
      router.replace("/documents", { scroll: false });
    }
  }, [params, status, router]);

  const counts = useMemo(() => countByKind(documents), [documents]);
  const visible = useMemo(() => filterDocuments(documents, filter), [documents, filter]);
  const preview = previewId ? documents.find((d) => d.id === previewId) ?? null : null;
  const filtersActive = filter.query.trim() !== "" || filter.kind !== "all" || filter.projectId !== "all";

  function discuss(doc: DocumentItem) {
    prepareDraft({
      projectId: doc.projectId,
      scenarioId: null,
      text: `Помоги доработать документ «${doc.name}»: `,
      origin: { label: "Документы", href: "/documents" },
    });
    router.push("/workspace?new=1");
  }

  function applyTemplate(template: DocumentTemplate) {
    const scenario = scenarioById.get(template.scenarioId);
    prepareDraft({
      projectId: filter.projectId !== "all" ? filter.projectId : null,
      scenarioId: template.scenarioId,
      text: scenario
        ? `${scenarioPrompt(scenario, filter.projectId !== "all" ? byId.get(filter.projectId)?.name : null)} Оформи по шаблону «${template.name}».`
        : `Подготовь материал по шаблону «${template.name}».`,
      origin: { label: "Документы", href: "/documents" },
    });
    router.push("/workspace?new=1");
  }

  function favorite(doc: DocumentItem) {
    toggleFavorite(doc.id);
    notify({ title: doc.favorite ? "Убрано из избранного" : "Добавлено в избранное", description: doc.name });
  }

  return (
    <Page>
      <PageHeader
        title="Документы"
        description="Демо-набор файлов со своими брендами: он не связан с проектами Web API v2, которые видны на Обзоре, в Проектах и AI Workspace. Генерация, загрузка и привязка файлов к проектам появятся после подключения хранилища."
        actions={
          <div className={styles.headerActions}>
            <Button icon={Upload} disabled aria-describedby="upload-soon">
              Загрузить
            </Button>
            <SoonBadge id="upload-soon">Скоро</SoonBadge>
          </div>
        }
      />

      <Tabs
        label="Тип документа"
        idBase={tabsId}
        value={filter.kind}
        onChange={(kind) => setFilter((f) => ({ ...f, kind }))}
        items={kindTabs.map((k) => ({
          id: k,
          label: k === "favorites" ? (
            <>
              <Star size={14} aria-hidden /> {kindPluralLabel[k]}
            </>
          ) : (
            kindPluralLabel[k]
          ),
          count: status === "ready" ? counts[k] : undefined,
        }))}
      />

      <TabPanel idBase={tabsId} tab={filter.kind} className={styles.panel}>
        <div className={styles.toolbar}>
          <SearchField
            label="Поиск по документам"
            placeholder="Название файла"
            value={filter.query}
            onValueChange={(query) => setFilter((f) => ({ ...f, query }))}
            wrapperClassName={styles.search}
          />
          <Select
            aria-label="Фильтр по бренду демо-набора"
            value={filter.projectId}
            onChange={(e) => setFilter((f) => ({ ...f, projectId: e.target.value }))}
            wrapperClassName={styles.select}
          >
            <option value="all">Все бренды демо-набора</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Сортировка"
            value={filter.sort}
            onChange={(e) => setFilter((f) => ({ ...f, sort: e.target.value as DocumentSort }))}
            wrapperClassName={styles.select}
          >
            <option value="recent">Сначала новые</option>
            <option value="name">По названию</option>
            <option value="size">По размеру</option>
          </Select>
          <SegmentedControl<View>
            legend="Вид"
            value={view}
            onChange={setView}
            className={styles.viewToggle}
            options={[
              { value: "grid", label: <LayoutGrid size={16} aria-hidden />, ariaLabel: "Плитка" },
              { value: "list", label: <List size={16} aria-hidden />, ariaLabel: "Список" },
            ]}
          />
        </div>

        {status === "loading" && (
          <LoadingRegion label="Загрузка документов" className={styles.grid}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className={styles.docCard}>
                <Skeleton height={132} radius={0} />
                <div className={styles.docBody}>
                  <Skeleton width="85%" height={13} />
                  <Skeleton width="50%" height={11} style={{ marginTop: 10 }} />
                </div>
              </div>
            ))}
          </LoadingRegion>
        )}

        {status === "error" && (
          <div className={styles.box}>
            <ErrorState onRetry={retry} title="Не удалось загрузить документы" />
          </div>
        )}

        {status === "ready" && documents.length === 0 && (
          <div className={styles.box}>
            <EmptyState
              icon={FileText}
              title="Документов пока нет"
              description="Начните с шаблона ниже — AI подготовит структуру в AI Workspace. Сохранение в файлы появится позже."
            />
          </div>
        )}

        {status === "ready" && documents.length > 0 && visible.length === 0 && (
          <div className={styles.box}>
            <EmptyState
              icon={filter.kind === "favorites" ? Star : SearchX}
              title={filter.kind === "favorites" && !filter.query ? "В избранном пусто" : "Ничего не найдено"}
              description={
                filter.kind === "favorites" && !filter.query
                  ? "Отмечайте важные файлы звёздочкой, чтобы быстро к ним возвращаться."
                  : "Попробуйте изменить запрос, тип файла или проект."
              }
              action={filtersActive && <Button onClick={() => setFilter(defaultDocumentFilter)}>Сбросить фильтры</Button>}
            />
          </div>
        )}

        {status === "ready" && visible.length > 0 && view === "grid" && (
          <ul className={styles.grid}>
            {visible.map((d) => {
              const project = d.projectId ? byId.get(d.projectId) : undefined;
              return (
                <li key={d.id} className={styles.docCard}>
                  <FileThumb kind={d.kind} />
                  <div className={styles.docBody}>
                    <h3 className={styles.docTitle}>
                      <button type="button" className={styles.docOpen} onClick={() => setPreviewId(d.id)} title={d.name}>
                        {d.name}
                      </button>
                    </h3>
                    <p className={styles.docMeta}>
                      {project ? (
                        <span className={styles.docProject}>
                          <BrandDot color={project.color} /> <span>{project.name}</span>
                        </span>
                      ) : (
                        <span className={styles.docProject}>Общие</span>
                      )}
                    </p>
                    <p className={styles.docFoot}>
                      <span>
                        {extensionOf(d.name)} · {formatFileSize(d.sizeKb)}
                      </span>
                      <span>{now ? formatRelative(d.updatedAt, now) : ""}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    className={cx(styles.star, d.favorite && styles.starOn)}
                    aria-pressed={d.favorite}
                    aria-label={`В избранное: ${d.name}`}
                    onClick={() => favorite(d)}
                  >
                    <Star size={16} aria-hidden />
                  </button>
                  {d.source === "ai" && (
                    <Badge tone="ai" size="sm" className={styles.sourceBadge} icon={Sparkles}>
                      AI
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {status === "ready" && visible.length > 0 && view === "list" && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">Документы</caption>
              <thead>
                <tr>
                  <th scope="col">Название</th>
                  <th scope="col">Тип</th>
                  <th scope="col">Бренд (демо)</th>
                  <th scope="col">Источник</th>
                  <th scope="col">Размер</th>
                  <th scope="col">Изменён</th>
                  <th scope="col">
                    <span className="sr-only">Избранное</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((d) => {
                  const project = d.projectId ? byId.get(d.projectId) : undefined;
                  return (
                    <tr key={d.id}>
                      <th scope="row">
                        <button type="button" className={styles.rowOpen} onClick={() => setPreviewId(d.id)}>
                          <FileIcon kind={d.kind} size="sm" />
                          <span title={d.name}>{d.name}</span>
                        </button>
                      </th>
                      <td>{kindLabel[d.kind]}</td>
                      <td>{project ? project.name : "Общие"}</td>
                      <td>{sourceLabel[d.source]}</td>
                      <td className="tabular">{formatFileSize(d.sizeKb)}</td>
                      <td>{now ? formatRelative(d.updatedAt, now) : ""}</td>
                      <td>
                        <button
                          type="button"
                          className={cx(styles.star, styles.starInline, d.favorite && styles.starOn)}
                          aria-pressed={d.favorite}
                          aria-label={`В избранное: ${d.name}`}
                          onClick={() => favorite(d)}
                        >
                          <Star size={16} aria-hidden />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </TabPanel>

      <SectionTitle id="templates-title" action={<Badge tone="ai" icon={Sparkles}>Через AI Workspace</Badge>}>
        Шаблоны
      </SectionTitle>
      <p className={styles.sectionNote}>
        Шаблон подставит готовый запрос в AI Workspace. Генерация файла по шаблону станет доступна после подключения генератора документов.
      </p>
      {templates.length > 0 ? (
        <ul className={styles.templates} aria-labelledby="templates-title">
          {templates.map((t) => (
            <li key={t.id} className={styles.template}>
              <FileIcon kind={t.kind} />
              <div className={styles.templateText}>
                <h3 className={styles.templateTitle}>{t.name}</h3>
                <p className={styles.templateDesc}>{t.description}</p>
              </div>
              <Button size="sm" icon={LayoutTemplate} onClick={() => applyTemplate(t)} aria-label={`Использовать шаблон «${t.name}»`}>
                Использовать
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        status === "ready" && <p className={styles.sectionNote}>Шаблоны недоступны.</p>
      )}

      <Dialog
        open={Boolean(preview)}
        onClose={() => setPreviewId(null)}
        variant="sheet"
        size="lg"
        title={preview?.name ?? ""}
        description={preview ? `${kindLabel[preview.kind]} · ${formatFileSize(preview.sizeKb)}` : undefined}
        footer={
          preview && (
            <>
              <span className={styles.unavailable}>
                <Button icon={Download} disabled aria-describedby="download-soon">
                  Скачать
                </Button>
                <SoonBadge id="download-soon">Недоступно в демо</SoonBadge>
              </span>
              <Button variant="ai" icon={MessagesSquare} onClick={() => discuss(preview)}>
                Обсудить в AI Workspace
              </Button>
            </>
          )
        }
      >
        {preview && <PreviewBody doc={preview} projectName={preview.projectId ? byId.get(preview.projectId)?.name : undefined} onFavorite={() => favorite(preview)} />}
      </Dialog>
    </Page>
  );
}

function PreviewBody({ doc, projectName, onFavorite }: { doc: DocumentItem; projectName?: string; onFavorite: () => void }) {
  return (
    <div className={styles.preview}>
      <FileThumb kind={doc.kind} large />
      <p className={styles.previewNote}>Схематичное превью. Просмотр содержимого появится после подключения хранилища файлов.</p>
      <p className={styles.previewSummary}>{doc.summary}</p>
      <dl className={styles.previewMeta}>
        <div>
          <dt>Бренд (демо-набор)</dt>
          <dd>{projectName ?? "Общие"}</dd>
        </div>
        <div>
          <dt>Источник</dt>
          <dd>{sourceLabel[doc.source]}</dd>
        </div>
        <div>
          <dt>Формат</dt>
          <dd>{extensionOf(doc.name) || kindLabel[doc.kind]}</dd>
        </div>
        <div>
          <dt>Изменён</dt>
          <dd>{formatDate(doc.updatedAt)}</dd>
        </div>
      </dl>
      <Button variant="ghost" icon={Star} onClick={onFavorite} aria-pressed={doc.favorite}>
        {doc.favorite ? "В избранном" : "Добавить в избранное"}
      </Button>
    </div>
  );
}
