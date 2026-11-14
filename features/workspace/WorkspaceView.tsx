"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FlaskConical, History, Info, MessageSquarePlus, PanelRight, SearchX, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Form";
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { LogoMark } from "@/components/brand/Logo";
import { useAccount } from "@/features/account/store";
import { useProjects } from "@/features/projects/store";
import type { SubmitScenario } from "@/lib/api/v2/fixture-client";
import type { ThreadMessageView } from "@/lib/api/v2/presenters";
import { formatTime, quoted } from "@/lib/format";
import { cx } from "@/lib/cx";
import type { ID, ScenarioId } from "@/lib/types";
import { useWorkspace } from "./store";
import { scenarioById, scenarioPrompt, scenarios } from "./scenarios";
import { useWorkspaceV2 } from "./v2/provider";
import type { ThreadDetailView, WorkspaceV2Controller } from "./v2/controller";
import { defaultFixtureAnswer, FIXTURE_ANSWERS, FIXTURE_LABEL } from "./v2/simulation";
import { ClarificationForm } from "./components/ClarificationForm";
import { Composer, type ComposerHandle } from "./components/Composer";
import { ContextPanel } from "./components/ContextPanel";
import { RequestStatus, StartNewRequestDialog } from "./components/RequestStatus";
import { ThreadList, type ThreadListItem } from "./components/ThreadList";
import { WorkspaceResultCard } from "./components/WorkspaceResultCard";
import styles from "./Workspace.module.css";
import stateStyles from "./components/RequestState.module.css";

const PREVIEW_NOTE =
  "Тестовый режим: запросы обрабатывает тестовый сервер Web API v2 прямо в браузере. AI не подключён, данные сбрасываются при перезагрузке страницы.";

/**
 * AI Workspace (F2): projects, threads, history and AI requests come from Web API v2 through the
 * `WorkspaceV2Controller` (fixture transport only). The legacy workspace store is used here ONLY to receive
 * drafts prepared on other screens and to recognise links to its demo threads.
 */
