"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { ApiClient } from "@/lib/api/contracts";
import { createMockApiClient } from "@/lib/api/mock-client";

/*
 * Single integration point. When an authenticated, versioned Web API is approved,
 * create an HTTP client implementing `ApiClient` and pass it here.
 * Never put service tokens or Telegram identity headers into this client (see AGENTS.md).
 */
const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ client, children }: { client?: ApiClient; children: ReactNode }) {
  const [value] = useState<ApiClient>(() => client ?? createMockApiClient());
  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error("useApi must be used inside <ApiProvider>");
  return api;
}
