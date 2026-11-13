import type { ApiClient } from "@/lib/api/contracts";
import { createMockDataset } from "@/lib/mock/data";

/**
 * Mock adapter. Resolves immediately — no artificial latency, no network.
 * Every call returns a fresh copy so "reset demo data" restores the original dataset.
 */
export function createMockApiClient(getNow: () => Date = () => new Date()): ApiClient {
  const snapshot = () => createMockDataset(getNow());

  return {
    mode: "mock",
    projects: {
      list: async () => snapshot().projects,
    },
    threads: {
      list: async () => snapshot().threads,
    },
    documents: {
      list: async () => snapshot().documents,
      listTemplates: async () => snapshot().templates,
    },
  };
}
