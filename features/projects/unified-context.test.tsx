// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Fragment, useSyncExternalStore, type ReactNode } from "react";
import { FIXTURE_IDS } from "@/lib/api/v2/fixtures";
import { FixtureWebApiV2Client, type FixtureClientOptions } from "@/lib/api/v2/fixture-client";
import { MemoryPendingRequestStore, type Sleep } from "@/lib/api/v2/requests";
import { AppTestProviders } from "@/features/testing/AppTestProviders";
import { WorkspaceV2Controller } from "@/features/workspace/v2/controller";
import { FIXTURE_LABEL } from "@/features/workspace/v2/simulation";
import { WorkspaceView } from "@/features/workspace/WorkspaceView";
import { DashboardView } from "@/features/dashboard/DashboardView";
import { DocumentsView } from "@/features/documents/DocumentsView";
import { Sidebar } from "@/components/shell/Sidebar";
import { GlobalSearch } from "@/components/shell/GlobalSearch";
import { ProjectsView } from "./ProjectsView";
import { ProjectDetailView } from "./ProjectDetailView";

/*
 * F3 integration: Dashboard, Projects, the project page, sidebar, search and the AI Workspace rendered together
 * over ONE fixture transport, with an in-memory router. Navigation happens through the real links and buttons.
 */

/* ---------- next/navigation + next/link: one in-memory router ---------- */
const nav = vi.hoisted(() => {
  let url = "/";
  const listeners = new Set<() => void>();
  const go = (next: string) => {
    url = next.startsWith("/") ? next : `/${next}`;
    listeners.forEach((l) => l());
  };
  return {
    get url() {
      return url;
    },
    get path() {
      return url.split("?")[0];
    },
    get search() {
      return url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
    },
    set(next: string) {
      url = next;
    },
    go,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    router: { push: vi.fn((u: string) => go(u)), replace: vi.fn((u: string) => go(u)), back: vi.fn(), prefetch: vi.fn() },
  };
});

vi.mock("next/navigation", async () => {
  const { useSyncExternalStore: useStore } = await import("react");
  return {
    useRouter: () => nav.router,
    useSearchParams: () => new URLSearchParams(useStore(nav.subscribe, () => nav.search, () => nav.search)),
    usePathname: () => useStore(nav.subscribe, () => nav.path, () => nav.path),
  };
});

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ href, children, ...rest }: { href: string; children: ReactNode }) =>
      createElement(
        "a",
        {
          ...rest,
          href,
          onClick: (e: MouseEvent) => {
            e.preventDefault();
            nav.router.push(href);
          },
        },
        children,
      ),
  };
});

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal: () => void };
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  }
});

const fetchSpy = vi.fn(() => Promise.reject(new Error("network must not be used")));
beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockClear();
  nav.router.push.mockClear();
  nav.router.replace.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ZERNO = FIXTURE_IDS.projectId;
const GLINA = "368e72ce-4e3c-5ac8-85aa-91145dd9603c";
const noSleep: Sleep = async (_ms, signal) => {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
};

/** A tiny "app router": one page per path, remounted on navigation like Next does. Sidebar and search persist. */
function App() {
  const url = useSyncExternalStore(nav.subscribe, () => nav.url, () => nav.url);
  const path = url.split("?")[0];
  let page: ReactNode = null;
  if (path === "/") page = <DashboardView />;
  else if (path === "/projects") page = <ProjectsView />;
  else if (path.startsWith("/projects/")) page = <ProjectDetailView projectId={decodeURIComponent(path.slice("/projects/".length))} />;
  else if (path === "/workspace") page = <WorkspaceView />;
  else if (path === "/documents") page = <DocumentsView />;
  return (
    <>
      <Sidebar />
      <GlobalSearch />
      <main>
        <Fragment key={path}>{page}</Fragment>
      </main>
    </>
  );
}

