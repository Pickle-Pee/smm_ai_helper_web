"use client";

import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { ApiClient } from "@/lib/api/contracts";
import { createMockApiClient } from "@/lib/api/mock-client";
import type { WebApiV2 } from "@/lib/api/v2/contract";
import { loadAppWebApiV2, resolveWebApiV2Mode, type WebApiV2Mode } from "@/lib/api/v2/mode";

/*
 * Single integration point.
 *
 * - `client` (read-only UI `ApiClient`): the existing mock adapter. Feature stores read through it and keep
 *   their local mutations. When a real backend is approved, `createWebApiV2ReadAdapter(http, mockDocuments)`
 *   (lib/api/v2/read-adapter.ts) replaces it here, in one reviewed change.
 * - `webApiV2`: the typed Web API v2 transport. In F1 it is ALWAYS the fixture transport
 *   (lib/api/v2/mode.ts); it is loaded lazily and used only by clearly labelled demo UI.
 *
 * Never put service tokens or Telegram identity headers into either client (see AGENTS.md).
 */
interface ApiContextValue {
  client: ApiClient;
  webApiV2Mode: WebApiV2Mode;
  loadWebApiV2: () => Promise<WebApiV2>;
}

const ApiContext = createContext<ApiContextValue | null>(null);

export function ApiProvider({ client, webApiV2, children }: { client?: ApiClient; webApiV2?: WebApiV2; children: ReactNode }) {
  const [readClient] = useState<ApiClient>(() => client ?? createMockApiClient());
  const v2 = useRef<Promise<WebApiV2> | null>(null);
  const value = useMemo<ApiContextValue>(
    () => ({
      client: readClient,
      webApiV2Mode: resolveWebApiV2Mode(),
      loadWebApiV2: () => (v2.current ??= webApiV2 ? Promise.resolve(webApiV2) : loadAppWebApiV2()),
    }),
    [readClient, webApiV2],
  );
  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

function useApiContext(): ApiContextValue {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error("useApi must be used inside <ApiProvider>");
  return ctx;
}

/** The read-only UI client used by feature stores. */
export function useApi(): ApiClient {
  return useApiContext().client;
}

/** The Web API v2 transport (fixture-only in F1) for labelled demo UI. */
export function useWebApiV2(): { mode: WebApiV2Mode; load: () => Promise<WebApiV2> } {
  const ctx = useApiContext();
  return { mode: ctx.webApiV2Mode, load: ctx.loadWebApiV2 };
}
