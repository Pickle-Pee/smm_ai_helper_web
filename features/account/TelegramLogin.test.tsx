// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtures } from "@/lib/api/v2/fixtures";
import { TelegramLogin } from "./TelegramLogin";

const { replace, router } = vi.hoisted(() => {
  const replace = vi.fn();
  return { replace, router: { replace } };
});
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const token = "A".repeat(43);
const code = "B".repeat(22);
const response = (status: number, value: unknown) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

describe("Telegram browser login", () => {
  const fetch = vi.fn();

  beforeEach(() => {
    fetch.mockReset();
    replace.mockReset();
    vi.stubGlobal("fetch", fetch);
    window.history.replaceState(null, "", `/auth/telegram#t=${token}`);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("scrubs the fragment, requires a user action, and verifies the exchanged cookie", async () => {
    fetch
      .mockResolvedValueOnce(response(200, {
        schema_version: "web_api.v2", confirmation_code: code, expires_at: new Date(Date.now() + 60_000).toISOString(),
      }))
      .mockResolvedValueOnce(response(401, fixtures.errors.loginTokenInvalid()))
      .mockResolvedValueOnce(response(200, fixtures.responses.authExchange()))
      .mockResolvedValueOnce(response(200, fixtures.responses.me()));

    render(<StrictMode><TelegramLogin /></StrictMode>);
    expect(window.location.hash).toBe("");
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Получить код" }));
    await screen.findByText(`/confirm ${code}`);
    expect(fetch.mock.calls[0][0]).toBe("/api/v2/auth/telegram/challenge");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ token });
    expect(fetch.mock.calls[0][1].headers["X-CSRF-Token"]).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: "Войти" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Бот ещё не подтвердил");
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Войти" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      "/api/v2/auth/telegram/challenge", "/api/v2/auth/telegram/exchange", "/api/v2/auth/telegram/exchange", "/api/v2/me",
    ]);
  });

  it("restores a session when arriving without a login link", async () => {
    window.history.replaceState(null, "", "/auth/telegram");
    fetch.mockResolvedValueOnce(response(200, fixtures.responses.me()));
    render(<TelegramLogin />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(fetch.mock.calls.map(([path]) => path)).toEqual(["/api/v2/me"]);
  });

  it("requires a new link when the challenge response is lost", async () => {
    fetch.mockRejectedValueOnce(new Error("offline"));
    render(<TelegramLogin />);
    fireEvent.click(screen.getByRole("button", { name: "Получить код" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Запросите новую ссылку");
    expect(screen.queryByRole("button", { name: "Получить код" })).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
