import type { BrandColor } from "@/lib/types";
import { initials } from "@/lib/format";
import { cx } from "@/lib/cx";
import styles from "./Monogram.module.css";

export interface MonogramProps {
  name: string;
  color: BrandColor;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

/** Brand tile for projects. Decorative — the brand name is always rendered next to it. */
export function Monogram({ name, color, size = "md", className }: MonogramProps) {
  return (
    <span className={cx(styles.monogram, styles[size], styles[color], className)} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function BrandDot({ color, className }: { color: BrandColor; className?: string }) {
  return <span className={cx(styles.dot, styles[color], className)} aria-hidden />;
}
