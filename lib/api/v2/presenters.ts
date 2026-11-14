/**
 * Mappers between Web API v2 DTOs and the frontend's UI models (`lib/types.ts`) / view models below.
 * This is the ONLY place where wire types meet UI types: components receive these view models, never DTOs.
 *
 * Rules (README §10–§11):
 * - user-visible result content comes from `presentation.payload` only;
 * - immutable `stored` / `provenance` metadata is carried separately and never merged into the content;
 * - the per-viewer `author` projection (`is_self`) is carried separately as well;
 * - execution state and next action are taken from the server verbatim, never re-derived (no `ambiguous` by time).
 */
import type { BrandColor, Project as UiProject, ResultBlock, ScenarioId, Thread as UiThread } from "@/lib/types";
import type { WebApiError } from "./errors";
import type {
  AssistantMessage,
  ErrorCode,
  ExecutionState,
  MessageResult,
  NextAction,
  Project,
  ResultKind,
  ResultSnapshot,
  Schemas,
  Thread,
} from "./types";

/* ---------------- projects & threads ---------------- */

const UI_COLORS: BrandColor[] = ["teal", "violet", "coral", "amber", "blue", "green"];

export function toUiProject(dto: Project): UiProject {
  const brand = dto.brand;
  const extra = brand.extra ?? {};
  return {
    id: dto.id,
    name: dto.name,
    industry: extra.industry ?? "",
    status: dto.status,
    color: dto.color && UI_COLORS.includes(dto.color) ? dto.color : "teal",
    description: brand.product_description ?? "",
    audience: brand.audience ?? "",
    usp: extra.usp ?? "",
    toneOfVoice: brand.tone ?? "",
    goals: brand.goals.join("; "),
    competitors: extra.competitors ?? [],
    channels: [...brand.channels],
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

/** Thread metadata only; messages are loaded per thread (`listThreadMessages`) in F2. */
export function toUiThread(dto: Thread): UiThread {
  return {
    id: dto.id,
    title: dto.title,
    projectId: dto.project_id,
    scenarioId: null,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    messages: [],
  };
}

/* ---------------- results ---------------- */

export interface ResultMeta {
  /** Immutable stored record metadata (INSERT-only row). */
  stored: { schemaVersion: string; payloadSha256: string; writerVersion: string };
  /** Immutable provenance. `authorUserId` is the stable id; no viewer-relative data here. */
  provenance: {
    sourceKind: Schemas["SnapshotProvenance"]["source_kind"];
    runId: string | null;
    requestKey: string;
    revision: number;
    authorUserId: number;
    sourceCompletedAt: string | null;
    materializedAt: string;
  };
  /** Computed presentation version (frozen decoder + upcasters). */
  presentation: { schemaVersion: string; decoder: string; upcasters: string[] };
  /** Per-viewer projection, computed for the current caller. */
  author: { displayName: string | null; isSelf: boolean };
}

export interface ClarificationView {
  code: string;
  /** Groups of missing inputs; satisfying any one group is enough. */
  alternatives: string[][];
  /** Owned-site statements the author may confirm. */
  candidates: { statementId: string; statement: string; sourceUrl: string }[];
  snapshotId: string | null;
}

export type ResultView =
  | {
      status: "available";
      kind: ResultKind;
      scenarioId: ScenarioId | null;
      title: string;
      summary: string;
      blocks: ResultBlock[];
      clarification: ClarificationView | null;
      meta: ResultMeta;
    }
  | {
      /** Intact data, no decoder for its stored schema version: a compatibility gap, NOT damage. */
      status: "format_unsupported";
      title: string;
      description: string;
    }
  | {
      /** Integrity check of the stored payload failed: real damage, never regenerated silently. */
      status: "corrupted";
      title: string;
      description: string;
    }
  | {
      /** Intact data, server decoder defect. */
      status: "unreadable";
      title: string;
      description: string;
    }
  | {
      /** A result kind this UI version does not present (e.g. FUTURE web chat replies). */
      status: "not_presentable";
      title: string;
      description: string;
    };

const UNAVAILABLE_TEXT = {
  format_unsupported: {
    title: "Формат результата не поддерживается",
    description:
      "Результат сохранён и не повреждён, но записан в версии формата, которую эта версия сервиса пока не умеет показывать. Данные не изменялись.",
  },
  corrupted: {
    title: "Результат повреждён",
    description:
      "Проверка целостности сохранённого результата не прошла. Он не будет показан и не будет сгенерирован заново автоматически. Сообщите в поддержку.",
  },
  unreadable: {
    title: "Не удалось прочитать результат",
    description: "Сохранённые данные целы, но сервис не смог их показать. Попробуйте открыть позже — повторной генерации не будет.",
  },
} as const;

export function presentAssistantMessage(message: AssistantMessage): ResultView {
  if (message.result_status !== "available" || !message.result) {
    const status = message.result_status === "available" ? "unreadable" : message.result_status;
    return { status, ...UNAVAILABLE_TEXT[status] };
  }
  return presentSnapshot(message.result);
}

/** Maps a `getMessageResult` failure to a result state. Returns `null` for errors that are not about the snapshot. */
export function presentResultError(error: WebApiError): ResultView | null {
  switch (error.code) {
    case "result_format_unsupported":
      return { status: "format_unsupported", ...UNAVAILABLE_TEXT.format_unsupported };
    case "result_corrupted":
      return { status: "corrupted", ...UNAVAILABLE_TEXT.corrupted };
    case "result_unreadable":
      return { status: "unreadable", ...UNAVAILABLE_TEXT.unreadable };
    default:
      return null;
  }
}

function metaOf(snapshot: ResultSnapshot): ResultMeta {
  return {
    stored: {
      schemaVersion: snapshot.stored.schema_version,
      payloadSha256: snapshot.stored.payload_sha256,
      writerVersion: snapshot.stored.writer_version,
    },
    provenance: {
      sourceKind: snapshot.provenance.source_kind,
      runId: snapshot.provenance.run_id ?? null,
      requestKey: snapshot.provenance.request_key,
      revision: snapshot.provenance.revision,
      authorUserId: snapshot.provenance.author_user_id,
      sourceCompletedAt: snapshot.provenance.source_completed_at ?? null,
      materializedAt: snapshot.provenance.materialized_at,
    },
    presentation: {
      schemaVersion: snapshot.presentation.schema_version,
      decoder: snapshot.presentation.decoder,
      upcasters: [...snapshot.presentation.upcasters],
    },
    author: { displayName: snapshot.author.display_name ?? null, isSelf: snapshot.author.is_self },
  };
}

export function presentSnapshot(snapshot: ResultSnapshot): ResultView {
  const meta = metaOf(snapshot);
  const base = { status: "available" as const, kind: snapshot.result_kind, meta, clarification: null };
  switch (snapshot.result_kind) {
    case "DIRECT_RESULT":
      return { ...base, ...presentCalculation(snapshot.presentation.payload.calculation) };
    case "MODULE_RESULT":
      return { ...base, ...presentModule(snapshot.presentation.payload.result) };
    case "NEEDS_INPUT": {
      const payload = snapshot.presentation.payload;
      const clarification: ClarificationView = {
        code: payload.code,
        alternatives: payload.alternatives.map((group) => group.map(inputLabel)),
        candidates: (payload.owned_site?.candidates ?? []).map((c) => ({ statementId: c.statement_id, statement: c.statement, sourceUrl: c.source_url })),
        snapshotId: payload.owned_site?.snapshot_id ?? null,
      };
      const blocks: ResultBlock[] = clarification.alternatives.flatMap((group, i): ResultBlock[] =>
        clarification.alternatives.length > 1
          ? [{ type: "heading", text: `Вариант ${i + 1}` }, { type: "list", items: group }]
          : [{ type: "list", items: group }],
      );
      return {
        ...base,
        scenarioId: null,
        title: "Нужно уточнение",
        summary:
          clarification.alternatives.length > 1
            ? "Чтобы продолжить, заполните любую из групп данных ниже."
            : "Чтобы продолжить, добавьте данные ниже.",
        blocks: [
          ...blocks,
          ...(clarification.candidates.length
            ? [{ type: "list" as const, items: clarification.candidates.map((c) => `С сайта: ${c.statement}`) }]
            : []),
        ],
        clarification,
      };
    }
    case "RUN":
      return { ...base, ...presentRun(snapshot.presentation.payload) };
    case "UNSUPPORTED":
      return {
        ...base,
        scenarioId: null,
        title: "Свободный диалог пока недоступен",
        summary: "Этот запрос похож на свободный разговор. Веб-чат появится в следующих этапах — сейчас доступны структурированные сценарии.",
        blocks: [{ type: "callout", tone: "info", text: "Попробуйте сценарии: стратегия, анализ конкурентов, позиционирование или расчёт." }],
      };
    default:
      return {
        status: "not_presentable",
        title: "Этот тип результата пока не отображается",
        description: "Веб-чат — будущий этап (B9/F7). Результат сохранён и будет доступен позже.",
      };
  }
}

type Content = { scenarioId: ScenarioId | null; title: string; summary: string; blocks: ResultBlock[] };

const CALC_INPUT_LABELS: Record<string, string> = {
  budget: "Бюджет",
  cpc: "Цена клика (CPC)",
  cpl: "Цена лида (CPL)",
  traffic: "Трафик",
  conversion_rate_percent: "Конверсия, %",
  required_leads: "Нужно лидов",
};
const CALC_OUTPUT_LABELS: Record<string, string> = {
  clicks: "Клики",
  leads: "Лиды",
  required_traffic: "Нужный трафик",
  required_budget: "Нужный бюджет",
};

function presentCalculation(calc: Schemas["Calculation"]): Content {
  const outputs = Object.entries(calc.outputs)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => ({ label: CALC_OUTPUT_LABELS[k] ?? k, value: String(v) }));
  const inputs = Object.entries(calc.inputs)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${CALC_INPUT_LABELS[k] ?? k}: ${v}`);
  const blocks: ResultBlock[] = [{ type: "metrics", items: outputs }];
  if (inputs.length) blocks.push({ type: "heading", text: "Исходные данные" }, { type: "list", items: inputs });
  blocks.push({ type: "paragraph", text: `Формула: ${calc.formula}` });
  if (calc.assumptions.length) blocks.push({ type: "callout", tone: "info", text: `Допущения: ${calc.assumptions.join("; ")}` });
  return { scenarioId: null, title: "Расчёт", summary: outputs.map((o) => `${o.label}: ${o.value}`).join(", "), blocks };
}

const FINDINGS_META: Record<Schemas["Findings"]["kind"], { title: string; scenarioId: ScenarioId | null }> = {
  competitor_analysis: { title: "Анализ конкурентов", scenarioId: "competitors" },
  market_analysis: { title: "Анализ рынка", scenarioId: null },
  positioning: { title: "Позиционирование", scenarioId: "positioning" },
};
const FINDING_KIND: Record<Schemas["Finding"]["kind"], string> = {
  OBSERVATION: "Наблюдение",
  INFERENCE: "Вывод",
  HYPOTHESIS: "Гипотеза",
  RECOMMENDATION: "Рекомендация",
};
const CONFIDENCE: Record<Schemas["Finding"]["confidence"], string> = {
  UNKNOWN: "не определена",
  LOW: "низкая",
  MEDIUM: "средняя",
  HIGH: "высокая",
};

function limitationsBlock(limitations: string[] | undefined): ResultBlock[] {
  return limitations?.length ? [{ type: "callout", tone: "warning", text: `Ограничения: ${limitations.join(" ")}` }] : [];
}

function presentFindings(findings: Schemas["Findings"]): Content {
  const meta = FINDINGS_META[findings.kind];
  const blocks: ResultBlock[] = [];
  if (findings.findings.length) {
    blocks.push({
      type: "table",
      caption: meta.title,
      columns: ["Тема", "Содержание", "Тип", "Уверенность"],
      rows: findings.findings.map((f) => [humanize(f.topic), f.text, FINDING_KIND[f.kind], CONFIDENCE[f.confidence]]),
    });
  }
  if (findings.sources?.length) {
    blocks.push({ type: "heading", text: "Источники" }, { type: "list", items: findings.sources.map((s) => (s.url ? `${s.label} — ${s.url}` : s.label)) });
  }
  blocks.push(...limitationsBlock(findings.limitations));
  return { scenarioId: meta.scenarioId, title: meta.title, summary: findings.findings[0]?.text ?? "Выводов нет.", blocks };
}

function presentModule(result: Schemas["ModuleResponse"]["result"]): Content {
  if ("headline" in result) {
    return {
      scenarioId: "ad-copy",
      title: "Публикация",
      summary: result.headline,
      blocks: [
        { type: "heading", text: result.headline },
        { type: "paragraph", text: result.body },
        { type: "callout", tone: "info", text: `Призыв к действию: ${result.cta}` },
        ...limitationsBlock(result.limitations),
      ],
    };
  }
  return presentFindings(result);
}

const STRATEGY_SECTIONS: [keyof Omit<Schemas["Strategy"], "limitations">, string][] = [
  ["strategic_diagnosis", "Диагноз"],
  ["main_growth_constraint", "Главное ограничение роста"],
  ["strategic_priorities", "Приоритеты"],
  ["trade_offs", "Компромиссы"],
  ["resource_priorities", "Ресурсы"],
  ["strategic_bets", "Ставки"],
  ["roadmap", "Дорожная карта"],
  ["risks", "Риски"],
  ["decision_triggers", "Когда пересматривать решения"],
];

const FAILURE_TEXT: Record<Schemas["PublicFailure"]["code"], string> = {
  context_required: "Не хватает контекста или доступного источника, чтобы завершить работу.",
  result_unavailable: "Результат получить не удалось.",
};

function presentRun(run: Schemas["RunResponse"]): Content {
  const blocks: ResultBlock[] = [];
  if (run.failure) blocks.push({ type: "callout", tone: "warning", text: FAILURE_TEXT[run.failure.code] });
  if (run.strategy) {
    for (const [key, title] of STRATEGY_SECTIONS) {
      const section = run.strategy[key];
      blocks.push({ type: "heading", text: title }, { type: "paragraph", text: section.text }, { type: "list", items: section.items });
      if (section.numeric_context?.length) blocks.push({ type: "list", items: section.numeric_context });
    }
    blocks.push(...limitationsBlock(run.strategy.limitations));
  }
  if (run.experiments?.designs.length) {
    blocks.push({
      type: "table",
      caption: "Эксперименты",
      columns: ["Гипотеза", "Метрика", "Действие", "Ожидаемый сигнал", "Условие провала"],
      rows: run.experiments.designs.map((e) => [e.hypothesis, e.target_metric, e.intervention, e.expected_signal, e.failure_condition]),
    });
  }
  blocks.push(...limitationsBlock(run.limitations));
  const ok = run.status === "COMPLETED" || run.status === "COMPLETED_WITH_LIMITATIONS";
  return {
    scenarioId: "strategy",
    title: ok ? "Стратегия продвижения" : "Стратегия не сформирована",
    summary: run.strategy?.strategic_diagnosis.text ?? (run.failure ? FAILURE_TEXT[run.failure.code] : "Результат без стратегии."),
    blocks,
  };
}

const INPUT_LABELS: Record<string, string> = {
  business_goal: "Бизнес-цель",
  product: "Продукт",
  target: "Целевая аудитория",
  customer_job_or_need: "Задача или потребность клиента",
  relevant_alternative: "С чем вас сравнивают клиенты",
  product_truth: "Подтверждённые факты о продукте",
  existing_proof: "Доказательства и кейсы",
  geography: "География",
  economics: "Экономика (чек, маржа, бюджет)",
  message: "Ключевое сообщение",
  tone: "Тон",
};

export function inputLabel(key: string): string {
  return INPUT_LABELS[key] ?? humanize(key);
}

function humanize(code: string): string {
  const text = code.replace(/[_.]+/g, " ").trim();
  return text ? text[0].toLocaleUpperCase("ru") + text.slice(1) : code;
}

/* ---------------- execution state ---------------- */

export type ExecutionStatus = ExecutionState | "running_overdue";

export interface ExecutionView {
  status: ExecutionStatus;
  label: string;
  description: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  requestKey: string;
  revision: number;
  /** Server-authoritative next action, verbatim. */
  nextAction: NextAction;
  pollAfterMs: number | null;
  canAnswerClarification: boolean;
  /** Only when the SERVER returned `resubmit_same_key`. */
  canResubmitSameKey: boolean;
  /** Explicit, warned "start a new request" (new key) may be offered. */
  offersNewRequest: boolean;
  newRequestWarning: string | null;
  waitingForAuthor: boolean;
  result: ResultView | null;
}

const NEW_REQUEST_WARNING =
  "Новый запрос получит новый ключ. Прежняя генерация могла состояться, поэтому результат может быть создан повторно (и повторно учтён в лимитах).";

const STATE_TEXT: Record<ExecutionStatus, { label: string; description: string; tone: ExecutionView["tone"] }> = {
  pending: { label: "Сохранён, не отправлен", description: "Запрос сохранён, выполнение не начиналось.", tone: "neutral" },
  running: { label: "Выполняется", description: "Ожидаем результат. Статус обновляется автоматически.", tone: "info" },
  running_overdue: {
    label: "Выполняется дольше обычного",
    description: "Результат пока не определён. Ожидание продолжается; повторного запуска не будет без вашего решения.",
    tone: "warning",
  },
  needs_input: { label: "Нужно уточнение", description: "Ответьте на уточнение — запрос продолжится с тем же ключом.", tone: "info" },
  completed: { label: "Готово", description: "Результат сохранён.", tone: "success" },
  completed_with_limitations: { label: "Готово с ограничениями", description: "Часть необязательных данных недоступна.", tone: "success" },
  blocked: { label: "Не хватает данных", description: "Для продолжения нужен контекст или доступный источник.", tone: "warning" },
  failed: { label: "Не удалось выполнить", description: "Работа завершилась ошибкой.", tone: "danger" },
  ambiguous: {
    label: "Исход неизвестен",
    description: "Сервис зафиксировал, что исход генерации неизвестен. Автоматического повтора нет.",
    tone: "warning",
  },
  expired: { label: "Результат недоступен", description: "Получить результат по этому запросу больше нельзя.", tone: "neutral" },
  unsupported: { label: "Не поддерживается", description: "Свободный диалог появится вместе с веб-чатом.", tone: "neutral" },
};

const EXPIRED_REASON: Record<string, string> = {
  receipt_expired: "Результат не успел сохраниться до истечения срока хранения. Повторной генерации не будет.",
  recovery_window_elapsed:
    "Безопасное окно восстановления истекло. Это не доказывает, что запрос не выполнялся, поэтому повторной отправки не будет.",
  never_admitted: "Запрос не был принят в работу.",
};

export function presentExecution(result: MessageResult): ExecutionView {
  const status: ExecutionStatus = result.state === "running" && result.running_overdue ? "running_overdue" : result.state;
  const text = STATE_TEXT[status];
  const reason = result.user_message.state_reason;
  let description = text.description;
  if (status === "expired" && reason) description = EXPIRED_REASON[reason] ?? description;
  if (status === "pending" && result.next_action === "resubmit_same_key") {
    description = "Сервер подтвердил, что выполнение не начиналось. Можно отправить тот же запрос повторно — с тем же ключом.";
  }
  if (result.next_action === "wait_for_author") description = `${description} Продолжить запрос может только его автор.`;
  const offersNewRequest = result.next_action === "start_new_request" || status === "running_overdue";
  return {
    status,
    label: text.label,
    description,
    tone: text.tone,
    requestKey: result.user_message.request_key,
    revision: result.user_message.revision,
    nextAction: result.next_action,
    pollAfterMs: result.poll_after_ms ?? null,
    canAnswerClarification: result.next_action === "answer_clarification",
    canResubmitSameKey: result.next_action === "resubmit_same_key",
    offersNewRequest,
    newRequestWarning: offersNewRequest ? NEW_REQUEST_WARNING : null,
    waitingForAuthor: result.next_action === "wait_for_author",
    result: result.assistant_message ? presentAssistantMessage(result.assistant_message) : null,
  };
}

/* ---------------- errors ---------------- */

const ERROR_TEXT: Partial<Record<ErrorCode, string>> = {
  unauthenticated: "Сессия закончилась. Войдите снова.",
  login_token_invalid: "Ссылка для входа недействительна или уже использована. Запросите новую в боте.",
  csrf_failed: "Не удалось подтвердить запрос. Обновите страницу.",
  forbidden: "Недостаточно прав для этого действия.",
  feature_disabled: "Эта возможность пока выключена.",
  not_found: "Не найдено или нет доступа.",
  request_conflict: "Этот запрос уже отправлен в другом виде. Для новой задачи создайте новый запрос.",
  revision_conflict: "Уточнение не совпадает с текущим запросом. Обновите тред.",
  thread_busy: "В этом треде уже выполняется запрос. Дождитесь его завершения.",
  rate_limited: "Слишком много запросов. Подождите немного.",
  quota_exceeded: "Достигнут дневной лимит генераций.",
  temporarily_unavailable: "Статус временно недоступен. Повторной отправки не будет — проверим состояние позже.",
  payload_too_large: "Запрос слишком большой.",
  invalid_request: "Запрос заполнен некорректно.",
  result_gone: "Результат по этому запросу недоступен.",
  result_corrupted: UNAVAILABLE_TEXT.corrupted.description,
  result_format_unsupported: UNAVAILABLE_TEXT.format_unsupported.description,
  result_unreadable: UNAVAILABLE_TEXT.unreadable.description,
};

/** Localized text for an error, by `code` only (the API never sends free text). Includes the diagnostic id. */
export function presentError(error: WebApiError): { text: string; requestId: string | null; retryAfterSeconds: number | null; resetsAt: string | null } {
  const text =
    (error.code && ERROR_TEXT[error.code]) ||
    (error.kind === "network" || error.kind === "timeout" ? "Нет связи с сервисом. Проверим статус запроса, не отправляя его повторно." : "Что-то пошло не так.");
  return { text, requestId: error.requestId, retryAfterSeconds: error.retryAfterSeconds, resetsAt: error.quota?.resets_at ?? null };
}
