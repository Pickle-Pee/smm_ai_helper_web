import type { DocumentItem, DocumentKind, DocumentSource, DocumentTemplate, ID } from "@/lib/types";
import type { ResourceStatus } from "@/lib/resource";

export interface DocumentsState {
  status: ResourceStatus;
  items: DocumentItem[];
  templates: DocumentTemplate[];
}

export type DocumentsAction =
  | { type: "loading" }
  | { type: "loaded"; items: DocumentItem[]; templates: DocumentTemplate[] }
  | { type: "failed" }
  | { type: "favoriteToggled"; id: ID };

export const initialDocumentsState: DocumentsState = { status: "loading", items: [], templates: [] };

export function documentsReducer(state: DocumentsState, action: DocumentsAction): DocumentsState {
  switch (action.type) {
    case "loading":
      return { ...state, status: "loading" };
    case "loaded":
      return { status: "ready", items: action.items, templates: action.templates };
    case "failed":
      return { ...state, status: "error" };
    case "favoriteToggled":
      return {
        ...state,
        items: state.items.map((d) => (d.id === action.id ? { ...d, favorite: !d.favorite } : d)),
      };
    default:
      return state;
  }
}

export type KindFilter = DocumentKind | "all" | "favorites";
export type DocumentSort = "recent" | "name" | "size";

export interface DocumentFilter {
  query: string;
  kind: KindFilter;
  projectId: ID | "all";
  sort: DocumentSort;
}

export const defaultDocumentFilter: DocumentFilter = { query: "", kind: "all", projectId: "all", sort: "recent" };

export function filterDocuments(items: DocumentItem[], filter: DocumentFilter): DocumentItem[] {
  const q = filter.query.trim().toLocaleLowerCase("ru");
  const result = items.filter((d) => {
    if (filter.kind === "favorites" && !d.favorite) return false;
    if (filter.kind !== "all" && filter.kind !== "favorites" && d.kind !== filter.kind) return false;
    if (filter.projectId !== "all" && d.projectId !== filter.projectId) return false;
    if (q && !d.name.toLocaleLowerCase("ru").includes(q)) return false;
    return true;
  });
  return result.sort((a, b) => {
    if (filter.sort === "name") return a.name.localeCompare(b.name, "ru");
    if (filter.sort === "size") return b.sizeKb - a.sizeKb;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function countByKind(items: DocumentItem[]): Record<KindFilter, number> {
  const counts: Record<KindFilter, number> = { all: items.length, favorites: 0, sheet: 0, doc: 0, pdf: 0, slides: 0, card: 0, file: 0 };
  for (const d of items) {
    counts[d.kind] += 1;
    if (d.favorite) counts.favorites += 1;
  }
  return counts;
}

export const kindLabel: Record<DocumentKind, string> = {
  sheet: "Таблица",
  doc: "Документ",
  pdf: "PDF",
  slides: "Презентация",
  card: "Карточка",
  file: "Файл",
};

export const kindPluralLabel: Record<KindFilter, string> = {
  all: "Все",
  favorites: "Избранное",
  sheet: "Таблицы",
  doc: "Документы",
  pdf: "PDF",
  slides: "Презентации",
  card: "Карточки",
  file: "Файлы",
};

export const sourceLabel: Record<DocumentSource, string> = {
  ai: "Создано AI",
  upload: "Загружено",
  template: "Из шаблона",
};

export function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1].toUpperCase() : "";
}
