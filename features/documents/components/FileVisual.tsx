import { File, FileText, Image as ImageIcon, Presentation, Table2, type LucideIcon } from "lucide-react";
import type { DocumentKind } from "@/lib/types";
import { cx } from "@/lib/cx";
import styles from "./FileVisual.module.css";

const kindIcon: Record<DocumentKind, LucideIcon> = {
  sheet: Table2,
  doc: FileText,
  pdf: FileText,
  slides: Presentation,
  card: ImageIcon,
  file: File,
};

/** Small coloured tile identifying the file type. */
export function FileIcon({ kind, size = "md" }: { kind: DocumentKind; size?: "sm" | "md" | "lg" }) {
  const Icon = kindIcon[kind];
  return (
    <span className={cx(styles.icon, styles[`icon_${kind}`], styles[size])} aria-hidden>
      <Icon size={size === "lg" ? 22 : size === "sm" ? 15 : 18} strokeWidth={1.9} />
    </span>
  );
}

/**
 * Schematic thumbnail drawn with CSS — conveys the file type at a glance.
 * It is NOT a real preview; real previews require file storage.
 */
export function FileThumb({ kind, large }: { kind: DocumentKind; large?: boolean }) {
  return (
    <div className={cx(styles.thumb, styles[`thumb_${kind}`], large && styles.thumbLarge)} aria-hidden>
      {kind === "sheet" && (
        <div className={styles.sheet}>
          {Array.from({ length: 24 }, (_, i) => (
            <span key={i} className={i < 4 ? styles.sheetHead : undefined} />
          ))}
        </div>
      )}
      {(kind === "doc" || kind === "pdf") && (
        <div className={styles.page}>
          <span className={styles.pageTitle} />
          <span />
          <span />
          <span className={styles.short} />
          <span />
          <span className={styles.short} />
          {kind === "pdf" && <em className={styles.pdfTag}>PDF</em>}
        </div>
      )}
      {kind === "slides" && (
        <div className={styles.slide}>
          <span className={styles.slideTitle} />
          <span className={styles.slideBar} />
          <div className={styles.slideChart}>
            <i style={{ height: "40%" }} />
            <i style={{ height: "65%" }} />
            <i style={{ height: "52%" }} />
            <i style={{ height: "85%" }} />
          </div>
        </div>
      )}
      {kind === "card" && (
        <div className={styles.cards}>
          <span />
          <span />
        </div>
      )}
      {kind === "file" && (
        <div className={styles.archive}>
          <File size={large ? 40 : 28} strokeWidth={1.4} />
        </div>
      )}
    </div>
  );
}
