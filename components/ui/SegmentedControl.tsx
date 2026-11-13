"use client";

import { useId, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "@/lib/cx";
import styles from "./SegmentedControl.module.css";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
  count?: number;
  disabled?: boolean;
  /** Accessible label when `label` is icon-only. */
  ariaLabel?: string;
}

export interface SegmentedControlProps<T extends string> {
  legend: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  size?: "sm" | "md";
  block?: boolean;
  className?: string;
}

/**
 * Built on native radio inputs: arrow keys, focus and screen-reader semantics come for free.
 */
export function SegmentedControl<T extends string>({
  legend,
  value,
  options,
  onChange,
  size = "md",
  block,
  className,
}: SegmentedControlProps<T>) {
  const name = useId();
  return (
    <fieldset className={cx(styles.group, size === "sm" && styles.sm, block && styles.block, className)}>
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <label key={option.value} className={styles.option}>
            <input
              className={styles.input}
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              aria-label={option.ariaLabel}
              onChange={() => onChange(option.value)}
            />
            <span className={styles.label}>
              {Icon && <Icon size={15} aria-hidden />}
              {option.label}
              {option.count !== undefined && <span className={styles.count}>{option.count}</span>}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
