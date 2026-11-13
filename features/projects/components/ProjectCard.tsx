import Link from "next/link";
import { FileText, MessagesSquare } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Monogram } from "@/components/ui/Monogram";
import { countLabel, formatRelative } from "@/lib/format";
import type { Project, ProjectStatus } from "@/lib/types";
import { contextCompleteness, projectStatusLabel } from "../model";
import styles from "../Projects.module.css";

export const statusTone: Record<ProjectStatus, "success" | "neutral" | "outline"> = {
  active: "success",
  draft: "neutral",
  archived: "outline",
};

export interface ProjectStats {
  threads: number;
  documents: number;
}

export function ProjectCard({ project, stats, now }: { project: Project; stats: ProjectStats; now: Date | null }) {
  const { percent } = contextCompleteness(project);
  return (
    <article className={styles.card}>
      <div className={styles.cardTop}>
        <Monogram name={project.name} color={project.color} size="lg" />
        <Badge tone={statusTone[project.status]} size="sm" dot={project.status === "active"}>
          {projectStatusLabel[project.status]}
        </Badge>
      </div>
      <h2 className={styles.cardTitle}>
        <Link href={`/projects/${project.id}`} className={styles.cardLink} title={project.name}>
          {project.name}
        </Link>
      </h2>
      <p className={styles.cardIndustry}>{project.industry}</p>
      <p className={styles.cardDescription}>{project.description || "Описание бизнеса пока не заполнено."}</p>

      {project.channels.length > 0 && (
        <ul className={styles.cardChannels} aria-label="Каналы">
          {project.channels.slice(0, 3).map((c) => (
            <li key={c}>{c}</li>
          ))}
          {project.channels.length > 3 && <li>+{project.channels.length - 3}</li>}
        </ul>
      )}

      <div className={styles.cardFooter}>
        <span className={styles.cardStat}>
          <MessagesSquare size={14} aria-hidden /> {countLabel(stats.threads, ["диалог", "диалога", "диалогов"])}
        </span>
        <span className={styles.cardStat}>
          <FileText size={14} aria-hidden /> {countLabel(stats.documents, ["файл", "файла", "файлов"])}
        </span>
        <span className={styles.cardContext} title="Полнота бизнес-контекста">
          <span className={styles.cardContextTrack} aria-hidden>
            <span style={{ width: `${percent}%` }} data-low={percent < 60 || undefined} />
          </span>
          <span>
            <span className="sr-only">Контекст заполнен на </span>
            {percent}%
          </span>
        </span>
      </div>
      <p className={styles.cardUpdated}>{now ? `Обновлён ${formatRelative(project.updatedAt, now)}` : " "}</p>
    </article>
  );
}
