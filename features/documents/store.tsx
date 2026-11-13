"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import { useApi } from "@/lib/api/provider";
import { applyDemoView, type ResourceStatus } from "@/lib/resource";
import type { DocumentItem, DocumentTemplate, ID } from "@/lib/types";
import { useAccount } from "@/features/account/store";
import { documentsReducer, initialDocumentsState } from "./model";

interface DocumentsContextValue {
  status: ResourceStatus;
  items: DocumentItem[];
  templates: DocumentTemplate[];
  reload: () => Promise<void>;
  toggleFavorite: (id: ID) => void;
}

const DocumentsContext = createContext<DocumentsContextValue | null>(null);

export function DocumentsProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [state, dispatch] = useReducer(documentsReducer, initialDocumentsState);

  const reload = useCallback(async () => {
    dispatch({ type: "loading" });
    try {
      const [items, templates] = await Promise.all([api.documents.list(), api.documents.listTemplates()]);
      dispatch({ type: "loaded", items, templates });
    } catch {
      dispatch({ type: "failed" });
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggleFavorite = useCallback((id: ID) => dispatch({ type: "favoriteToggled", id }), []);

  const value = useMemo(
    () => ({ status: state.status, items: state.items, templates: state.templates, reload, toggleFavorite }),
    [state, reload, toggleFavorite],
  );

  return <DocumentsContext.Provider value={value}>{children}</DocumentsContext.Provider>;
}

export function useDocuments() {
  const ctx = useContext(DocumentsContext);
  if (!ctx) throw new Error("useDocuments must be used inside <DocumentsProvider>");
  const { demoView, setDemoView } = useAccount();
  const view = applyDemoView(demoView, ctx.status, ctx.items);

  const retry = useCallback(() => {
    if (demoView !== "live") setDemoView("live");
    else void ctx.reload();
  }, [demoView, setDemoView, ctx]);

  return {
    status: view.status,
    documents: view.items,
    templates: view.status === "ready" ? ctx.templates : [],
    reload: ctx.reload,
    retry,
    toggleFavorite: ctx.toggleFavorite,
  };
}
