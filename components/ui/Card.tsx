import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./Card.module.css";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  padded?: boolean;
  interactive?: boolean;
}

export function Card({ as: Tag = "section", padded, interactive, className, ...rest }: CardProps) {
  return (
    <Tag
      className={cx(styles.card, padded ? styles.padded : styles.flush, interactive && styles.interactive, className)}
      {...rest}
    />
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  plain?: boolean;
  headingLevel?: 2 | 3;
  id?: string;
}

export function CardHeader({ title, description, action, icon, plain, headingLevel = 2, id }: CardHeaderProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={cx(styles.header, plain && styles.headerPlain)}>
      <div className={styles.headerText}>
        <Heading className={styles.title} id={id}>
          {icon}
          {title}
        </Heading>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {action && <div className={styles.headerAction}>{action}</div>}
    </div>
  );
}

export function Meter({ value, label, hint }: { value: number; label: string; hint?: ReactNode }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cx(styles.meter, clamped < 60 && styles.meterLow)}>
      <div className={styles.meterLabel}>
        <span>{label}</span>
        <span className={styles.meterValue}>{clamped}%</span>
      </div>
      <div
        className={styles.meterTrack}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
      >
        <div className={styles.meterFill} style={{ width: `${clamped}%` }} />
      </div>
      {hint && <div className={styles.description}>{hint}</div>}
    </div>
  );
}
