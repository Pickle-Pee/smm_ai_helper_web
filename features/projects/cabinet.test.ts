import { describe, expect, it, vi } from "vitest";
import type { CabinetApi } from "@/lib/api/v2/cabinet";
import { fixtures } from "@/lib/api/v2/fixtures";
import imported from "@/docs/api/fixtures/responses/project-brand-imported.200.json";
import type { ProjectBrand } from "@/lib/api/v2/types";
import { brandWithUpdatedProject, listCabinetProjects, loadCabinetProject } from "./cabinet";

describe("cabinet projects", () => {
  const signal = new AbortController().signal;

  it("loads all pages for one organization and rejects foreign results", async () => {
    const project = fixtures.responses.project();
    const listProjects = vi.fn()
      .mockResolvedValueOnce({ items: [project], next_cursor: "next" })
      .mockResolvedValueOnce({ items: [{ ...project, id: "second" }], next_cursor: null });
    const api = { listProjects } as unknown as CabinetApi;
    expect((await listCabinetProjects(api, project.org_id, signal)).map((item) => item.id)).toEqual([project.id, "second"]);
    expect(listProjects.mock.calls.map(([org, query]) => [org, query.cursor])).toEqual([
      [project.org_id, undefined], [project.org_id, "next"],
    ]);
    listProjects.mockResolvedValueOnce({ items: [{ ...project, org_id: "foreign" }], next_cursor: null });
    await expect(listCabinetProjects(api, project.org_id, signal)).rejects.toThrow("organization mismatch");
  });

  it("rejects a brand returned for another project", async () => {
    const project = fixtures.responses.project();
    const api = {
      getProject: vi.fn().mockResolvedValue(project),
      getProjectBrand: vi.fn().mockResolvedValue({ ...project.brand, project_id: "foreign" }),
    } as unknown as CabinetApi;
    await expect(loadCabinetProject(api, project.id, signal)).rejects.toThrow("Brand project mismatch");
  });

  it("keeps the project version after a brand import and disables repeated import", () => {
    const project = fixtures.responses.project();
    const brand = imported as ProjectBrand;
    const next = brandWithUpdatedProject(project, brand);
    expect(next.version).toBe(project.version);
    expect(next.brand).toBe(brand);
    expect(next.permissions.can_import_telegram_brand).toBe(false);
  });
});
