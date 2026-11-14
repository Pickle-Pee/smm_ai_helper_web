/**
 * Catalogue of Web API v2 demo examples (metadata only; the logic is lazy-loaded from `./run`).
 * Every example runs against an isolated in-memory fixture server: no request leaves the browser and no AI
 * model is involved. Content shown is test data from `docs/api/fixtures/`.
 */
export type DemoCaseId =
  | "direct"
  | "module"
  | "needs-input"
  | "workflow"
  | "ambiguous"
  | "overdue"
  | "unavailable"
  | "quota"
  | "stale-pending"
  | "reopen"
  | "unreadable"
  | "foreign"
  | "viewer";

export interface DemoCaseMeta {
  id: DemoCaseId;
  title: string;
  description: string;
  /** Has a polling phase that the user can stop. */
  polls?: boolean;
}

export const demoCases: DemoCaseMeta[] = [
  { id: "direct", title: "Расчёт — DIRECT_RESULT", description: "Новый запрос с уникальным ключом и синхронным результатом." },
  { id: "module", title: "Публикация — MODULE_RESULT", description: "Результат одного модуля: заголовок, текст и призыв к действию." },
  { id: "needs-input", title: "Уточнение — NEEDS_INPUT", description: "Ответ на уточнение тем же ключом с ревизией 2 и неизменным текстом запроса." },
  { id: "workflow", title: "Стратегия — WORKFLOW_STARTED и опрос", description: "202 и опрос статуса по poll_after_ms до завершённой стратегии.", polls: true },
  { id: "ambiguous", title: "Исход неизвестен — ambiguous", description: "Неизвестный исход зафиксирован сервером. Автоповтора нет." },
  { id: "overdue", title: "Выполняется дольше обычного", description: "running_overdue — подсказка, а не ambiguous. Ожидание можно остановить.", polls: true },
  { id: "unavailable", title: "503 и восстановление по ключу", description: "Ответ потерян (503): статус читается по request_key, POST не повторяется." },
  { id: "quota", title: "Лимит — 429 quota_exceeded", description: "Ничего не принято; время сброса берётся из ответа сервера." },
  { id: "stale-pending", title: "Старый pending после удаления receipt", description: "Свежий pending можно отправить тем же ключом; через 31 день — только expired." },
  { id: "reopen", title: "Повторное открытие истории", description: "Сохранённый snapshot открывается после истечения receipt без вызова модели." },
  { id: "unreadable", title: "Недоступные snapshots", description: "format_unsupported, corrupted и unreadable — отдельные состояния." },
  { id: "foreign", title: "Чужой проект — 404", description: "Ресурс другой организации неотличим от несуществующего." },
  { id: "viewer", title: "Другой участник проекта", description: "Тот же snapshot, но is_self = false; отправка запроса запрещена (403)." },
];
