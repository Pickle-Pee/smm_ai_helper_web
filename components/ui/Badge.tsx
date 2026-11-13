import type { HTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "@/lib/cx";
import styles from "./Badge.module.css";

export type BadgeTone = "neutral" | "accent" | "ai" | "success" | "warning" | "danger" | "info" | "outline" | "onDark";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: "sm" | "md";
  dot?: boolean;
  icon?: LucideIcon;
}

export function Badge({ tone = "neutral", size = "md", dot, icon: Icon, className, children, ...rest }: BadgeProps) {
  return (
    <span className={cx(styles.badge, styles[tone], size === "sm" && styles.sm, dot && styles.dot, className)} {...rest}>
      {Icon && <Icon size={12} strokeWidth={2.2} aria-hidden />}
      {children}
    </span>
  );
}

/** Marks a capability that exists in the design but is not implemented yet. */
export function SoonBadge({ children = "Скоро", ...rest }: Omit<BadgeProps, "tone">) {
  return (
    <Badge tone="outline" size="sm" {...rest}>
      {children}
    </Badge>
  );
}
