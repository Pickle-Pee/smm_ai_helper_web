"use client";

import { useId, useRef, type HTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./Tabs.module.css";

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  count?: number;
}

export interface TabsProps<T extends string> {
  label: string;
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Shared with <TabPanel idBase>; create with useTabsId(). */
  idBase: string;
  className?: string;
}

export function useTabsId(): string {
  return useId();
}

const tabId = (base: string, id: string) => `${base}-tab-${id}`;
const panelId = (base: string, id: string) => `${base}-panel-${id}`;

/** ARIA tabs with roving focus: ←/→ move, Home/End jump. Selection follows focus. */
export function Tabs<T extends string>({ label, items, value, onChange, idBase, className }: TabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    if (next === null) return;
    event.preventDefault();
    onChange(items[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className={cx(styles.list, className)}>
      {items.map((item, index) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            role="tab"
            type="button"
            id={tabId(idBase, item.id)}
            aria-selected={selected}
            aria-controls={panelId(idBase, item.id)}
            tabIndex={selected ? 0 : -1}
            className={styles.tab}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
          >
            {item.label}
            {item.count !== undefined && <span className={styles.count}>{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  idBase,
  tab,
  className,
  ...rest
}: { idBase: string; tab: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tabpanel"
      id={panelId(idBase, tab)}
      aria-labelledby={tabId(idBase, tab)}
      tabIndex={0}
      className={cx(styles.panel, className)}
      {...rest}
    />
  );
}
