import type { ApiClient, DocumentsApi } from "@/lib/api/contracts";
import type { Project as UiProject, Thread as UiThread } from "@/lib/types";
import type { WebApiV2 } from "./contract";
import { toUiProject, toUiThread } from "./presenters";

/**
 * Adapter from Web API v2 to the existing read-only UI `ApiClient` (projects, threads, documents).
 *
 * This is the seam for switching the UI to a backend later: `ApiProvider` would receive
 * `createWebApiV2ReadAdapter(httpClient, mockDocuments)` instead of `createMockApiClient()`. In F1 the app keeps
 * the existing mock client; this adapter is exercised in tests against the fixture transport only.
 *
 * - Projects are read from every organization the session belongs to (`getMe` memberships, keyset pages).
 * - Threads are read per project. Their messages are loaded per thread in F2 (`listThreadMessages`).
 * - Documents stay mock-only: Web API v2 has no documents endpoints (`Me.features.documents` is always false).
 * - Local mutations (create project, local messages, statuses) keep living in the feature stores; nothing here
 *   pretends to persist them remotely.
 */
export function createWebApiV2ReadAdapter(api: WebApiV2, documents: DocumentsApi): ApiClient {
  async function listAllProjects() {
    const me = await api.getMe();
    const out = [];
    for (const membership of me.memberships) {
      let cursor: string | undefined;
      do {
        const page = await api.listProjects(membership.organization.id, cursor ? { cursor } : undefined);
        out.push(...page.items);
        cursor = page.next_cursor ?? undefined;
      } while (cursor);
    }
    return out;
  }

  return {
    mode: api.transport === "http" ? "http" : "mock",
    projects: {
      list: async (): Promise<UiProject[]> => (await listAllProjects()).map(toUiProject),
    },
    threads: {
      list: async (): Promise<UiThread[]> => {
        const projects = await listAllProjects();
        const threads: UiThread[] = [];
        for (const project of projects) {
          let cursor: string | undefined;
          do {
            const page = await api.listThreads(project.id, cursor ? { cursor } : undefined);
            threads.push(...page.items.map(toUiThread));
            cursor = page.next_cursor ?? undefined;
          } while (cursor);
        }
        return threads;
      },
    },
    documents,
  };
}
