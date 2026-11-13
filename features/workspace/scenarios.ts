import { CalendarDays, Crosshair, Megaphone, Radar, Target, Users, type LucideIcon } from "lucide-react";
import type { ScenarioId } from "@/lib/types";
import { quoted } from "@/lib/format";

export interface Scenario {
  id: ScenarioId;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Prompt template inserted into the composer. `{brand}` is replaced with the selected brand. */
  prompt: string;
}

export const scenarios: Scenario[] = [
  {
    id: "competitors",
    title: "Анализ конкурентов",
    description: "Позиционирование, офферы, каналы и слабые места 3–5 конкурентов.",
    icon: Radar,
    prompt: "Проанализируй конкурентов {brand}: позиционирование, ключевые офферы, каналы продвижения и слабые места. Сведи результат в таблицу.",
  },
  {
    id: "strategy",
    title: "Стратегия продвижения",
    description: "Цели, этапы, каналы и метрики на ближайший квартал.",
    icon: Target,
    prompt: "Разработай стратегию продвижения {brand} на 3 месяца: цели, этапы по месяцам, каналы, бюджет и метрики.",
  },
  {
    id: "content-plan",
    title: "Контент-план",
    description: "Темы, форматы и площадки на неделю или месяц.",
    icon: CalendarDays,
    prompt: "Составь контент-план для {brand} на 2 недели: дата, площадка, формат, тема и целевое действие.",
  },
  {
    id: "positioning",
    title: "Позиционирование и УТП",
    description: "Формулировки ценности и отличий от конкурентов.",
    icon: Crosshair,
    prompt: "Предложи 3 варианта позиционирования и УТП для {brand} с объяснением, на какой сегмент аудитории рассчитан каждый.",
  },
  {
    id: "audience",
    title: "Портрет аудитории",
    description: "Сегменты, мотивы, возражения и триггеры покупки.",
    icon: Users,
    prompt: "Опиши портрет целевой аудитории {brand}: сегменты, мотивы, возражения и триггеры покупки.",
  },
  {
    id: "ad-copy",
    title: "Рекламные тексты",
    description: "Варианты объявлений и постов под конкретную площадку.",
    icon: Megaphone,
    prompt: "Напиши 5 вариантов рекламных текстов для {brand} в VK Рекламе: заголовок до 40 символов и текст до 120 символов.",
  },
];

export const scenarioById = new Map(scenarios.map((s) => [s.id, s]));

export function scenarioPrompt(scenario: Scenario, brandName?: string | null): string {
  return scenario.prompt.replace("{brand}", brandName ? `бренда ${quoted(brandName)}` : "моего бренда");
}
