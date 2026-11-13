"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { FileText, FolderKanban, MessagesSquare, Search, SearchX, X, type LucideIcon } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/Button";
import { useProjects } from "@/features/projects/store";
import { useWorkspace } from "@/features/workspace/store";
import { useDocuments } from "@/features/documents/store";
import { filterThreads } from "@/features/workspace/model";
import { kindLabel } from "@/features/documents/model";
import { cx } from "@/lib/cx";
import styles from "./GlobalSearch.module.css";

interface SearchResult {
  id: string;
  group: "Проекты" | "Диалоги" | "Документы";
  title: string;
  meta: string;
  href: string;
  icon: LucideIcon;
}

const LIMIT = 4;

function useSearchResults(query: string): SearchResult[] {
  const { projects, byId } = useProjects();
  const { threads } = useWorkspace();
  const { documents } = useDocuments();

  return useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ru");
    if (!q) return [];
    const projectHits: SearchResult[] = projects
      .filter((p) => `${p.name} ${p.industry}`.toLocaleLowerCase("ru").includes(q))
      .slice(0, LIMIT)
      .map((p) => ({ id: `p:${p.id}`, group: "Проекты", title: p.name, meta: p.industry, href: `/projects/${p.id}`, icon: FolderKanban }));
    const threadHits: SearchResult[] = filterThreads(threads, q)
      .slice(0, LIMIT)
      .map((t) => ({
        id: `t:${t.id}`,
        group: "Диалоги",
        title: t.title,
        meta: (t.projectId && byId.get(t.projectId)?.name) || "Без проекта",
        href: `/workspace?thread=${t.id}`,
        icon: MessagesSquare,
      }));
    const documentHits: SearchResult[] = documents
      .filter((d) => d.name.toLocaleLowerCase("ru").includes(q))
      .slice(0, LIMIT)
      .map((d) => ({
        id: `d:${d.id}`,
        group: "Документы",
        title: d.name,
        meta: `${kindLabel[d.kind]}${d.projectId && byId.get(d.projectId) ? ` · ${byId.get(d.projectId)?.name}` : ""}`,
        href: `/documents?doc=${d.id}`,
        icon: FileText,
      }));
    return [...projectHits, ...threadHits, ...documentHits];
  }, [query, projects, threads, documents, byId]);
}

function SearchCombobox({ variant, onDone }: { variant: "popover" | "inline"; onDone?: () => void }) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const results = useSearchResults(query);
  const expanded = variant === "inline" ? query.trim().length > 0 : focused && query.trim().length > 0;

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (variant !== "popover") return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (window.matchMedia("(max-width: 767px)").matches) return;
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant]);

  function go(result: SearchResult) {
    router.push(result.href);
    setQuery("");
    inputRef.current?.blur();
    onDone?.();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length) {
      event.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length) {
      event.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === "Enter" && results[active]) {
      event.preventDefault();
      go(results[active]);
    } else if (event.key === "Escape" && variant === "popover") {
      if (query) setQuery("");
      else inputRef.current?.blur();
    }
  }

  const optionId = (index: number) => `${listId}-opt-${index}`;
  let lastGroup = "";

  return (
    <div className={cx(styles.combobox, styles[variant])}>
      <div className={styles.inputWrap}>
        <Search size={16} className={styles.inputIcon} aria-hidden />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Поиск по проектам, диалогам и документам"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && results[active] ? optionId(active) : undefined}
          autoFocus={variant === "inline"}
          placeholder="Поиск по проектам, диалогам, файлам"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          className={styles.input}
          autoComplete="off"
          spellCheck={false}
        />
        {variant === "popover" && !query && (
          <kbd className={styles.kbd} aria-hidden>
            Ctrl K
          </kbd>
        )}
        {query && (
          <button type="button" className={styles.clear} onMouseDown={(e) => e.preventDefault()} onClick={() => setQuery("")} aria-label="Очистить поиск">
            <X size={14} aria-hidden />
          </button>
        )}
      </div>

      <div className={cx(styles.results, expanded && styles.resultsOpen)} onMouseDown={(e) => e.preventDefault()}>
        <ul id={listId} role="listbox" aria-label="Результаты поиска" className={styles.list}>
          {results.map((result, index) => {
            const heading = result.group !== lastGroup ? result.group : null;
            lastGroup = result.group;
            const Icon = result.icon;
            return (
              <li key={result.id} role="presentation">
                {heading && (
                  <div className={styles.group} role="presentation">
                    {heading}
                  </div>
                )}
                <div
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === active}
                  className={cx(styles.option, index === active && styles.optionActive)}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(result)}
                >
                  <Icon size={16} className={styles.optionIcon} aria-hidden />
                  <span className={styles.optionText}>
                    <span className={styles.optionTitle}>{result.title}</span>
                    <span className={styles.optionMeta}>{result.meta}</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        {expanded && results.length === 0 && (
          <div className={styles.empty}>
            <SearchX size={18} aria-hidden />
            Ничего не найдено по запросу «{query.trim()}»
          </div>
        )}
      </div>
      {variant === "inline" && !query && <p className={styles.hint}>Ищите по названиям брендов, диалогов и файлов.</p>}
      <div className="sr-only" aria-live="polite">
        {expanded ? `Найдено результатов: ${results.length}` : ""}
      </div>
    </div>
  );
}

export function GlobalSearch() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <>
      <div className={styles.desktop}>
        <SearchCombobox variant="popover" />
      </div>
      <div className={styles.mobile}>
        <IconButton icon={Search} label="Поиск" onClick={() => setMobileOpen(true)} tooltip={false} />
        <Dialog open={mobileOpen} onClose={() => setMobileOpen(false)} title="Поиск" variant="sheet" size="lg">
          <SearchCombobox variant="inline" onDone={() => setMobileOpen(false)} />
        </Dialog>
      </div>
    </>
  );
}
