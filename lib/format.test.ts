import { describe, expect, it } from "vitest";
import { applyDemoView } from "./resource";
import { dayBucket, formatFileSize, formatRelative, initials, pluralize, quoted } from "./format";
import { createMockApiClient } from "./api/mock-client";

describe("pluralize", () => {
  const forms = ["диалог", "диалога", "диалогов"] as const;
  it.each([
    [1, "диалог"],
    [2, "диалога"],
    [5, "диалогов"],
    [11, "диалогов"],
    [12, "диалогов"],
    [21, "диалог"],
    [22, "диалога"],
    [111, "диалогов"],
  ])("%i → %s", (n, expected) => {
    expect(pluralize(n, forms)).toBe(expected);
  });
});

describe("formatRelative", () => {
  const now = new Date(2026, 10, 13, 15, 0);
  it("handles recent, today, yesterday and older dates", () => {
    expect(formatRelative(new Date(2026, 10, 13, 14, 59, 40).toISOString(), now)).toBe("только что");
    expect(formatRelative(new Date(2026, 10, 13, 14, 48).toISOString(), now)).toBe("12 мин назад");
    expect(formatRelative(new Date(2026, 10, 13, 9, 5).toISOString(), now)).toBe("сегодня, 09:05");
    expect(formatRelative(new Date(2026, 10, 12, 18, 30).toISOString(), now)).toBe("вчера, 18:30");
    expect(formatRelative(new Date(2026, 10, 1).toISOString(), now)).toBe("1 ноября");
    expect(formatRelative(new Date(2025, 0, 5).toISOString(), now)).toMatch(/2025/);
  });

  it("buckets days for the thread list", () => {
    expect(dayBucket(new Date(2026, 10, 13, 1).toISOString(), now)).toBe("today");
    expect(dayBucket(new Date(2026, 10, 12, 23).toISOString(), now)).toBe("yesterday");
    expect(dayBucket(new Date(2026, 10, 9).toISOString(), now)).toBe("week");
    expect(dayBucket(new Date(2026, 9, 1).toISOString(), now)).toBe("earlier");
  });
});

describe("misc helpers", () => {
  it("formats file sizes in Russian units", () => {
    expect(formatFileSize(84)).toBe("84 КБ");
    expect(formatFileSize(1_480)).toBe("1,4 МБ");
    expect(formatFileSize(24_600)).toBe("24 МБ");
  });

  it("builds initials from brand names", () => {
    expect(initials("Little Feet")).toBe("LF");
    expect(initials("Демо-агентство «Сигнал»")).toBe("ДА");
    expect(initials("Форма")).toBe("ФО");
  });

  it("quotes names once", () => {
    expect(quoted("Си Батом")).toBe("«Си Батом»");
    expect(quoted("Кофейня «Зерно»")).toBe("Кофейня «Зерно»");
  });
});

describe("applyDemoView", () => {
  const items = [1, 2, 3];
  it("passes data through in live mode and overrides otherwise", () => {
    expect(applyDemoView("live", "ready", items)).toEqual({ status: "ready", items });
    expect(applyDemoView("loading", "ready", items)).toEqual({ status: "loading", items: [] });
    expect(applyDemoView("error", "ready", items)).toEqual({ status: "error", items: [] });
    expect(applyDemoView("empty", "ready", items)).toEqual({ status: "ready", items: [] });
  });
});

describe("mock API client", () => {
  it("is labelled as mock and returns independent copies", async () => {
    const api = createMockApiClient(() => new Date("2026-11-13T10:00:00Z"));
    expect(api.mode).toBe("mock");
    const first = await api.projects.list();
    first[0].name = "changed";
    const second = await api.projects.list();
    expect(second[0].name).toBe("Little Feet");
  });
});
