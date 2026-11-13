import Link from "next/link";
import { FlaskConical } from "lucide-react";
import styles from "./Shell.module.css";

/**
 * Always-visible status of the public preview. Not dismissible on purpose:
 * the deployment has no AI provider, accounts or cloud storage.
 */
export function PreviewBanner() {
  return (
    <div className={styles.previewBanner} role="note" aria-label="Статус демоверсии">
      <FlaskConical size={14} aria-hidden />
      <p className={styles.previewText}>
        <strong>Brenvio Preview</strong>
        <span className={styles.previewLong}> — демонстрационная версия. AI и облачное сохранение пока не подключены.</span>
        <span className={styles.previewShort}> · AI и облако не подключены</span>
      </p>
      <Link href="/settings#demo" className={styles.previewLink}>
        Подробнее
      </Link>
    </div>
  );
}
