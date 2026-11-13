"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ChevronDown, CircleAlert, Search, X } from "lucide-react";
import { cx } from "@/lib/cx";
import styles from "./Form.module.css";

export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  aside?: ReactNode;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}

/** Wires label, hint and error to the control via ids. */
export function Field({ label, hint, error, required, aside, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cx(styles.field, className)}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={id}>
          {label}
          {required && (
            <span className={styles.required} aria-hidden>
              *
            </span>
          )}
        </label>
        {aside}
      </div>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {error && (
        <p className={styles.error} id={errorId}>
          <CircleAlert size={13} aria-hidden />
          {error}
        </p>
      )}
      {hint && !error && (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
}

type ControlSize = "sm" | "md";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { controlSize?: ControlSize }>(
  function Input({ className, controlSize = "md", ...rest }, ref) {
    return <input ref={ref} className={cx(styles.control, controlSize === "sm" && styles.sm, className)} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cx(styles.control, className)} {...rest} />;
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { controlSize?: ControlSize; wrapperClassName?: string }
>(function Select({ className, wrapperClassName, controlSize = "md", children, ...rest }, ref) {
  return (
    <div className={cx(styles.selectWrap, wrapperClassName)}>
      <select ref={ref} className={cx(styles.control, styles.select, controlSize === "sm" && styles.sm, className)} {...rest}>
        {children}
      </select>
      <ChevronDown size={16} className={styles.selectIcon} aria-hidden />
    </div>
  );
});

export interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> {
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  controlSize?: ControlSize;
  wrapperClassName?: string;
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { value, onValueChange, label, controlSize = "md", wrapperClassName, className, ...rest },
  ref,
) {
  return (
    <div className={cx(styles.search, wrapperClassName)}>
      <Search size={16} className={styles.searchIcon} aria-hidden />
      <input
        ref={ref}
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.stopPropagation();
            onValueChange("");
          }
        }}
        className={cx(styles.control, styles.searchInput, controlSize === "sm" && styles.sm, className)}
        {...rest}
      />
      {value && (
        <button type="button" className={styles.searchClear} onClick={() => onValueChange("")} aria-label="Очистить поиск">
          <X size={15} aria-hidden />
        </button>
      )}
    </div>
  );
});

export function Switch({
  label,
  description,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <div className={styles.switchRow}>
      <div>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        {description && (
          <p className={styles.hint} id={`${id}-d`}>
            {description}
          </p>
        )}
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className={styles.switch}
        aria-describedby={description ? `${id}-d` : undefined}
        {...rest}
      />
    </div>
  );
}
