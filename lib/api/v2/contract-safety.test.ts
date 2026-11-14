import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { ERROR_CATALOG, OPERATIONS, WEB_API_V2_CONTRACT } from "@/lib/api/generated/web-api-v2.meta";
import { loadAppWebApiV2, resolveWebApiV2Mode, WEB_API_V2_HTTP_ENABLED } from "./mode";
import { createWebApiV2ReadAdapter } from "./read-adapter";
import { FixtureWebApiV2Client } from "./fixture-client";
import { createMockApiClient } from "@/lib/api/mock-client";

const root = join(__dirname, "../../..");
const spec = parse(readFileSync(join(root, "docs/api/web-api-v2.openapi.yaml"), "utf8"));

describe("OpenAPI → TypeScript generation", () => {
  it("committed generated files match the contract YAML (drift check)", () => {
    const out = execFileSync(process.execPath, [join(root, "scripts/generate-api-types.mjs"), "--check"], { cwd: root, encoding: "utf8" });
    expect(out).toContain("matches the contract");
  }, 30_000);

  it("generated metadata mirrors info, x-error-catalog and every operation", () => {
    expect(WEB_API_V2_CONTRACT.version).toBe(spec.info.version);
    expect(WEB_API_V2_CONTRACT.publicBasePath).toBe("/api");
    expect(Object.keys(ERROR_CATALOG).sort()).toEqual([...spec.components.schemas.ErrorCode.enum].sort());
    const ops: string[] = [];
    for (const item of Object.values(spec.paths) as Record<string, { operationId?: string }>[]) {
      for (const m of ["get", "post", "put", "patch", "delete"]) if (item[m]?.operationId) ops.push(item[m].operationId!);
    }
    expect(Object.keys(OPERATIONS).sort()).toEqual(ops.sort());
    expect(OPERATIONS.submitMessage).toMatchObject({ method: "POST", path: "/v2/threads/{thread_id}/messages", unsafe: true });
    expect(OPERATIONS.getRequestByKey.unsafe).toBe(false);
  });
});

describe("F1 stays mock-only", () => {
  it("the app can only select the fixture transport, whatever the environment says", async () => {
    const env = vi.stubEnv;
    env("NEXT_PUBLIC_WEB_API_MODE", "http");
    env("WEB_API_MODE", "http");
    env("NEXT_PUBLIC_API_MODE", "http");
    try {
      expect(resolveWebApiV2Mode()).toBe("fixture");
      expect(WEB_API_V2_HTTP_ENABLED).toBe(false);
      const api = await loadAppWebApiV2();
      expect(api.transport).toBe("fixture");
      expect(api).toBeInstanceOf(FixtureWebApiV2Client);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("the fixture transport never touches the network", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("network must not be used");
    });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const api = new FixtureWebApiV2Client({ scenario: "workflow" });
      const thread = await api.createThread("a1f59d0c-9838-523f-a412-b7eeb76d5954", { kind: "copilot" });
      const { createRequestKey } = await import("./request-key");
      const res = await api.submitMessage(thread.id, { request_key: createRequestKey(), revision: 1, message: "Тест" });
      await api.getMessage(res.result.user_message.id);
      await api.getMe();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("the read-only UI ApiClient keeps working: existing mock by default, v2 adapter ready for later", async () => {
    const now = new Date("2026-11-14T12:00:00Z");
    const mock = createMockApiClient(() => now);
    expect(mock.mode).toBe("mock");
    const adapter = createWebApiV2ReadAdapter(new FixtureWebApiV2Client(), mock.documents);
    expect(adapter.mode).toBe("mock");
    const projects = await adapter.projects.list();
    expect(projects.map((p) => p.name)).toEqual(expect.arrayContaining([expect.stringContaining("Глина")]));
    const threads = await adapter.threads.list();
    expect(threads.length).toBeGreaterThan(0);
    expect(threads.every((t) => t.projectId && t.messages.length === 0)).toBe(true);
    expect(await adapter.documents.list()).toEqual(await mock.documents.list());
  });
});

/* ---------------- static source policy ---------------- */

const SOURCE_DIRS = ["app", "components", "features", "lib"];
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== "node_modules" && name !== ".next") walk(full);
      } else if (/\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
        out.push(relative(root, full).replace(/\\/g, "/"));
      }
    }
  };
  SOURCE_DIRS.forEach((d) => walk(join(root, d)));
  return out;
}

describe("source policy", () => {
  const files = sourceFiles();
  const read = (f: string) => readFileSync(join(root, f), "utf8");

  it("no app code imports the HTTP client (it is not connected in F1)", () => {
    const offenders = files.filter((f) => f !== "lib/api/v2/http-client.ts" && /from\s+["'][^"']*v2\/http-client["']|import\(["'][^"']*v2\/http-client["']\)/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("no app code calls /api/v2 directly", () => {
    // String literals or fetch calls targeting the proposed API (comments are fine).
    const offenders = files.filter((f) => /["']\/api\/v2|fetch\(\s*`\/api\/v2/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("no service secrets or Telegram identity headers in browser code", () => {
    const pattern = /BOT_BACKEND_TOKEN|OPENAI_API_KEY|sk-[A-Za-z0-9]{20,}|X-Telegram-User-ID/i;
    // The HTTP client mentions the header name only in its deny-list.
    const offenders = files.filter((f) => f !== "lib/api/v2/http-client.ts" && f !== "lib/api/provider.tsx" && pattern.test(read(f)));
    expect(offenders).toEqual([]);
    const http = read("lib/api/v2/http-client.ts");
    expect(http).toMatch(/FORBIDDEN_HEADERS = \[[^\]]*"x-telegram-user-id"/);
  });

  it("generated files are only produced by the generator", () => {
    for (const f of ["lib/api/generated/web-api-v2.ts", "lib/api/generated/web-api-v2.meta.ts"]) {
      expect(read(f)).toContain("GENERATED FILE - DO NOT EDIT");
    }
  });
});
