import { isWebApiError } from "@/lib/api/v2/errors";
import { FIXTURE_IDS, fixtures } from "@/lib/api/v2/fixtures";
import { FIXTURE_SERVER_NOW, FixtureWebApiV2Client, type FixtureClientOptions } from "@/lib/api/v2/fixture-client";
import {
  presentAssistantMessage,
  presentError,
  presentExecution,
  presentResultError,
  presentSnapshot,
  type ExecutionView,
  type ResultView,
} from "@/lib/api/v2/presenters";
import { RequestCoordinator, type RequestOutcome, type Sleep } from "@/lib/api/v2/requests";
import type { SubmittedInput } from "@/lib/api/v2/types";
import type { DemoCaseId } from "./cases";

/** One step of a demo run, already mapped to UI view models (no DTOs leave this module). */
export interface DemoStep {
  title: string;
  execution?: ExecutionView;
  result?: ResultView;
  error?: ReturnType<typeof presentError> & { code: string | null; status: number | null };
  note?: string;
}

export interface DemoRun {
  steps: DemoStep[];
  /** What a real core would have admitted. The fixture server never calls a model. */
  simulatedCoreAdmissions: number;
  submitCalls: number;
}

export interface DemoRunOptions {
  signal?: AbortSignal;
  onStep?: (step: DemoStep) => void;
  /** Polling delay used by the demo (real `poll_after_ms` is honoured in production code; the demo shortens it). */
  sleep?: Sleep;
}

const DAY = 24 * 60 * 60 * 1000;

function stripKey<T extends { request_key?: unknown; revision?: unknown }>(body: T): SubmittedInput {
  const { request_key: _k, revision: _r, ...input } = body;
  return input as unknown as SubmittedInput;
}

