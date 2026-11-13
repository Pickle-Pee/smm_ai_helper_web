import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { CloudOff, RotateCcw } from "lucide-react";
import { cx } from "@/lib/cx";
import { Button } from "./Button";
import styles from "./States.module.css";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  tone?: "neutral" | "ai";
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, compact, tone = "neutral", className }: EmptyStateProps) {
  return (
    <div className={cx(styles.state, compact && styles.compact, className)}>
      <span className={cx(styles.icon, tone === "ai" && styles.iconAi)} aria-hidden>
        <Icon size={compact ? 20 : 24} strokeWidth={1.8} />
      </span>
      <h3 className={styles.title}>{title}</h3>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.actions}>{action}</div>}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  description?: ReactNode;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}

export function ErrorState({
  title = "Не удалось загрузить данные",
  description = "Проверьте соединение и попробуйте ещё раз. Если ошибка повторяется, данные могли быть недоступны на стороне сервиса.",
  onRetry,
  compact,
  className,
}: ErrorStateProps) {
  return (
    <div className={cx(styles.state, compact && styles.compact, className)} role="alert">
      <span className={cx(styles.icon, styles.iconDanger)} aria-hidden>
        <CloudOff size={compact ? 20 : 24} strokeWidth={1.8} />
      </span>
      <h3 className={styles.title}>{title}</h3>
      {description && <p className={styles.description}>{description}</p>}
      {onRetry && (
        <div className={styles.actions}>
          <Button icon={RotateCcw} onClick={onRetry} size={compact ? "sm" : "md"}>
            Повторить
          </Button>
        </div>
      )}
    </div>
  );
}

export function Skeleton({
  width,
  height = 12,
  radius,
  className,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  return <span className={cx(styles.skeleton, className)} style={{ width, height, borderRadius: radius, ...style }} aria-hidden />;
}

/** Wraps skeleton content so assistive tech hears a single "loading" announcement. */
export function LoadingRegion({ label = "Загрузка…", children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
