// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { FIXTURE_IDS } from "@/lib/api/v2/fixtures";
import { FixtureWebApiV2Client, type FixtureClientOptions } from "@/lib/api/v2/fixture-client";
import { MemoryPendingRequestStore, type Sleep } from "@/lib/api/v2/requests";
import { AppTestProviders } from "@/features/testing/AppTestProviders";
import { useWorkspace } from "./store";
import { WorkspaceV2Controller } from "./v2/controller";
import { FIXTURE_LABEL } from "./v2/simulation";
import { WorkspaceView } from "./WorkspaceView";

/* ---------- next/navigation: a tiny in-memory router ---------- */
const nav = vi.hoisted(() => {
  let search = "";
  const listeners = new Set<() => void>();
  const go = (url: string) => {
    search = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
    listeners.forEach((l) => l());
  };
  return {
    get search() {
      return search;
    },
    set(url: string) {
      search = url;
    },
    go,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    router: { push: vi.fn((url: string) => go(url)), replace: vi.fn((url: string) => go(url)), back: vi.fn(), prefetch: vi.fn() },
  };
});

vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useRouter: () => nav.router,
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(nav.subscribe, () => nav.search, () => nav.search)),
    usePathname: () => "/workspace",
  };
});

beforeAll(() => {
  // jsdom has no modal dialog implementation.
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const noSleep: Sleep = async (_ms, signal) => {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
};

function DraftFrom({ draft }: { draft?: { projectId: string | null; text: string } }) {
  const { prepareDraft, pendingDraft } = useWorkspace();
  return draft && !pendingDraft ? (
    <button type="button" onClick={() => prepareDraft({ ...draft, scenarioId: null })}>
      prepare-draft
    </button>
  ) : null;
}

function renderWorkspace(url: string, options: FixtureClientOptions = {}, extra: { sleep?: Sleep; draft?: { projectId: string | null; text: string } } = {}) {
  nav.set(url.replace(/^\/workspace\??/, ""));
  const api = new FixtureWebApiV2Client(options);
  const submit = vi.spyOn(api, "submitMessage");
  const recover = vi.spyOn(api, "getRequestByKey");
  const getMessage = vi.spyOn(api, "getMessage");
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
  const wrap = (children: ReactNode) => (
    <AppTestProviders api={api} controller={controller}>
      {children}
    </AppTestProviders>
  );
  const view = render(
    wrap(
      <>
        <DraftFrom draft={extra.draft} />
        <WorkspaceView />
      </>,
    ),
  );
  return { api, controller, submit, recover, getMessage, view };
}

const composer = () => screen.getByLabelText("Сообщение для AI") as HTMLTextAreaElement;
const sendButton = () => screen.getByRole("button", { name: "Отправить" });
const answerSelect = () => screen.getByLabelText("Тестовый ответ сервера:") as HTMLSelectElement;
const projectSelect = () => screen.getByLabelText("Проект для запроса") as HTMLSelectElement;

async function ready() {
  await screen.findByRole("heading", { name: /С чего начнём|Новый диалог/ }, { timeout: 3000 }).catch(() => undefined);
  await waitFor(() => expect(screen.queryAllByLabelText("Загрузка диалогов")).toHaveLength(0));
}

async function sendNew(text: string, answer: string) {
  await ready();
  await waitFor(() => expect(projectSelect().value).toBe(FIXTURE_IDS.projectId));
  fireEvent.change(answerSelect(), { target: { value: answer } });
  fireEvent.change(composer(), { target: { value: text } });
  fireEvent.click(sendButton());
  await waitFor(() => expect(nav.search).toMatch(/^thread=/));
  return nav.search.slice("thread=".length);
}

describe("AI Workspace on Web API v2 fixtures", () => {
  it("shows fixture projects and threads; the thread list does not load message history", async () => {
    const { api } = renderWorkspace("/workspace?new=1");
    const messages = vi.spyOn(api, "listThreadMessages");
    await ready();
    await waitFor(() => expect(projectSelect().value).toBe(FIXTURE_IDS.projectId));
    expect(within(projectSelect()).getAllByRole("option").map((o) => o.textContent)).toEqual(["Выберите проект", "Кофейня «Зерно»", "Студия керамики «Глина»"]);
    expect(screen.getAllByRole("link", { name: /Расчёт лидов/ }).length).toBeGreaterThan(0);
    expect(messages).not.toHaveBeenCalled();
    expect(screen.getByText(/AI не подключён, данные сбрасываются при перезагрузке/)).toBeTruthy();
  });

  it("project selection → new copilot thread → request → DIRECT_RESULT labelled as test data", async () => {
    const { submit, api } = renderWorkspace("/workspace?new=1");
    const create = vi.spyOn(api, "createThread");
    await ready();
    await waitFor(() => expect(projectSelect().value).toBe(FIXTURE_IDS.projectId));
    fireEvent.change(projectSelect(), { target: { value: "368e72ce-4e3c-5ac8-85aa-91145dd9603c" } });
    fireEvent.change(composer(), { target: { value: "Рассчитай лиды при бюджете 10000 ₽" } });
    fireEvent.click(sendButton());
    await waitFor(() => expect(nav.search).toMatch(/^thread=/));
    expect(create).toHaveBeenCalledWith("368e72ce-4e3c-5ac8-85aa-91145dd9603c", expect.objectContaining({ kind: "copilot" }), expect.anything());
    const card = await screen.findByRole("article", { name: "Расчёт" });
    expect(within(card).getByText(FIXTURE_LABEL)).toBeTruthy();
    expect(submit).toHaveBeenCalledTimes(1);
    // Technical stored/provenance fields are not part of the main content.
    expect(card.textContent).not.toMatch(/sha256|payload_sha|w-[0-9a-f]{8}/);
  });

  it("MODULE_RESULT", async () => {
    renderWorkspace("/workspace?new=1");
    await sendNew("Напиши пост о сезонном меню", "module_result");
    expect(await screen.findByRole("article", { name: "Публикация" })).toBeTruthy();
  });

  it("WORKFLOW_STARTED: shows progress while polling, then the result", async () => {
    let release: () => void = () => {};
    const gate: Sleep = (_ms, signal) =>
      new Promise((resolve, reject) => {
        release = resolve;
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    const { getMessage } = renderWorkspace("/workspace?new=1", { pollsUntilDone: 3 }, { sleep: gate });
    await sendNew("Разработай стратегию", "workflow");
    const status = await screen.findByRole("region", { name: "Состояние запроса" });
    await waitFor(() => expect(status.getAttribute("data-state")).toBe("running"));
    expect(within(status).getByRole("button", { name: "Перестать ждать" })).toBeTruthy();
    expect(composer().getAttribute("aria-describedby")).toContain("workspace-composer-reason");
    for (let i = 0; i < 5 && !screen.queryByRole("article", { name: "Стратегия продвижения" }); i++) {
      await act(async () => release());
    }
    expect(await screen.findByRole("article", { name: "Стратегия продвижения" })).toBeTruthy();
    expect(getMessage.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("NEEDS_INPUT: clarification form answers with the same key and revision 2", async () => {
    const { submit } = renderWorkspace("/workspace?new=1");
    await sendNew("Сформулируй позиционирование кофейни", "needs_input");
    const form = await screen.findByRole("form", { name: "Ответ на уточнение" });
    fireEvent.change(within(form).getByLabelText("С чем вас сравнивают клиенты"), { target: { value: "Сетевая кофейня" } });
    fireEvent.click(within(form).getByRole("checkbox", { name: /свежей обжаркой/ }));
    fireEvent.click(within(form).getByRole("button", { name: "Ответить на уточнение" }));
    await screen.findByText(/Уточнение к запросу · версия 2/);
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1][1]).toMatchObject({ request_key: submit.mock.calls[0][1].request_key, revision: 2, message: "Сформулируй позиционирование кофейни" });
    expect(screen.queryByRole("form", { name: "Ответ на уточнение" })).toBeNull();
  });

  it("failed / blocked show the reason and only a warned new request", async () => {
    renderWorkspace("/workspace?new=1", { pollsUntilDone: 1 });
    await sendNew("Разработай стратегию", "workflow_blocked");
    const status = await screen.findByRole("region", { name: "Состояние запроса" });
    await waitFor(() => expect(status.getAttribute("data-state")).toBe("blocked"));
    expect(within(status).getByText("Не хватает данных")).toBeTruthy();
    expect(within(status).getByRole("button", { name: "Начать новый запрос…" })).toBeTruthy();
    expect(within(status).queryByRole("button", { name: "Отправить тот же запрос" })).toBeNull();
  });

  it("ambiguous: explained, no automatic retry; new request only after explicit confirmation", async () => {
    const { submit } = renderWorkspace("/workspace?new=1");
    const id = await sendNew("Проанализируй конкурента", "ambiguous");
    const status = await screen.findByRole("region", { name: "Состояние запроса" });
    expect(within(status).getByText("Исход неизвестен")).toBeTruthy();
    expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(status).getByRole("button", { name: "Начать новый запрос…" }));
    const dialog = await screen.findByRole("dialog", { name: "Начать новый запрос?" });
    const confirm = within(dialog).getByRole("button", { name: "Начать новый запрос" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(submit).toHaveBeenCalledTimes(1);
    fireEvent.change(answerSelect(), { target: { value: "direct_result" } });
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(confirm);
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(submit.mock.calls[1][1].request_key).not.toBe(submit.mock.calls[0][1].request_key);
    expect(nav.search).toBe(`thread=${id}`);
  });

  it("expired (seeded): explained without resubmission", async () => {
    const { submit } = renderWorkspace("/workspace?thread=600e47c6-40b2-5f64-b626-0c893bf4ad86");
    const status = await screen.findByRole("region", { name: "Состояние запроса" });
    await waitFor(() => expect(status.getAttribute("data-state")).toBe("expired"));
    expect(within(status).getByText(/не успел сохраниться до истечения срока хранения. Повторной генерации не будет/)).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it("503 with successful recovery: result shown, POST sent once", async () => {
    const { submit, recover } = renderWorkspace("/workspace?new=1");
    await sendNew("Рассчитай лиды", "unavailable_after_admission");
    expect(await screen.findByRole("article", { name: "Расчёт" })).toBeTruthy();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it("503 with undetermined recovery: unresolved, sending blocked, 'check status' only reads", async () => {
    const { submit, recover } = renderWorkspace("/workspace?new=1", { readOutages: 1 });
    await sendNew("Рассчитай лиды", "unavailable_after_admission");
    const status = await screen.findByRole("region", { name: "Состояние запроса" });
    await waitFor(() => expect(status.getAttribute("data-phase")).toBe("unknown"));
    expect(within(status).getByText(/статус пока прочитать не удалось/)).toBeTruthy();
    expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(status).getByRole("button", { name: "Проверить статус" }));
    expect(await screen.findByRole("article", { name: "Расчёт" })).toBeTruthy();
    expect(recover).toHaveBeenCalledTimes(2);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("404 on recovery: no automatic retry, original text kept, no new key without confirmation", async () => {
    const { submit } = renderWorkspace("/workspace?new=1");
    await sendNew("Рассчитай лиды при бюджете 10000", "unavailable_before_admission");
    const status = await screen.findByRole("region", { name: "Состояние запроса" });
    await waitFor(() => expect(status.getAttribute("data-phase")).toBe("unknown"));
    expect(within(status).getByText(/не доказывает, что генерация не запускалась/)).toBeTruthy();
    expect(within(status).getByText("Запрос: «Рассчитай лиды при бюджете 10000»")).toBeTruthy();
    fireEvent.click(within(status).getByRole("button", { name: "Проверить статус" }));
    await waitFor(() => expect(status.getAttribute("data-phase")).toBe("unknown"));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("double submit: two quick clicks send one request", async () => {
    const { submit } = renderWorkspace("/workspace?new=1");
    await ready();
    await waitFor(() => expect(projectSelect().value).toBe(FIXTURE_IDS.projectId));
    fireEvent.change(composer(), { target: { value: "Рассчитай лиды" } });
    fireEvent.click(sendButton());
    fireEvent.click(sendButton());
    fireEvent.keyDown(composer(), { key: "Enter" });
    await screen.findByRole("article", { name: "Расчёт" });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("leaving the page stops waiting without cancelling the request", async () => {
    const neverEnding: Sleep = (_ms, signal) =>
      new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
    const { view, getMessage, api } = renderWorkspace("/workspace?new=1", { pollsUntilDone: 10 }, { sleep: neverEnding });
    const id = await sendNew("Разработай стратегию", "workflow");
    await waitFor(() => expect(screen.getByRole("region", { name: "Состояние запроса" }).getAttribute("data-state")).toBe("running"));
    const reads = getMessage.mock.calls.length;
    view.unmount();
    await new Promise((r) => setTimeout(r, 10));
    expect(getMessage.mock.calls.length).toBe(reads);
    expect((await api.getThread(id)).in_flight).not.toBeNull();
  });

  it("opens a stored snapshot from history and shows unavailable results as their own state", async () => {
    const { api } = renderWorkspace(`/workspace?thread=${FIXTURE_IDS.strategyThreadId}`);
    const result = vi.spyOn(api, "getMessageResult");
    const card = await screen.findByRole("article", { name: "Стратегия продвижения" });
    fireEvent.click(within(card).getByRole("button", { name: "Открыть сохранённый результат" }));
    await waitFor(() => expect(result).toHaveBeenCalledWith(FIXTURE_IDS.strategyAssistantMessageId));

    act(() => nav.go(`/workspace?thread=${FIXTURE_IDS.formatUnsupportedThreadId}`));
    expect(await screen.findByRole("article", { name: "Формат результата не поддерживается" })).toBeTruthy();
  });

  it("viewer role: sending is disabled and explained", async () => {
    const { submit } = renderWorkspace(`/workspace?thread=${FIXTURE_IDS.strategyThreadId}`, { viewer: "viewer_member" });
    await screen.findByRole("article", { name: "Стратегия продвижения" });
    fireEvent.change(composer(), { target: { value: "Ещё запрос" } });
    expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/роль в проекте — наблюдатель/)).toBeTruthy();
    fireEvent.keyDown(composer(), { key: "Enter" });
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText(/Автор запроса: Мария$/)).toBeTruthy();
  });

  it("links to legacy demo threads are explained, not silently redirected", async () => {
    renderWorkspace("/workspace?thread=t-lf-strategy");
    expect(await screen.findByRole("heading", { name: "Этот диалог из старого демо-набора" })).toBeTruthy();
  });

  it("a draft for a legacy project id is not sent to another project", async () => {
    const { submit } = renderWorkspace("/workspace?new=1", {}, { draft: { projectId: "p-little-feet", text: "Контент-план на неделю" } });
    await ready();
    fireEvent.click(await screen.findByRole("button", { name: "prepare-draft" }));
    await screen.findByText(/из демо-набора документов не связан с проектами тестовых данных Web API v2/);
    expect(composer().value).toBe("Контент-план на неделю");
    expect(projectSelect().value).toBe("");
    expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(composer(), { key: "Enter" });
    expect(submit).not.toHaveBeenCalled();
  });
});

describe("request state visibility", () => {
  it("429 quota: explained with the reset time, nothing admitted, sending stays possible", async () => {
    const { submit, api } = renderWorkspace("/workspace?new=1");
    await sendNew("Разработай стратегию", "quota_exceeded");
    const status = await screen.findByRole("region", { name: "Состояние запроса" });
    await waitFor(() => expect(status.getAttribute("data-phase")).toBe("rejected"));
    expect(within(status).getByText("Запрос не принят")).toBeTruthy();
    expect(within(status).getByText(/Достигнут дневной лимит генераций\. Ничего не было запущено\./)).toBeTruthy();
    expect(within(status).getByText(/Лимит обновится/)).toBeTruthy();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(api.stats.simulatedCoreAdmissions).toBe(0);
    fireEvent.change(composer(), { target: { value: "Позже" } });
    expect((sendButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("unconfirmed outcome: thread is marked in the history list and support details appear only then", async () => {
    renderWorkspace("/workspace?new=1", { readOutages: 1 });
    const id = await sendNew("Рассчитай лиды", "unavailable_after_admission");
    const status = await screen.findByRole("region", { name: "Состояние запроса" });
    await waitFor(() => expect(status.getAttribute("data-phase")).toBe("unknown"));
    const link = screen.getAllByRole("link").find((a) => a.getAttribute("href") === `/workspace?thread=${id}`)!;
    expect(within(link).getByText("Исход запроса не подтверждён")).toBeTruthy();
    expect(within(status).getByText("Данные для поддержки")).toBeTruthy();

    fireEvent.click(within(status).getByRole("button", { name: "Проверить статус" }));
    await screen.findByRole("article", { name: "Расчёт" });
    expect(within(link).queryByText("Исход запроса не подтверждён")).toBeNull();
    expect(screen.queryByText("Данные для поддержки")).toBeNull();
  });

  it("a running request shows progress without technical identifiers", async () => {
    const neverEnding: Sleep = (_ms, signal) =>
      new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
    const { controller } = renderWorkspace("/workspace?new=1", { pollsUntilDone: 10 }, { sleep: neverEnding });
    const id = await sendNew("Разработай стратегию", "workflow");
    const status = await screen.findByRole("region", { name: "Состояние запроса" });
    await waitFor(() => expect(status.getAttribute("data-state")).toBe("running"));
    expect(within(status).queryByText("Данные для поддержки")).toBeNull();
    expect(status.textContent).not.toMatch(/w-[0-9a-f]{8}-/);
    const link = screen.getAllByRole("link").find((a) => a.getAttribute("href") === `/workspace?thread=${id}`)!;
    expect(within(link).getByText("Запрос выполняется")).toBeTruthy();
    controller.dispose();
  });
});
