import { describe, expect, it, vi } from "vitest";
import { FIXTURE_IDS, fixtures } from "@/lib/api/v2/fixtures";
import { FixtureWebApiV2Client } from "@/lib/api/v2/fixture-client";
import { presentProjectBrand, presentWorkspaceProject } from "@/lib/api/v2/presenters";
import { WebApiError } from "@/lib/api/v2/errors";
import { MemoryPendingRequestStore } from "@/lib/api/v2/requests";
import { WorkspaceV2Controller } from "./controller";

/** F3: read-only project page reads through the session controller (the unified project context). */
function setup(options: ConstructorParameters<typeof FixtureWebApiV2Client>[0] = {}) {
  const api = new FixtureWebApiV2Client(options);
  const controller = new WorkspaceV2Controller({
    api,
    pendingStore: { kind: "transient", store: new MemoryPendingRequestStore(), reason: "no_verified_principal" },
    simulation: api,
  });
  return { api, controller };
}

describe("WorkspaceV2Controller.loadProject", () => {
  it("reads the project and its brand context; nothing is written or submitted", async () => {
    const { api, controller } = setup();
    const submit = vi.spyOn(api, "submitMessage");
    const create = vi.spyOn(api, "createThread");
    await controller.loadProject(FIXTURE_IDS.projectId);
    const detail = controller.getSnapshot().projectDetails[FIXTURE_IDS.projectId];
    expect(detail.status).toBe("ready");
    expect(detail.project?.project.id).toBe(FIXTURE_IDS.projectId);
    expect(detail.project?.canEdit).toBe(true);
    expect(detail.brand?.geography).toBe("Екатеринбург, один жилой район");
    expect(detail.brand?.importedFrom?.label).toBe("профиль бренда в Telegram-боте");
    expect(submit).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("a foreign or unknown id is not_found (tenant 404s look the same); a legacy demo id too", async () => {
    const { controller } = setup();
    await controller.loadProject(FIXTURE_IDS.foreignProjectId);
    await controller.loadProject("p-little-feet");
    expect(controller.getSnapshot().projectDetails[FIXTURE_IDS.foreignProjectId].status).toBe("not_found");
    expect(controller.getSnapshot().projectDetails["p-little-feet"].status).toBe("not_found");
    expect(controller.getSnapshot().projectDetails[FIXTURE_IDS.foreignProjectId].project).toBeNull();
  });

  it("a failed brand read keeps the project readable and says so; other failures are errors", async () => {
    const { api, controller } = setup();
    vi.spyOn(api, "getProjectBrand").mockRejectedValueOnce(new WebApiError({ kind: "http", operation: "getProjectBrand", status: 503, code: "temporarily_unavailable" }));
    await controller.loadProject(FIXTURE_IDS.projectId);
    expect(controller.getSnapshot().projectDetails[FIXTURE_IDS.projectId]).toMatchObject({ status: "ready", brand: null, brandError: true });

    vi.spyOn(api, "getProject").mockRejectedValueOnce(new WebApiError({ kind: "http", operation: "getProjectBrand", status: 503, code: "temporarily_unavailable" }));
    await controller.loadProject("368e72ce-4e3c-5ac8-85aa-91145dd9603c");
    expect(controller.getSnapshot().projectDetails["368e72ce-4e3c-5ac8-85aa-91145dd9603c"].status).toBe("error");
  });

  it("concurrent reads of one project share a single request", async () => {
    const { api, controller } = setup();
    const getProject = vi.spyOn(api, "getProject");
    await Promise.all([controller.loadProject(FIXTURE_IDS.projectId), controller.loadProject(FIXTURE_IDS.projectId)]);
    expect(getProject).toHaveBeenCalledTimes(1);
  });

  it("viewer: the project is readable, can_submit/can_edit are false", async () => {
    const { controller } = setup({ viewer: "viewer_member" });
    await controller.loadProject(FIXTURE_IDS.projectId);
    const detail = controller.getSnapshot().projectDetails[FIXTURE_IDS.projectId];
    expect(detail.project).toMatchObject({ role: "viewer", canSubmit: false, canEdit: false });
  });
});

describe("presentProjectBrand", () => {
  it("maps content fields and readable provenance only", () => {
    const view = presentProjectBrand(fixtures.responses.projectBrand());
    expect(view).toMatchObject({
      projectId: FIXTURE_IDS.projectId,
      brandName: "Зерно",
      tone: "Тёплый, разговорный, без канцелярита",
      channels: ["ВКонтакте", "Telegram"],
      usp: "Обжариваем зерно каждую неделю небольшими партиями",
      updatedBy: "Вы",
    });
    expect(JSON.stringify(view)).not.toMatch(/schema_version|web_api\.v2/);
  });

  it("empty brand fields become empty strings, never invented text", () => {
    const glina = fixtures.responses.projectsList().items[1];
    const view = presentProjectBrand(glina.brand);
    expect(view).toMatchObject({ description: "", audience: "", tone: "", goals: [], channels: [], geography: "", importedFrom: null });
    expect(presentWorkspaceProject(glina).project.status).toBe("draft");
  });
});