export function WorkspaceView() {
  const router = useRouter();
  const params = useSearchParams();
  const { notify } = useToast();
  const legacy = useWorkspace();
  const { byId: legacyProjects } = useProjects();
  const { demoView, setDemoView } = useAccount();
  const { controller, state } = useWorkspaceV2();
  const composerRef = useRef<ComposerHandle>(null);

  const [draft, setDraft] = useState("");
  const [draftProjectId, setDraftProjectId] = useState<ID | null>(null);
  const [draftScenario, setDraftScenario] = useState<ScenarioId | null>(null);
  const [fixtureAnswer, setFixtureAnswer] = useState<SubmitScenario>("direct_result");
  const [projectNotice, setProjectNotice] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [startNewOpen, setStartNewOpen] = useState(false);

  // Demo-state override from Settings («Демо-состояния») applies to the Workspace as before.
  const ready = state.status === "ready";
  const viewStatus: "loading" | "ready" | "error" =
    demoView === "loading" ? "loading" : demoView === "error" ? "error" : state.status === "error" ? "error" : ready ? "ready" : "loading";
  const threads = demoView === "empty" ? [] : state.threads;

  const requestedId = params.get("thread");
  const isNew = params.get("new") === "1";
  const threadId: string | null = isNew ? null : (requestedId ?? threads[0]?.id ?? null);
  const summary = threadId ? (state.threads.find((t) => t.id === threadId) ?? null) : null;
  const detail: ThreadDetailView | null = threadId ? (state.details[threadId] ?? null) : null;
  const legacyThread = requestedId ? (legacy.threads.find((t) => t.id === requestedId) ?? null) : null;

  // Lazy history: a thread's messages are read when it is opened.
  useEffect(() => {
    if (!controller || !ready) return;
    if (threadId) void controller.openThread(threadId);
    else controller.closeThread();
  }, [controller, ready, threadId]);

  // Draft prepared by another screen (dashboard, documents, project page). Those screens use the legacy demo
  // dataset: a project id that the Web API v2 test data does not have is NOT mapped to another project.
  useEffect(() => {
    if (!legacy.pendingDraft || !ready || !controller) return;
    const { text, projectId, scenarioId } = legacy.pendingDraft;
    setDraft(text);
    setDraftScenario(scenarioId);
    setFixtureAnswer(defaultFixtureAnswer(scenarioId));
    if (projectId && controller.projectById(projectId)) {
      setDraftProjectId(projectId);
      setProjectNotice(null);
    } else {
      setDraftProjectId(null);
      const name = projectId ? legacyProjects.get(projectId)?.name : null;
      setProjectNotice(
        projectId
          ? `Проект ${name ? quoted(name) : ""} из демо-набора отсутствует в тестовых данных Web API v2. Выберите проект вручную — запрос не будет отправлен в другой проект автоматически.`
          : null,
      );
    }
    legacy.consumeDraft();
    requestAnimationFrame(() => composerRef.current?.focus());
  }, [legacy, legacyProjects, ready, controller]);

  // Default project for a new conversation: first active fixture project (unless a draft asked for another).
  useEffect(() => {
    if (isNew && !draftProjectId && !projectNotice && !legacy.pendingDraft) {
      const first = state.projects.find((p) => p.project.status === "active");
      if (first) setDraftProjectId(first.project.id);
    }
  }, [isNew, draftProjectId, projectNotice, legacy.pendingDraft, state.projects]);

  const projectId = summary ? summary.projectId : draftProjectId;
  const projectView = controller?.projectById(projectId) ?? null;
  const project = projectView?.project ?? null;
  const notFound = viewStatus === "ready" && !isNew && !!threadId && detail?.status === "not_found";
  const listItems: ThreadListItem[] = useMemo(
    () => threads.map((t) => ({ id: t.id, title: t.title, projectId: t.projectId, updatedAt: t.updatedAt, busy: !!t.inFlight })),
    [threads],
  );
  const listProjects = useMemo(() => state.projects.map((p) => ({ id: p.project.id, name: p.project.name, color: p.project.color })), [state.projects]);

  function retry() {
    if (demoView !== "live") setDemoView("live");
    else void controller?.reload();
  }

  function startNew() {
    setDraft("");
    setDraftScenario(null);
    setProjectNotice(null);
    setHistoryOpen(false);
    router.push("/workspace?new=1", { scroll: false });
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function applyScenario(id: ScenarioId) {
    const scenario = scenarioById.get(id);
    if (!scenario) return;
    setDraft(scenarioPrompt(scenario, project?.name));
    setFixtureAnswer(defaultFixtureAnswer(id));
    if (!summary) setDraftScenario(id);
    setContextOpen(false);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  async function send() {
    const text = draft.trim();
    if (!text || !controller) return;
    if (summary) {
      setDraft("");
      await controller.submit(summary.id, text, fixtureAnswer);
      return;
    }
    if (!draftProjectId) return;
    const result = await controller.createThreadAndSubmit({ projectId: draftProjectId, text, scenario: fixtureAnswer });
    if ("threadId" in result) {
      setDraft("");
      setDraftScenario(null);
      router.replace(`/workspace?thread=${result.threadId}`, { scroll: false });
    } else {
      notify({ tone: "info", title: "Запрос не отправлен", description: result.error.text });
    }
  }

  // Why the composer cannot send right now (null = it can).
  const disabledReason = composerBlockReason({ controller, isNew: !summary, draftProjectId, projectCanSubmit: projectView?.canSubmit ?? false, threadId: summary?.id ?? null, detail, kind: summary?.kind ?? "copilot", creating: state.creating });
  const execution = detail?.request.execution ?? null;
  const latestNeedsInput = execution?.canAnswerClarification ? execution.requestKey : null;
  const title = summary ? summary.title : "Новый диалог";
  const selectableProjects = state.projects.filter((p) => p.project.status !== "archived" || p.project.id === projectId);

  const threadList = (onNavigate?: () => void) => (
    <ThreadList threads={listItems} projects={listProjects} status={viewStatus} onRetry={retry} activeId={summary?.id ?? null} onNew={startNew} onNavigate={onNavigate} />
  );

  return (
    <div className={styles.workspace}>
      <aside className={styles.historyPane} aria-label="История диалогов">
        {threadList()}
      </aside>

      <section className={styles.chat} aria-label="Диалог с AI">
        <header className={styles.chatHeader}>
          <IconButton icon={History} label="История диалогов" className={styles.historyToggle} onClick={() => setHistoryOpen(true)} />
          <div className={styles.chatTitleBlock}>
            <h1 className={styles.chatTitle} title={title}>
              {title}
            </h1>
            <div className={styles.chatMeta}>
              <Select
                controlSize="sm"
                aria-label="Проект для запроса"
                value={projectId ?? ""}
                onChange={(e) => {
                  setDraftProjectId(e.target.value || null);
                  if (e.target.value) setProjectNotice(null);
                }}
                wrapperClassName={styles.brandSelect}
                disabled={viewStatus !== "ready" || !!summary}
                title={summary ? "Диалог принадлежит проекту; проект диалога не меняется" : undefined}
              >
                <option value="">Выберите проект</option>
                {selectableProjects.map((p) => (
                  <option key={p.project.id} value={p.project.id}>
                    {p.project.name}
                  </option>
                ))}
              </Select>
              {!summary && draftScenario && (
                <Badge tone="ai" className={styles.scenarioBadge}>
                  {scenarioById.get(draftScenario)?.title}
                </Badge>
              )}
              <Badge tone="outline" size="sm" icon={FlaskConical} className={styles.scenarioBadge} title={FIXTURE_LABEL}>
                Тестовые данные
              </Badge>
            </div>
          </div>
          <div className={styles.chatActions}>
            <IconButton icon={PanelRight} label="Контекст бренда" className={styles.contextToggle} onClick={() => setContextOpen(true)} />
            <Button icon={MessageSquarePlus} size="sm" onClick={startNew} className={styles.newButton}>
              Новый диалог
            </Button>
          </div>
        </header>

        <div className={styles.chatBody}>
          {viewStatus === "loading" && <ChatSkeleton />}
          {viewStatus === "error" && (
            <ErrorState onRetry={retry} title="Не удалось открыть AI Workspace" description="Тестовые данные временно недоступны. Попробуйте ещё раз." />
          )}
          {notFound && (
            <EmptyState
              icon={SearchX}
              title={legacyThread ? "Этот диалог из демо-набора главной страницы" : "Диалог не найден"}
              description={
                legacyThread
                  ? `«${legacyThread.title}» есть только в демонстрационных данных Главной и Проектов. AI Workspace работает с тестовыми данными Web API v2, где такого диалога нет.`
                  : "В тестовых данных Web API v2 нет такого диалога или нет доступа к нему. Тестовые данные сбрасываются при перезагрузке страницы."
              }
              action={
                <Button variant="primary" onClick={startNew}>
                  Начать новый диалог
                </Button>
              }
            />
          )}
          {viewStatus === "ready" && !notFound && summary && detail && (
            <ThreadMessages
              threadId={summary.id}
              detail={detail}
              latestNeedsInputKey={latestNeedsInput}
              canAct={projectView?.canSubmit ?? false}
              controller={controller}
            />
          )}
          {viewStatus === "ready" && !notFound && threadId && !detail && <ChatSkeleton />}
          {viewStatus === "ready" && !notFound && !threadId && <NewThreadIntro brandName={project?.name} onPick={applyScenario} />}
        </div>

        {viewStatus === "ready" && !notFound && (
          <>
            {projectNotice && !summary && (
              <p className={cx(stateStyles.notice, stateStyles.status, stateStyles.statusWarning)} role="status">
                <span className={stateStyles.statusText}>
                  <Info size={14} aria-hidden /> {projectNotice}
                </span>
              </p>
            )}
            {summary && detail && controller && (
              <div className={styles.composer}>
                <RequestStatus
                  request={detail.request}
                  canAct={projectView?.canSubmit ?? false}
                  actions={{
                    onCheckStatus: () => void controller.checkStatus(summary.id),
                    onStopWaiting: () => controller.stopWaiting(summary.id),
                    onResumeWaiting: () => void controller.resumeWaiting(summary.id),
                    onResubmitSameKey: () => void controller.resubmitSameKey(summary.id),
                    onStartNew: () => setStartNewOpen(true),
                  }}
                />
              </div>
            )}
            <Composer
              ref={composerRef}
              value={draft}
              onChange={setDraft}
              onSubmit={() => void send()}
              disabled={!!disabledReason}
              disabledReason={disabledReason}
              placeholder="Опишите задачу для Copilot-сценария…"
              note={PREVIEW_NOTE}
              toolbar={
                <div className={stateStyles.simBar}>
                  <FlaskConical size={14} aria-hidden />
                  <label htmlFor="workspace-fixture-answer" className={stateStyles.simLabel}>Тестовый ответ сервера:</label>
                  <Select
                    id="workspace-fixture-answer"
                    controlSize="sm"
                    wrapperClassName={stateStyles.simSelect}
                    value={fixtureAnswer}
                    onChange={(e) => setFixtureAnswer(e.target.value as SubmitScenario)}
                  >
                    {FIXTURE_ANSWERS.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </Select>
                </div>
              }
            />
          </>
        )}
      </section>

      <aside className={styles.contextPane} aria-label="Контекст бренда">
        <ContextPanel project={project} onUseScenario={applyScenario} projectLink={false} emptyDescription="Выберите проект из тестовых данных в шапке диалога." />
      </aside>

      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} title="История диалогов" variant="sheet" side="left" size="sm">
        {threadList(() => setHistoryOpen(false))}
      </Dialog>
      <Dialog open={contextOpen} onClose={() => setContextOpen(false)} title="Контекст бренда" variant="sheet">
        <ContextPanel project={project} onUseScenario={applyScenario} projectLink={false} emptyDescription="Выберите проект из тестовых данных в шапке диалога." />
      </Dialog>
      {summary && controller && (
        <StartNewRequestDialog
          open={startNewOpen}
          text={detail?.request.pendingMessage ?? lastUserText(detail)}
          warning={
            execution?.newRequestWarning ??
            "Новый запрос получит новый ключ. Прежняя генерация могла состояться, поэтому результат может быть создан повторно (и повторно учтён в лимитах)."
          }
          inNewThread={execution?.status === "running_overdue" || execution?.status === "running" || execution?.status === "pending"}
          onCancel={() => setStartNewOpen(false)}
          onConfirm={async () => {
            setStartNewOpen(false);
            const result = await controller.startNewRequest(summary.id, {}, { acknowledgeMayRegenerate: true }, fixtureAnswer);
            if (result && result.threadId !== summary.id) router.replace(`/workspace?thread=${result.threadId}`, { scroll: false });
          }}
        />
      )}
    </div>
  );
}

function lastUserText(detail: ThreadDetailView | null): string {
  const last = [...(detail?.messages ?? [])].reverse().find((m) => m.role === "user");
  return last?.role === "user" ? last.text : "";
}

function composerBlockReason(input: {
  controller: WorkspaceV2Controller | null;
  isNew: boolean;
  draftProjectId: string | null;
  projectCanSubmit: boolean;
  threadId: string | null;
  detail: ThreadDetailView | null;
  kind: string;
  creating: boolean;
}): string | null {
  if (!input.controller) return "Загружаем тестовые данные…";
  if (input.isNew) {
    if (!input.draftProjectId) return "Выберите проект из тестовых данных, чтобы отправить запрос.";
    if (!input.projectCanSubmit) return "Ваша роль в проекте — наблюдатель: отправлять запросы нельзя.";
    if (input.creating) return "Создаём диалог…";
    return null;
  }
  if (!input.threadId || !input.detail || input.detail.status !== "ready") return "Загружаем диалог…";
  if (input.kind !== "copilot") return "Свободный веб-чат появится на следующих этапах. Сейчас доступны только Copilot-сценарии.";
  if (!input.projectCanSubmit) return "Ваша роль в проекте — наблюдатель: отправлять запросы нельзя.";
  const { phase, execution } = input.detail.request;
  if (phase === "submitting") return "Запрос отправляется…";
  if (input.controller.canStartNormalRequest(input.threadId)) return null;
  const status = execution?.status;
  if (status === "pending" || status === "running" || status === "running_overdue") return "В этом диалоге выполняется запрос. Дождитесь результата.";
  return "Исход предыдущего запроса не подтверждён. Проверьте статус или явно начните новый запрос выше.";
}

function ThreadMessages({
  threadId,
  detail,
  latestNeedsInputKey,
  canAct,
  controller,
}: {
  threadId: string;
  detail: ThreadDetailView;
  latestNeedsInputKey: string | null;
  canAct: boolean;
  controller: WorkspaceV2Controller | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef<HTMLLIElement>(null);
  const prevThread = useRef<string | null>(null);
  const prevCount = useRef(0);
  const count = detail.messages.length;

  useEffect(() => {
    const switched = prevThread.current !== threadId;
    const grew = count > prevCount.current;
    prevThread.current = threadId;
    prevCount.current = count;
    const container = scrollRef.current;
    const last = lastRef.current;
    if (switched && container && last) {
      // Scroll only the message list (scrollIntoView would also scroll the page).
      container.scrollTop += last.getBoundingClientRect().top - container.getBoundingClientRect().top - 16;
    } else if (grew && container) {
      container.scrollTo?.({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [threadId, count]);

  if (detail.status === "loading" && count === 0) return <ChatSkeleton />;
  if (detail.status === "error") {
    return <ErrorState onRetry={() => void controller?.openThread(threadId)} title="История диалога не загрузилась" description="Попробуйте открыть диалог ещё раз." />;
  }
  if (count === 0) {
    const pending = detail.request.phase !== "idle";
    return (
      <div className={styles.messages}>
        <EmptyState
          compact
          tone="ai"
          icon={Sparkles}
          title={pending ? "Сообщений пока нет" : "Диалог пуст"}
          description={
            pending
              ? "Сообщения появятся, когда тестовый сервер подтвердит запрос. Состояние запроса — ниже."
              : "Опишите задачу ниже — запрос уйдёт тестовому серверу Web API v2."
          }
        />
      </div>
    );
  }

  const lastAssistantId = [...detail.messages].reverse().find((m) => m.role === "assistant")?.id;
  const submitting = detail.request.phase === "submitting";

  return (
    <div className={styles.messages} ref={scrollRef}>
      <ol className={styles.messageList} role="log" aria-label="Сообщения">
        {detail.messages.map((m, i) => (
          <li key={m.id} ref={i === count - 1 ? lastRef : undefined} className={styles.messageItem}>
            <MessageView
              message={m}
              onReopen={m.role === "assistant" ? () => void controller?.openResult(threadId, m.id) : undefined}
              clarification={
                m.role === "assistant" &&
                m.id === lastAssistantId &&
                latestNeedsInputKey &&
                canAct &&
                m.result.status === "available" &&
                m.result.clarification ? (
                  <ClarificationForm
                    clarification={m.result.clarification}
                    disabled={submitting}
                    onSubmit={(answer) => void controller?.answerClarification(threadId, answer)}
                  />
                ) : null
              }
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function MessageView({ message, onReopen, clarification }: { message: ThreadMessageView; onReopen?: () => void; clarification: ReactNode }) {
  if (message.role === "user") {
    return (
      <div className={styles.userMessage}>
        {message.revision > 1 && <span className={stateStyles.revisionNote}>Уточнение к запросу · версия {message.revision}</span>}
        <div className={styles.userBubble}>
          {message.text}
          {message.context.length > 0 && (
            <ul className={stateStyles.contextList}>
              {message.context.map((c) => (
                <li key={c.label}>
                  {c.label}: {c.value}
                </li>
              ))}
              {message.confirmedStatements > 0 && <li>Подтверждено утверждений с сайта: {message.confirmedStatements}</li>}
            </ul>
          )}
        </div>
        <div className={styles.messageMeta}>
          <span>{message.author.isSelf ? "Вы" : (message.author.displayName ?? "Участник")}</span>
          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.aiMessage}>
      <div className={styles.aiHeader}>
        <LogoMark size={26} />
        <span className={styles.aiName}>Brenvio Copilot</span>
        <Badge tone="outline" size="sm" icon={FlaskConical} title={FIXTURE_LABEL}>
          Тестовые данные
        </Badge>
        <time className={styles.aiTime} dateTime={message.createdAt}>
          {formatTime(message.createdAt)}
        </time>
      </div>
      <WorkspaceResultCard view={message.result} onReopen={onReopen}>
        {clarification}
      </WorkspaceResultCard>
    </div>
  );
}

function NewThreadIntro({ brandName, onPick }: { brandName?: string; onPick: (id: ScenarioId) => void }) {
  return (
    <div className={styles.messages}>
      <div className={styles.intro}>
        <span className={styles.introMark} aria-hidden>
          <Sparkles size={22} />
        </span>
        <h2 className={styles.introTitle}>С чего начнём{brandName ? ` для ${quoted(brandName)}` : ""}?</h2>
        <p className={styles.introText}>
          Выберите Copilot-сценарий — мы подставим формулировку запроса. Свободный чат пока недоступен: работают только подготовленные
          сценарии, а ответы в этой версии берутся из тестовых данных.
        </p>
        <ul className={styles.introGrid}>
          {scenarios.map((s) => {
            const Icon = s.icon;
            return (
              <li key={s.id}>
                <button type="button" className={styles.introCard} onClick={() => onPick(s.id)}>
                  <span className={styles.scenarioIcon} aria-hidden>
                    <Icon size={17} />
                  </span>
                  <span className={styles.introCardTitle}>{s.title}</span>
                  <span className={styles.introCardText}>{s.description}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className={cx(styles.introText, styles.introFootnote)}>{FIXTURE_LABEL}</p>
      </div>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <LoadingRegion label="Загрузка диалога" className={styles.messages}>
      <div className={styles.messageList}>
        <div className={styles.userMessage}>
          <Skeleton width={320} height={56} radius={14} />
        </div>
        <div className={styles.aiMessage}>
          <Skeleton width={180} height={14} />
          <Skeleton height={14} style={{ marginTop: 14 }} />
          <Skeleton width="85%" height={14} style={{ marginTop: 8 }} />
          <Skeleton height={220} radius={12} style={{ marginTop: 18 }} />
        </div>
      </div>
    </LoadingRegion>
  );
}