function renderApp(url: string, options: FixtureClientOptions = {}, extra: { sleep?: Sleep } = {}) {
  nav.set(url);
  const api = new FixtureWebApiV2Client(options);
  const spies = {
    submit: vi.spyOn(api, "submitMessage"),
    createThread: vi.spyOn(api, "createThread"),
    listOrganizations: vi.spyOn(api, "listOrganizations"),
    getProject: vi.spyOn(api, "getProject"),
    getProjectBrand: vi.spyOn(api, "getProjectBrand"),
  };
  const controller = new WorkspaceV2Controller({
    api,
    pendingStore: { kind: "transient", store: new MemoryPendingRequestStore(), reason: "no_verified_principal" },
    simulation: api,
    sleep: extra.sleep ?? noSleep,
    newId: (() => {
      let i = 0;
      return () => `idem-${++i}`;
    })(),
  });
  render(
    <AppTestProviders api={api} controller={controller}>
      <App />
    </AppTestProviders>,
  );
  return { api, controller, ...spies };
}

const main = () => screen.getByRole("main");
const region = (name: string) => within(main()).getByRole("region", { name });
const projectSelect = () => screen.getByLabelText("Проект для запроса") as HTMLSelectElement;
const composer = () => screen.getByLabelText("Сообщение для AI") as HTMLTextAreaElement;
const sendButton = () => screen.getByRole("button", { name: "Отправить" }) as HTMLButtonElement;

async function dashboardReady() {
  await within(await screen.findByRole("region", { name: "Бренды в работе" })).findByRole("link", { name: "Кофейня «Зерно»" });
}

async function workspaceReady() {
  await waitFor(() => expect(screen.queryAllByLabelText("Загрузка диалогов")).toHaveLength(0));
  await waitFor(() => expect(within(projectSelect()).getAllByRole("option").length).toBeGreaterThan(1));
}

describe("one project identity across screens", () => {
  it("Dashboard, sidebar, Projects and the Workspace use exactly the fixture project ids", async () => {
    renderApp("/");
    await dashboardReady();
    const href = `/projects/${ZERNO}`;
    // Dashboard tile + sidebar link: the same id.
    for (const link of screen.getAllByRole("link", { name: /Кофейня «Зерно»/ })) expect(link.getAttribute("href")).toBe(href);
    expect(within(region("Бренды в работе")).getByRole("link", { name: "Студия керамики «Глина»" }).getAttribute("href")).toBe(`/projects/${GLINA}`);

    fireEvent.click(within(region("Бренды в работе")).getByRole("link", { name: "Все проекты" }));
    await within(main()).findByRole("heading", { name: "Проекты и бренды" });
    const card = await within(main()).findByRole("link", { name: "Кофейня «Зерно»" });
    expect(card.getAttribute("href")).toBe(href);

    fireEvent.click(screen.getByRole("link", { name: "Новый запрос" }));
    await workspaceReady();
    const values = within(projectSelect()).getAllByRole("option").map((o) => (o as HTMLOptionElement).value).filter(Boolean);
    expect(values).toEqual([ZERNO, GLINA]);
    await waitFor(() => expect(projectSelect().value).toBe(ZERNO));
    expect(screen.queryByText(/не найден в тестовых данных|не связан с проектами/)).toBeNull();
  });

  it("one shared fixture transport and one controller for the whole session", async () => {
    const { listOrganizations } = renderApp("/");
    await dashboardReady();
    fireEvent.click(screen.getAllByRole("link", { name: /Кофейня «Зерно»/ })[0]);
    await within(main()).findByRole("heading", { level: 1, name: "Кофейня «Зерно»" });
    fireEvent.click(within(main()).getByRole("button", { name: "Открыть в AI Workspace" }));
    await workspaceReady();
    fireEvent.click(screen.getByRole("link", { name: "Обзор" }));
    await dashboardReady();
    // The project/thread list was read once for every screen (no second client, no second controller start).
    expect(listOrganizations).toHaveBeenCalledTimes(1);
  });
});

