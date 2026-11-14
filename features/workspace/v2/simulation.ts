import type { SubmitScenario } from "@/lib/api/v2/fixture-client";
import type { ScenarioId } from "@/lib/types";

/**
 * Test answers the fixture server can give in the Workspace preview. The user picks one explicitly: the preview
 * never pretends that an AI chose the answer. Labels say what is simulated, including failures.
 */
export const FIXTURE_ANSWERS: { id: SubmitScenario; label: string }[] = [
  { id: "direct_result", label: "Расчёт — готовый результат" },
  { id: "module_result", label: "Публикация — результат модуля" },
  { id: "workflow", label: "Стратегия — долгий процесс с опросом статуса" },
  { id: "needs_input", label: "Позиционирование — нужно уточнение" },
  { id: "workflow_failed", label: "Процесс завершился ошибкой" },
  { id: "workflow_blocked", label: "Не хватает данных (blocked)" },
  { id: "ambiguous", label: "Исход неизвестен (ambiguous)" },
  { id: "running_overdue", label: "Выполняется дольше обычного" },
  { id: "unsupported", label: "Свободный вопрос — не поддерживается" },
  { id: "unavailable_after_admission", label: "Сбой связи 503, запрос принят" },
  { id: "unavailable_before_admission", label: "Сбой связи 503, записи нет (404)" },
  { id: "rate_limited", label: "Слишком много запросов (429)" },
  { id: "quota_exceeded", label: "Дневной лимит исчерпан (429)" },
];

const BY_SCENARIO: Partial<Record<ScenarioId, SubmitScenario>> = {
  strategy: "workflow",
  positioning: "needs_input",
  "ad-copy": "module_result",
  "content-plan": "module_result",
};

/** Default test answer for a scenario card (only where a fixture of that kind exists). */
export function defaultFixtureAnswer(scenarioId: ScenarioId | null | undefined): SubmitScenario {
  return (scenarioId && BY_SCENARIO[scenarioId]) || "direct_result";
}

export const FIXTURE_LABEL = "Пример из тестовых данных — AI не подключён";
