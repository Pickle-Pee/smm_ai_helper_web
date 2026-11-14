import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * F3 source policy: one project/thread identity. Screens that show projects or Copilot threads read them from the
 * unified Web API v2 project context, never from the legacy demo stores, and the app builds exactly one fixture
 * transport per session.
 */
const root = join(__dirname, "../..");
const read = (f: string) => readFileSync(join(root, f), "utf8");

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== "node_modules" && name !== ".next" && name !== "testing") walk(full);
      } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
        out.push(relative(root, full).replace(/\\/g, "/"));
      }
    }
  };
  ["app", "components", "features", "lib"].forEach((d) => walk(join(root, d)));
  return out;
}

const UNIFIED_SCREENS = [
  "features/dashboard/DashboardView.tsx",
  "features/dashboard/Briefing.tsx",
  "features/projects/ProjectsView.tsx",
  "features/projects/ProjectDetailView.tsx",
  "features/projects/components/ProjectCard.tsx",
  "features/workspace/components/ContextPanel.tsx",
  "components/shell/Sidebar.tsx",
  "components/shell/GlobalSearch.tsx",
];

describe("F3: unified project context", () => {
  it("project and thread screens never read the legacy demo projects or threads", () => {
    for (const file of UNIFIED_SCREENS) {
      let src = read(file);
      if (file === "features/projects/ProjectDetailView.tsx") {
        // The project page may look up a legacy id ONLY to explain a stale link on its «not found» page.
        expect(src.match(/legacyProjects\.\w+/g)).toEqual(["legacyProjects.get"]);
        src = src.replace(/useLegacyDemoProjects/g, "");
      }
      expect(src, file).not.toMatch(/useLegacyDemoProjects|selectResults|countThreadsByProject|filterThreads|useDocuments\(\)[^;]*projectId/);
      // The legacy workspace store is used only to hand a draft to the Workspace.
      for (const m of src.matchAll(/const \{([^}]*)\} = useWorkspace\(\)/g)) expect(m[1].trim(), file).toBe("prepareDraft");
    }
  });

  it("the app builds exactly one fixture transport; only the isolated Settings playground makes its own", () => {
    const files = sourceFiles();
    const constructs = files.filter((f) => /new FixtureWebApiV2Client\(/.test(read(f)));
    expect(constructs.sort()).toEqual(["features/workspace/contract-demo/run.ts", "lib/api/v2/mode.ts"]);
    const loaders = files.filter((f) => f !== "lib/api/v2/mode.ts" && /loadAppWebApiV2\(/.test(read(f)));
    expect(loaders).toEqual(["lib/api/provider.tsx"]);
    // ApiProvider memoises the transport promise, so every consumer gets the same instance.
    expect(read("lib/api/provider.tsx")).toMatch(/v2\.current \?\?=/);
  });

  it("the read-only data hook never stops polls or loads (navigation must not change request state)", () => {
    const src = read("features/workspace/v2/provider.tsx");
    const body = src.slice(src.indexOf("export function useWorkspaceV2Data"));
    expect(body).not.toMatch(/stopAll|closeThread|dispose/);
    // And the unified context only reads: no request operations.
    expect(read("features/projects/context.tsx")).not.toMatch(/\.(submit|createThreadAndSubmit|answerClarification|resubmitSameKey|startNewRequest|checkStatus|openThread)\(/);
  });

  it("no screen offers local project creation or editing", () => {
    const files = sourceFiles();
    // (The generated contract metadata lists the PROPOSED write operations; they are not in `WebApiV2`.)
    const app = files.filter((f) => !f.startsWith("lib/api/generated/"));
    expect(app.filter((f) => /createProject|updateProject|updateProjectBrand|ProjectFormDialog/.test(read(f)))).toEqual([]);
    expect(read("lib/api/v2/contract.ts")).not.toMatch(/createProject|updateProject|importProjectBrand/);
  });
});
