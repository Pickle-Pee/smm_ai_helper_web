import { CircleCheck, CircleDashed, Clock } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { ResultStatus, ScenarioId } from "@/lib/types";
import { resultStatusLabel } from "../model";
import { scenarioById } from "../scenarios";
import styles from "./ResultBadges.module.css";

const statusTone = { review: "warning", approved: "success", draft: "neutral" } as const;
const statusIcon = { review: Clock, approved: CircleCheck, draft: CircleDashed } as const;

export function ResultStatusBadge({ status, size = "md" }: { status: ResultStatus; size?: "sm" | "md" }) {
  return (
    <Badge tone={statusTone[status]} icon={statusIcon[status]} size={size}>
      {resultStatusLabel[status]}
    </Badge>
  );
}

/** Violet tile used wherever an AI-generated result is listed. */
export function ResultKindIcon({ kind, size = "md" }: { kind: ScenarioId; size?: "sm" | "md" }) {
  const scenario = scenarioById.get(kind);
  const Icon = scenario?.icon ?? CircleDashed;
  return (
    <span className={size === "sm" ? `${styles.kind} ${styles.sm}` : styles.kind} aria-hidden>
      <Icon size={size === "sm" ? 15 : 17} strokeWidth={1.9} />
    </span>
  );
}

export function scenarioTitle(kind: ScenarioId): string {
  return scenarioById.get(kind)?.title ?? "Результат";
}
