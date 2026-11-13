import { cx } from "@/lib/cx";
import styles from "./Logo.module.css";

/**
 * SMM AI Helper mark: navy tile, teal growth line (marketing results) and a violet spark (AI).
 */
export function LogoMark({ size = 32, onDark = false, className }: { size?: number; onDark?: boolean; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
      focusable="false"
    >
      <rect width="32" height="32" rx="9" fill={onDark ? "#22385A" : "#15253D"} />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" stroke="#FFFFFF" strokeOpacity={onDark ? 0.12 : 0} />
      <path d="M7.5 21.5 12.25 16.75 15.75 19.75 21 14.5" stroke="#19B6AE" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M23.5 6c.38 2.3 1.2 3.12 3.5 3.5-2.3.38-3.12 1.2-3.5 3.5-.38-2.3-1.2-3.12-3.5-3.5 2.3-.38 3.12-1.2 3.5-3.5Z"
        fill="#A79EF4"
      />
      <circle cx="7.5" cy="21.5" r="1.6" fill="#19B6AE" />
    </svg>
  );
}

export function Logo({ onDark = false, compact = false, className }: { onDark?: boolean; compact?: boolean; className?: string }) {
  return (
    <span className={cx(styles.logo, onDark && styles.onDark, className)}>
      <LogoMark onDark={onDark} />
      {!compact && (
        <span className={styles.wordmark}>
          SMM <span className={styles.ai}>AI</span> Helper
        </span>
      )}
    </span>
  );
}
