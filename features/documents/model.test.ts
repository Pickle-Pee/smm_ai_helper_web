import { describe, expect, it } from "vitest";
import { createMockDataset } from "@/lib/mock/data";
import { countByKind, defaultDocumentFilter, documentsReducer, extensionOf, filterDocuments, initialDocumentsState } from "./model";

const { documents, templates } = createMockDataset(new Date("2026-11-13T10:00:00Z"));

describe("documents", () => {
  it("filters by kind, favourites, project and query", () => {
    expect(filterDocuments(documents, { ...defaultDocumentFilter, kind: "pdf" }).every((d) => d.kind === "pdf")).toBe(true);
    expect(filterDocuments(documents, { ...defaultDocumentFilter, kind: "favorites" })).toHaveLength(3);
    expect(filterDocuments(documents, { ...defaultDocumentFilter, projectId: "p-forma" })).toHaveLength(2);
    expect(filterDocuments(documents, { ...defaultDocumentFilter, query: "МЕДИАПЛАН" }).map((d) => d.id)).toEqual(["d-9"]);
  });

  it("sorts by size and name", () => {
    const bySize = filterDocuments(documents, { ...defaultDocumentFilter, sort: "size" });
    expect(bySize[0].id).toBe("d-12");
    const byName = filterDocuments(documents, { ...defaultDocumentFilter, sort: "name" }).map((d) => d.name);
    expect(byName).toEqual([...byName].sort((a, b) => a.localeCompare(b, "ru")));
  });

  it("counts documents per kind", () => {
    const counts = countByKind(documents);
    expect(counts.all).toBe(14);
    expect(counts.sheet + counts.doc + counts.pdf + counts.slides + counts.card + counts.file).toBe(14);
  });

  it("toggles favourites in the reducer", () => {
    let state = documentsReducer(initialDocumentsState, { type: "loaded", items: documents, templates });
    state = documentsReducer(state, { type: "favoriteToggled", id: "d-3" });
    expect(state.items.find((d) => d.id === "d-3")?.favorite).toBe(true);
  });

  it("reads file extensions", () => {
    expect(extensionOf("План.xlsx")).toBe("XLSX");
    expect(extensionOf("без расширения")).toBe("");
  });
});
