// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ApiProvider } from "@/lib/api/provider";
import { ToastProvider } from "@/components/ui/Toast";
import { presentAssistantMessage, presentSnapshot } from "@/lib/api/v2/presenters";
import { fixtures } from "@/lib/api/v2/fixtures";
import type { AssistantMessage } from "@/lib/api/v2/types";
import { ContractDemoPanel } from "../components/ContractDemoPanel";
import { ContractResultCard, DEMO_RESULT_LABEL } from "../components/ContractResultCard";
import { demoCases } from "./cases";
import { runDemoCase } from "./run";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const instant = async () => {};

describe("demo scenarios", () => {
  it.each(demoCases.map((c) => [c.id] as const))("%s runs without any network access", async (id) => {
    const fetchSpy = vi.fn(() => {
      throw new Error("no network in demo");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const run = await runDemoCase(id, { sleep: instant });
    expect(run.steps.length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    // One request at most ever reaches the (simulated) core: nothing is regenerated automatically.
    expect(run.simulatedCoreAdmissions).toBeLessThanOrEqual(id === "needs-input" ? 2 : 1);
  });

  it("covers the key states end to end", async () => {
    const last = async (id: Parameters<typeof runDemoCase>[0]) => (await runDemoCase(id, { sleep: instant })).steps.at(-1)!;
    expect((await last("workflow")).execution?.status).toBe("completed");
    expect((await last("needs-input")).execution).toMatchObject({ status: "completed", revision: 2 });
    expect((await last("ambiguous")).execution).toMatchObject({ status: "ambiguous", offersNewRequest: true });
    expect((await last("unavailable")).execution?.status).toBe("completed");
    expect((await last("quota")).error).toMatchObject({ code: "quota_exceeded", status: 429 });
    expect((await last("stale-pending")).execution).toMatchObject({ status: "expired", canResubmitSameKey: false });
    expect((await last("foreign")).error).toMatchObject({ code: "not_found", status: 404 });
    expect((await last("viewer")).error).toMatchObject({ code: "forbidden", status: 403 });
    const unavailable = await runDemoCase("unavailable", { sleep: instant });
    expect(unavailable.submitCalls).toBe(1);
    const unreadable = await runDemoCase("unreadable", { sleep: instant });
    expect(unreadable.steps.map((s) => s.result?.status)).toEqual(["format_unsupported", "corrupted", "unreadable"]);
  });
});

describe("demo results are labelled as test data", () => {
  it("an available result shows the label, presentation content and separate metadata", () => {
    render(<ContractResultCard view={presentSnapshot(fixtures.responses.resultSnapshotRunOtherMember())} />);
    const card = screen.getByRole("article");
    expect(within(card).getByText(DEMO_RESULT_LABEL)).toBeTruthy();
    expect(within(card).getByText("Стратегия продвижения")).toBeTruthy();
    expect(within(card).getByText(/copilot_api\.v1 · sha256/)).toBeTruthy();
    expect(within(card).queryByText(/\(вы\)/)).toBeNull(); // other member: not "you"
    // Not presented as an actionable AI result.
    expect(within(card).queryByRole("button")).toBeNull();
  });

  it("unavailable snapshots render dedicated states, never content", () => {
    const am = fixtures.responses.threadMessagesFormatUnsupported().items.find((m): m is AssistantMessage => m.role === "assistant")!;
    for (const status of ["format_unsupported", "corrupted", "unreadable"] as const) {
      const { container, unmount } = render(<ContractResultCard view={presentAssistantMessage({ ...am, result_status: status })} />);
      expect(container.querySelector(`[data-result-status="${status}"]`)).toBeTruthy();
      expect(screen.getByText(DEMO_RESULT_LABEL)).toBeTruthy();
      unmount();
    }
  });

  it("the Settings panel states the mock-only mode and runs an example in memory", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("no network");
    });
    vi.stubGlobal("fetch", fetchSpy);
    render(
      <ToastProvider>
        <ApiProvider>
          <ContractDemoPanel />
        </ApiProvider>
      </ToastProvider>,
    );
    expect(screen.getByText(/Режим: тестовые данные \(fixture\)/)).toBeTruthy();
    expect(screen.getByText("HTTP-режим не подключён")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Показать пример" }));
    expect(await screen.findByText(DEMO_RESULT_LABEL)).toBeTruthy();
    expect(await screen.findByText(/сетевых запросов — 0/)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