export async function runDemoCase(id: DemoCaseId, options: DemoRunOptions = {}): Promise<DemoRun> {
  const steps: DemoStep[] = [];
  const push = (step: DemoStep) => {
    steps.push(step);
    options.onStep?.(step);
  };
  const make = (opts: FixtureClientOptions = {}) => {
    const api = new FixtureWebApiV2Client(opts);
    const coordinator = new RequestCoordinator(api, { sleep: options.sleep });
    return { api, coordinator };
  };
  const pushOutcome = (title: string, outcome: RequestOutcome, note?: string) => {
    if (outcome.kind === "state") {
      push({ title, execution: presentExecution(outcome.result), note });
    } else {
      push({
        title,
        error: { ...presentError(outcome.error), code: outcome.error.code, status: outcome.error.status },
        note:
          note ??
          (outcome.kind === "unknown"
            ? "Исход не определён. Запрос не отправляется повторно и новый ключ не создаётся автоматически."
            : undefined),
      });
    }
  };
  const newThread = async (api: FixtureWebApiV2Client, title: string) =>
    api.createThread(FIXTURE_IDS.projectId, { kind: "copilot", title });

  let ctx = make();
  switch (id) {
    case "direct": {
      ctx = make({ scenario: "direct_result" });
      const thread = await newThread(ctx.api, "Расчёт лидов");
      pushOutcome("Запрос отправлен (ревизия 1)", await ctx.coordinator.submitNew(thread.id, stripKey(fixtures.requests.calculation())));
      break;
    }
    case "module": {
      ctx = make({ scenario: "module_result" });
      const thread = await newThread(ctx.api, "Пост о сезонном меню");
      pushOutcome("Запрос отправлен", await ctx.coordinator.submitNew(thread.id, { message: "Напиши пост для ВКонтакте о новом сезонном меню" }));
      break;
    }
    case "needs-input": {
      ctx = make({ scenario: "needs_input" });
      const thread = await newThread(ctx.api, "Позиционирование кофейни");
      const first = await ctx.coordinator.submitNew(thread.id, stripKey(fixtures.requests.positioningRev1()));
      pushOutcome("Ревизия 1: сервер просит уточнить", first);
      if (first.kind === "state") {
        const rev2 = fixtures.requests.positioningRev2();
        const second = await ctx.coordinator.answerClarification(first.result, { context: rev2.context, confirmation: rev2.confirmation });
        pushOutcome("Ревизия 2: тот же ключ, тот же текст, добавлен контекст", second);
      }
      break;
    }
    case "workflow": {
      ctx = make({ scenario: "workflow", pollsUntilDone: 2 });
      const thread = await newThread(ctx.api, "Стратегия на квартал");
      const started = await ctx.coordinator.submitNew(thread.id, stripKey(fixtures.requests.strategy()));
      pushOutcome("202 — выполнение запущено", started);
      if (started.kind === "state") {
        await ctx.coordinator.poll(started.result.user_message.id, {
          signal: options.signal,
          onUpdate: (r) => push({ title: "Опрос статуса", execution: presentExecution(r) }),
        });
      }
      break;
    }
    case "ambiguous": {
      ctx = make({ scenario: "ambiguous" });
      const thread = await newThread(ctx.api, "Анализ конкурента");
      pushOutcome("Ответ сервера", await ctx.coordinator.submitNew(thread.id, { message: "Проанализируй конкурента", competitor_urls: ["https://competitor.example/"] }));
      break;
    }
    case "overdue": {
      ctx = make({ scenario: "running_overdue" });
      const thread = await newThread(ctx.api, "Анализ конкурента");
      const started = await ctx.coordinator.submitNew(thread.id, { message: "Проанализируй конкурента", competitor_urls: ["https://competitor.example/"] });
      pushOutcome("202 — выполнение запущено", started);
      if (started.kind === "state") {
        const stop = new AbortController();
        options.signal?.addEventListener("abort", () => stop.abort(), { once: true });
        let reads = 0;
        try {
          await ctx.coordinator.poll(started.result.user_message.id, {
            signal: stop.signal,
            onUpdate: (r) => {
              push({ title: "Опрос статуса", execution: presentExecution(r) });
              if (++reads >= 2) stop.abort();
            },
          });
        } catch {
          push({ title: "Ожидание остановлено", note: "Остановлено только ожидание в браузере: запрос не отменён, не повторён и не помечен как ambiguous." });
        }
      }
      break;
    }
    case "unavailable": {
      ctx = make({ scenario: "unavailable_after_admission" });
      const thread = await newThread(ctx.api, "Расчёт лидов");
      const outcome = await ctx.coordinator.submitNew(thread.id, stripKey(fixtures.requests.calculation()));
      pushOutcome("POST вернул 503 → чтение по request_key", outcome, "Состояние получено чтением по ключу; POST отправлен один раз.");
      break;
    }
    case "quota": {
      ctx = make({ scenario: "quota_exceeded" });
      const thread = await newThread(ctx.api, "Стратегия");
      pushOutcome("Ответ сервера", await ctx.coordinator.submitNew(thread.id, stripKey(fixtures.requests.strategy())), "Автоматического повтора нет.");
      break;
    }
    case "stale-pending": {
      const pending = fixtures.responses.messagePendingResubmit().user_message;
      const record = { threadId: fixtures.responses.messagePendingResubmit().thread_id, requestKey: pending.request_key, revision: 1, payload: { ...pending.input!, request_key: pending.request_key, revision: 1 } };
      ctx = make();
      pushOutcome("Pending несколько минут, receipt отсутствует", await ctx.coordinator.recover(record), "Сервер разрешил отправку тем же ключом. В демо она не выполняется.");
      const old = new Date(Date.parse(FIXTURE_SERVER_NOW) - 31 * DAY).toISOString();
      ctx = make({ pendingCreatedAt: old });
      pushOutcome("Тот же pending через 31 день", await ctx.coordinator.recover(record), "Повторной отправки нет: отсутствие receipt не доказывает, что AI не выполнялся.");
      break;
    }
    case "reopen": {
      const page = await ctx.api.listThreadMessages(FIXTURE_IDS.strategyThreadId);
      for (const item of page.items) {
        if (item.role === "assistant") push({ title: "Сохранённый результат из истории треда", result: presentAssistantMessage(item) });
      }
      break;
    }
    case "unreadable": {
      const page = await ctx.api.listThreadMessages(FIXTURE_IDS.formatUnsupportedThreadId);
      for (const item of page.items) {
        if (item.role === "assistant") push({ title: "result_status: format_unsupported", result: presentAssistantMessage(item) });
      }
      for (const [title, messageId] of [
        ["503 result_corrupted", FIXTURE_IDS.corruptedResultMessageId],
        ["503 result_unreadable", FIXTURE_IDS.unreadableResultMessageId],
      ] as const) {
        try {
          await ctx.api.getMessageResult(messageId);
        } catch (error) {
          if (!isWebApiError(error)) throw error;
          const view = presentResultError(error);
          push({ title, result: view ?? undefined, error: view ? undefined : { ...presentError(error), code: error.code, status: error.status } });
        }
      }
      break;
    }
    case "foreign": {
      try {
        await ctx.api.getProject(FIXTURE_IDS.foreignProjectId);
      } catch (error) {
        if (!isWebApiError(error)) throw error;
        push({ title: "GET проекта другой организации", error: { ...presentError(error), code: error.code, status: error.status } });
      }
      break;
    }
    case "viewer": {
      ctx = make({ viewer: "viewer_member" });
      push({ title: "Snapshot глазами другого участника", result: presentSnapshot(await ctx.api.getMessageResult(FIXTURE_IDS.strategyAssistantMessageId)) });
      try {
        await ctx.api.submitMessage(FIXTURE_IDS.strategyThreadId, fixtures.requests.strategy());
      } catch (error) {
        if (!isWebApiError(error)) throw error;
        push({ title: "Попытка отправить запрос с ролью viewer", error: { ...presentError(error), code: error.code, status: error.status } });
      }
      break;
    }
  }
  return { steps, simulatedCoreAdmissions: ctx.api.stats.simulatedCoreAdmissions, submitCalls: ctx.api.stats.submitCalls };
}
