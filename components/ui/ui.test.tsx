// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Tabs, TabPanel, useTabsId } from "./Tabs";
import { SegmentedControl } from "./SegmentedControl";
import { Field, Input, SearchField } from "./Form";
import { EmptyState, ErrorState } from "./States";
import { FolderPlus } from "lucide-react";

afterEach(cleanup);

function TabsHarness() {
  const id = useTabsId();
  const [value, setValue] = useState<"a" | "b" | "c">("a");
  return (
    <>
      <Tabs
        label="Разделы"
        idBase={id}
        value={value}
        onChange={setValue}
        items={[
          { id: "a", label: "Первый" },
          { id: "b", label: "Второй", count: 3 },
          { id: "c", label: "Третий" },
        ]}
      />
      <TabPanel idBase={id} tab={value}>
        Панель {value}
      </TabPanel>
    </>
  );
}

describe("Tabs", () => {
  it("supports arrow keys, Home/End and links panels to tabs", () => {
    render(<TabsHarness />);
    const first = screen.getByRole("tab", { name: "Первый" });
    expect(first.getAttribute("aria-selected")).toBe("true");
    expect(first.tabIndex).toBe(0);

    fireEvent.keyDown(first, { key: "ArrowRight" });
    const second = screen.getByRole("tab", { name: /Второй/ });
    expect(second.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(second);

    fireEvent.keyDown(second, { key: "End" });
    expect(screen.getByRole("tab", { name: "Третий" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(screen.getByRole("tab", { name: "Третий" }), { key: "ArrowRight" });
    expect(first.getAttribute("aria-selected")).toBe("true");

    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe(first.id);
  });
});

describe("SegmentedControl", () => {
  it("is a radio group that reports changes and respects disabled options", () => {
    function Harness() {
      const [v, setV] = useState("light");
      return (
        <>
          <SegmentedControl
            legend="Тема"
            value={v}
            onChange={setV}
            options={[
              { value: "light", label: "Светлая" },
              { value: "dark", label: "Тёмная", disabled: true },
              { value: "compact", label: "Компактная" },
            ]}
          />
          <output>{v}</output>
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByRole("group", { name: "Тема" })).toBeTruthy();
    expect((screen.getByRole("radio", { name: "Тёмная" }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Компактная" }));
    expect(screen.getByRole("status").textContent).toBe("compact");
  });
});

describe("Form primitives", () => {
  it("wires label, error and aria-invalid", () => {
    render(<Field label="Название" error="Обязательное поле">{(p) => <Input {...p} />}</Field>);
    const input = screen.getByLabelText("Название");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toContain("Обязательное поле");
  });

  it("clears the search with the button and Escape", () => {
    function Harness() {
      const [q, setQ] = useState("бранч");
      return <SearchField label="Поиск" value={q} onValueChange={setQ} />;
    }
    render(<Harness />);
    const input = screen.getByRole("searchbox", { name: "Поиск" }) as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "Очистить поиск" }));
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "абв" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
  });
});

describe("States", () => {
  it("renders empty and error states with actions", () => {
    let retried = false;
    render(
      <>
        <EmptyState icon={FolderPlus} title="Пусто" description="Нет данных" action={<button>Создать</button>} />
        <ErrorState onRetry={() => (retried = true)} />
      </>,
    );
    expect(screen.getByRole("heading", { name: "Пусто" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Не удалось загрузить данные");
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(retried).toBe(true);
  });
});