describe("navigation keeps the project", () => {
  it("Dashboard → project page → AI Workspace of exactly that project; brand context is read from Web API v2", async () => {
    const { getProjectBrand, submit, createThread } = renderApp("/");
    await dashboardReady();
    fireEvent.click(within(region("Бренды в работе")).getByRole("link", { name: "Студия керамики «Глина»" }));
    expect(nav.path).toBe(`/projects/${GLINA}`);
    await within(main()).findByRole("heading", { level: 1, name: "Студия керамики «Глина»" });
    expect(getProjectBrand).toHaveBeenCalledWith(GLINA);

    fireEvent.click(within(main()).getByRole("button", { name: "Открыть в AI Workspace" }));
    expect(nav.url).toBe(`/workspace?new=1&project=${GLINA}`);
    await workspaceReady();
    await waitFor(() => expect(projectSelect().value).toBe(GLINA));
    expect(screen.queryByText(/не найден в тестовых данных|не связан с проектами/)).toBeNull();
    // Opening the Workspace sends nothing.
    expect(createThread).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("the project page shows its brand context and opens its own Copilot threads", async () => {
    const { api } = renderApp(`/projects/${ZERNO}`);
    const own = (await api.listThreads(ZERNO)).items.map((t) => t.title);
    await within(main()).findByRole("heading", { level: 1, name: "Кофейня «Зерно»" });
    expect(within(main()).getByText("Екатеринбург, один жилой район")).toBeTruthy();
    expect(within(main()).getByText(/Скопирован из: профиль бренда в Telegram-боте/)).toBeTruthy();
    fireEvent.click(within(main()).getByRole("tab", { name: /Copilot-диалоги/ }));
    const list = within(main()).getByRole("list", { name: /Copilot-диалоги проекта/ });
    expect(within(list).getAllByRole("link").map((a) => a.textContent)).toEqual(own);
    fireEvent.click(within(list).getByRole("link", { name: "Расчёт лидов" }));
    expect(nav.url).toBe(`/workspace?thread=${FIXTURE_IDS.directThreadId}`);
    expect(await screen.findByRole("heading", { level: 1, name: "Расчёт лидов" })).toBeTruthy();
    expect(projectSelect().value).toBe(ZERNO);
  });

  it("Briefing hands over text, brand, scenario and origin; nothing is sent until the user confirms", async () => {
    const { submit, createThread } = renderApp("/");
    await dashboardReady();
    const brand = screen.getByLabelText("Бренд для контекста") as HTMLSelectElement;
    await waitFor(() => expect(brand.value).toBe(ZERNO));
    fireEvent.change(brand, { target: { value: GLINA } });
    fireEvent.click(screen.getByRole("button", { name: "Контент-план" }));
    const input = screen.getByLabelText("Задача для AI") as HTMLTextAreaElement;
    expect(input.value).toContain("«Глина»");
    fireEvent.change(input, { target: { value: `${input.value} Акцент на мастер-классы.` } });
    const text = input.value;
    fireEvent.click(screen.getByRole("button", { name: "Открыть в AI Workspace" }));

    expect(nav.url).toBe(`/workspace?new=1&project=${GLINA}`);
    await workspaceReady();
    await waitFor(() => expect(composer().value).toBe(text));
    expect(projectSelect().value).toBe(GLINA);
    expect(screen.getAllByText("Контент-план").some((el) => el.closest("header"))).toBe(true);
    expect(screen.getByText(/Черновик из раздела/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "«Обзор»" }).getAttribute("href")).toBe("/");
    expect(screen.queryByText(/не найден в тестовых данных|не связан с проектами/)).toBeNull();
    expect(createThread).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();

    // The user confirms: one thread in exactly that project, one request.
    fireEvent.click(sendButton());
    await waitFor(() => expect(nav.url).toMatch(/^\/workspace\?thread=/));
    expect(createThread).toHaveBeenCalledWith(GLINA, expect.objectContaining({ kind: "copilot" }), expect.anything());
    expect(submit).toHaveBeenCalledTimes(1);
    expect((await screen.findAllByText(FIXTURE_LABEL)).length).toBeGreaterThan(0);
  });

  it("the brand chosen on Dashboard stays selected through Projects into a new Workspace conversation", async () => {
    renderApp("/");
    await dashboardReady();
    fireEvent.change(screen.getByLabelText("Бренд для контекста"), { target: { value: GLINA } });
    fireEvent.click(screen.getByRole("link", { name: "Проекты" }));
    await within(main()).findByRole("heading", { name: "Проекты и бренды" });
    expect(screen.getByRole("link", { name: /Студия керамики «Глина» \(выбранный бренд\)/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Новый запрос" }));
    await workspaceReady();
    await waitFor(() => expect(projectSelect().value).toBe(GLINA));
    fireEvent.click(screen.getByRole("link", { name: "Обзор" }));
    await dashboardReady();
    expect((screen.getByLabelText("Бренд для контекста") as HTMLSelectElement).value).toBe(GLINA);
  });

  it("an active request survives leaving the Workspace: no new key, no resend, the state is shown elsewhere", async () => {
    let release: () => void = () => {};
    const gate: Sleep = (_ms, signal) =>
      new Promise((resolve, reject) => {
        release = resolve;
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    const { submit } = renderApp("/workspace?new=1", { pollsUntilDone: 4 }, { sleep: gate });
    await workspaceReady();
    await waitFor(() => expect(projectSelect().value).toBe(ZERNO));
    fireEvent.change(screen.getByLabelText("Тестовый ответ сервера:"), { target: { value: "workflow" } });
    fireEvent.change(composer(), { target: { value: "Разработай стратегию на квартал" } });
    fireEvent.click(sendButton());
    await waitFor(() => expect(nav.url).toMatch(/^\/workspace\?thread=/));
    const threadUrl = nav.url;
    const threadId = threadUrl.slice("/workspace?thread=".length);
    const status = await screen.findByRole("region", { name: "Состояние запроса" });
    await waitFor(() => expect(status.getAttribute("data-state")).toBe("running"));
    const key = (submit.mock.calls[0][1] as { request_key: string }).request_key;

    // Leave to the Dashboard: the thread is listed with its running request, in its project.
    fireEvent.click(screen.getByRole("link", { name: "Обзор" }));
    await dashboardReady();
    const threads = region("Copilot-диалоги");
    const row = within(threads).getByRole("link", { name: "Разработай стратегию на квартал" });
    expect(row.getAttribute("href")).toBe(`/workspace?thread=${threadId}`);
    expect(within(row.closest("li")!).getByText("Запрос выполняется")).toBeTruthy();

    // Back to the thread: the same request is followed by reading; nothing is resent.
    fireEvent.click(row);
    expect(nav.url).toBe(threadUrl);
    for (let i = 0; i < 10 && !screen.queryByRole("article", { name: "Стратегия продвижения" }); i++) {
      await act(async () => release());
    }
    expect(await screen.findByRole("article", { name: "Стратегия продвижения" })).toBeTruthy();
    expect(submit).toHaveBeenCalledTimes(1);
    expect((submit.mock.calls[0][1] as { request_key: string }).request_key).toBe(key);
  });
});

describe("missing, foreign and stale ids", () => {
  it("an unknown project id is «not found», a legacy demo id is explained; no other project is shown", async () => {
    const { getProject } = renderApp(`/projects/${FIXTURE_IDS.foreignProjectId}`);
    expect(await within(main()).findByRole("heading", { name: "Проект не найден" })).toBeTruthy();
    expect(getProject).toHaveBeenCalledWith(FIXTURE_IDS.foreignProjectId);
    expect(within(main()).queryByText("Кофейня «Зерно»")).toBeNull();
    act(() => nav.go("/projects/p-little-feet"));
    expect(await within(main()).findByRole("heading", { name: "Этот проект из старого демо-набора" })).toBeTruthy();
  });

  it("a Workspace link to a missing project leaves the selector empty and blocks sending", async () => {
    const { createThread, submit } = renderApp(`/workspace?new=1&project=${FIXTURE_IDS.foreignProjectId}`);
    await workspaceReady();
    expect(await screen.findByText(/не найден в тестовых данных Web API v2 или у вас нет к нему доступа/)).toBeTruthy();
    expect(projectSelect().value).toBe("");
    fireEvent.change(composer(), { target: { value: "Подготовь пост" } });
    expect(sendButton().disabled).toBe(true);
    expect(createThread).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("stale thread links: legacy ids are explained, unknown ids are «not found», search never links to a phantom thread", async () => {
    const { api } = renderApp("/workspace?thread=t-lf-strategy");
    expect(await screen.findByRole("heading", { name: "Этот диалог из старого демо-набора" })).toBeTruthy();
    act(() => nav.go("/workspace?thread=00000000-0000-4000-8000-000000000000"));
    expect(await screen.findByRole("heading", { name: "Диалог не найден" })).toBeTruthy();

    const search = screen.getAllByRole("combobox")[0];
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "стратег" } });
    const options = await screen.findAllByRole("option");
    const known = new Set((await api.listThreads(ZERNO)).items.map((t) => t.id));
    const threadLinks = options.filter((o) => o.textContent?.includes("Стратегия продвижения на квартал"));
    expect(threadLinks).toHaveLength(1);
    fireEvent.click(threadLinks[0]);
    const id = nav.url.slice("/workspace?thread=".length);
    expect(known.has(id)).toBe(true);
    // Legacy documents stay findable but are labelled as the separate demo dataset.
    fireEvent.change(search, { target: { value: "Little Feet" } });
    expect(await screen.findByText("Документы (демо-набор)")).toBeTruthy();
    expect(screen.queryByText("Copilot-диалоги", { selector: "div" })).toBeNull();
  });
});

describe("permissions and isolation", () => {
  it("viewer: read-only everywhere, the Workspace explains why nothing can be sent", async () => {
    const { createThread, submit } = renderApp(`/projects/${ZERNO}`, { viewer: "viewer_member" });
    await within(main()).findByRole("heading", { level: 1, name: "Кофейня «Зерно»" });
    expect(within(main()).getByText(/Наблюдатель · только просмотр/)).toBeTruthy();
    fireEvent.click(within(main()).getByRole("button", { name: "Открыть в AI Workspace" }));
    await workspaceReady();
    await waitFor(() => expect(projectSelect().value).toBe(ZERNO));
    fireEvent.change(composer(), { target: { value: "Подготовь пост" } });
    expect(sendButton().disabled).toBe(true);
    expect(screen.getAllByText(/наблюдатель: отправлять запросы нельзя/).length).toBeGreaterThan(0);
    act(() => nav.go("/"));
    await dashboardReady();
    expect(within(screen.getByLabelText("Бренд для контекста")).getAllByRole("option").map((o) => o.textContent)).toContain("Кофейня «Зерно» · только просмотр");
    expect(createThread).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("threads and results of one project never show up in another", async () => {
    const { api } = renderApp(`/workspace?new=1&project=${GLINA}`);
    const zernoCount = (await api.listThreads(ZERNO)).items.length;
    await workspaceReady();
    await waitFor(() => expect(projectSelect().value).toBe(GLINA));
    fireEvent.change(composer(), { target: { value: "Рассчитай лиды для мастер-классов" } });
    fireEvent.click(sendButton());
    await waitFor(() => expect(nav.url).toMatch(/^\/workspace\?thread=/));
    await screen.findByRole("article", { name: "Расчёт" });

    act(() => nav.go(`/projects/${GLINA}`));
    await within(main()).findByRole("heading", { level: 1, name: "Студия керамики «Глина»" });
    fireEvent.click(within(main()).getByRole("tab", { name: /Copilot-диалоги/ }));
    expect(within(within(main()).getByRole("list", { name: /Copilot-диалоги проекта/ })).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Рассчитай лиды для мастер-классов",
    ]);

    act(() => nav.go(`/projects/${ZERNO}`));
    await within(main()).findByRole("heading", { level: 1, name: "Кофейня «Зерно»" });
    fireEvent.click(within(main()).getByRole("tab", { name: /Copilot-диалоги/ }));
    const zerno = within(within(main()).getByRole("list", { name: /Copilot-диалоги проекта/ })).getAllByRole("link").map((a) => a.textContent);
    expect(zerno).toHaveLength(zernoCount);
    expect(zerno).not.toContain("Рассчитай лиды для мастер-классов");

    // Dashboard: the brand filter shows only the selected brand's threads.
    act(() => nav.go("/"));
    await dashboardReady();
    expect((screen.getByLabelText("Бренд для контекста") as HTMLSelectElement).value).toBe(ZERNO);
    expect(within(region("Copilot-диалоги")).queryByRole("link", { name: "Рассчитай лиды для мастер-классов" })).toBeNull();
  });
});

describe("no simulated persistence, no network", () => {
  it("project creation and editing are unavailable and explained; old create links do not open a form", async () => {
    renderApp("/projects?create=1");
    await within(main()).findByRole("heading", { name: "Проекты и бренды" });
    const create = within(main()).getByRole("button", { name: "Новый проект" }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect(document.getElementById(create.getAttribute("aria-describedby")!)?.textContent).toMatch(/только читаются/);
    expect(await screen.findByText("Создание проектов пока недоступно")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(nav.url).toBe("/projects");

    act(() => nav.go(`/projects/${ZERNO}`));
    await within(main()).findByRole("heading", { level: 1, name: "Кофейня «Зерно»" });
    expect((within(main()).getByRole("button", { name: "Редактировать контекст" }) as HTMLButtonElement).disabled).toBe(true);
    // Documents are explicitly not linked to Web API v2 projects.
    fireEvent.click(within(main()).getByRole("tab", { name: "Документы" }));
    expect(within(main()).getByRole("heading", { name: "Документы пока не связаны с проектами" })).toBeTruthy();
  });

  it("walking through every screen makes no network request and calls no AI", async () => {
    const { submit } = renderApp("/");
    await dashboardReady();
    for (const url of ["/projects", `/projects/${ZERNO}`, `/workspace?new=1&project=${ZERNO}`, `/workspace?thread=${FIXTURE_IDS.strategyThreadId}`, "/documents", "/"]) {
      act(() => nav.go(url));
      await waitFor(() => expect(main().textContent?.length).toBeGreaterThan(0));
    }
    await dashboardReady();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
});

describe("real app providers", () => {
  it("the session uses ONE FixtureWebApiV2Client instance for Dashboard, project pages and the Workspace", async () => {
    const { AppProviders } = await import("@/components/AppProviders");
    const instances = new Set<unknown>();
    const record = <K extends "listOrganizations" | "getProject" | "listThreads">(method: K) => {
      const original = FixtureWebApiV2Client.prototype[method] as (...args: unknown[]) => Promise<unknown>;
      return vi.spyOn(FixtureWebApiV2Client.prototype, method).mockImplementation(function (this: FixtureWebApiV2Client, ...args: unknown[]) {
        instances.add(this);
        return original.apply(this, args);
      } as never);
    };
    const spies = [record("listOrganizations"), record("getProject"), record("listThreads")];
    try {
      nav.set("/");
      render(
        <AppProviders>
          <App />
        </AppProviders>,
      );
      await dashboardReady();
      fireEvent.click(within(region("Бренды в работе")).getByRole("link", { name: "Кофейня «Зерно»" }));
      await within(main()).findByRole("heading", { level: 1, name: "Кофейня «Зерно»" });
      fireEvent.click(within(main()).getByRole("button", { name: "Открыть в AI Workspace" }));
      await workspaceReady();
      await waitFor(() => expect(projectSelect().value).toBe(ZERNO));
      expect(instances.size).toBe(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});
