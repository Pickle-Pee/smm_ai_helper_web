import type { DocumentItem, DocumentTemplate, Project, Thread } from "@/lib/types";

/**
 * Read contracts the UI depends on. Feature stores talk to these interfaces only,
 * so a future authenticated HTTP client can replace the mock adapter without
 * touching components.
 *
 * Mutations are intentionally NOT part of the contract yet: until the Web API is approved,
 * every change made in the UI stays in local state and is labelled as such.
 */
export interface ProjectsApi {
  list(): Promise<Project[]>;
}

export interface ThreadsApi {
  list(): Promise<Thread[]>;
}

export interface DocumentsApi {
  list(): Promise<DocumentItem[]>;
  listTemplates(): Promise<DocumentTemplate[]>;
}

export interface ApiClient {
  /** `mock` while no backend contract exists; shown in the UI so nobody mistakes demo data for real data. */
  readonly mode: "mock" | "http";
  projects: ProjectsApi;
  threads: ThreadsApi;
  documents: DocumentsApi;
}
