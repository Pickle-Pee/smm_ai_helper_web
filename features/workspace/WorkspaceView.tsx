"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CloudOff, History, MessageSquarePlus, PanelRight, SearchX, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink, IconButton } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Form";
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { LogoMark } from "@/components/brand/Logo";
import { useProjects } from "@/features/projects/store";
import { formatTime, quoted } from "@/lib/format";
import { cx } from "@/lib/cx";
import type { ID, Message, ScenarioId, Thread } from "@/lib/types";
import { sortThreads } from "./model";
import { useWorkspace } from "./store";
import { scenarioById, scenarioPrompt, scenarios } from "./scenarios";
import { Composer, type ComposerHandle } from "./components/Composer";
import { ContextPanel } from "./components/ContextPanel";
import { ResultCard } from "./components/ResultCard";
import { ThreadList } from "./components/ThreadList";
import styles from "./Workspace.module.css";

export function WorkspaceView() {
  const router = useRouter();
  const params = useSearchParams();
  const { notify } = useToast();
  const workspace = useWorkspace();
  const { threads, status, pendingDraft, consumeDraft, createThread, addLocalMessage, setThreadProject, deleteThread, retry } = workspace;
  const { projects, byId } = useProjects();
  const composerRef = useRef<ComposerHandle>(null);

  const [draft, setDraft] = useState("");
  const [draftProjectId, setDraftProjectId] = useState<ID | null>(null);
  const [draftScenario, setDraftScenario] = useState<ScenarioId | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const requestedId = params.get("thread");
  const isNew = params.get("new") === "1";
  const sorted = useMemo(() => sortThreads(threads), [threads]);
  const requested = requestedId ? threads.find((t) => t.id === requestedId) ?? null : null;
  const thread: Thread | null = isNew ? null : requestedId ? requested : (sorted[0] ?? null);
  const notFound = status === "ready" && !isNew && requestedId !== null && requested === null;

  // Draft prepared by another screen (dashboard, documents, project page).
  useEffect(() => {
    if (!pendingDraft) return;
    setDraft(pendingDraft.text);
    setDraftProjectId(pendingDraft.projectId);
    setDraftScenario(pendingDraft.scenarioId);
    consumeDraft();
    requestAnimationFrame(() => composerRef.current?.focus());
  }, [pendingDraft, consumeDraft]);

  // Default brand for a new conversation: first active project.
  useEffect(() => {
    if (isNew && !draftProjectId && !pendingDraft) {
      const first = projects.find((p) => p.status === "active");
      if (first) setDraftProjectId(first.id);
    }
  }, [isNew, draftProjectId, projects, pendingDraft]);

  const projectId = thread ? thread.projectId : draftProjectId;
  const project = projectId ? byId.get(projectId) ?? null : null;

  function startNew() {
    setDraft("");
    setDraftScenario(null);
    setHistoryOpen(false);
    router.push("/workspace?new=1", { scroll: false });
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function applyScenario(id: ScenarioId) {
    const scenario = scenarioById.get(id);
    if (!scenario) return;
    setDraft(scenarioPrompt(scenario, project?.name));
    if (!thread) setDraftScenario(id);
    setContextOpen(false);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function send() {
    const text = draft.trim();
    if (!text) return;
    if (thread) {
      addLocalMessage(thread.id, text);
    } else {
      const created = createThread({ projectId: draftProjectId, scenarioId: draftScenario, text });
      router.replace(`/workspace?thread=${created.id}`, { scroll: false });
    }
    setDraft("");
    setDraftScenario(null);
  }

  function changeProject(value: string) {
    const next = value || null;
    if (thread) setThreadProject(thread.id, next);
    else setDraftProjectId(next);
  }

  function removeThread() {
    if (!thread) return;
    deleteThread(thread.id);
    setConfirmDelete(false);
    notify({ title: "Диалог удалён", description: "Удаление действует до перезагрузки страницы." });
    router.replace("/workspace", { scroll: false });
  }

  const selectableProjects = projects.filter((p) => p.status !== "archived" || p.id === projectId);
  const title = thread ? thread.title : "Новый диалог";

  return (
    <div className={styles.workspace}>
      <aside className={styles.historyPane} aria-label="История диалогов">
        <ThreadList activeId={thread?.id ?? null} onNew={startNew} />
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
                aria-label="Бренд для контекста диалога"
                value={projectId ?? ""}
                onChange={(e) => changeProject(e.target.value)}
                wrapperClassName={styles.brandSelect}
                disabled={status !== "ready"}
              >
                <option value="">Без бренда</option>
                {selectableProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              {(thread?.scenarioId || draftScenario) && (
                <Badge tone="ai" className={styles.scenarioBadge}>
                  {scenarioById.get((thread?.scenarioId ?? draftScenario) as ScenarioId)?.title}
                </Badge>
              )}
            </div>
          </div>
          <div className={styles.chatActions}>
            <IconButton icon={PanelRight} label="Контекст бренда" className={styles.contextToggle} onClick={() => setContextOpen(true)} />
            {thread && <IconButton icon={Trash2} label="Удалить диалог" onClick={() => setConfirmDelete(true)} />}
            <Button icon={MessageSquarePlus} size="sm" onClick={startNew} className={styles.newButton}>
              Новый диалог
            </Button>
          </div>
        </header>

        <div className={styles.chatBody}>
          {status === "loading" && <ChatSkeleton />}
          {status === "error" && (
            <ErrorState onRetry={retry} title="Не удалось открыть AI Workspace" description="История диалогов временно недоступна. Попробуйте ещё раз." />
          )}
          {notFound && (
            <EmptyState
              icon={SearchX}
              title="Диалог не найден"
              description="Возможно, он был удалён или создан в другой вкладке — в демо-версии диалоги не сохраняются между перезагрузками."
              action={
                <Button variant="primary" onClick={startNew}>
                  Начать новый диалог
                </Button>
              }
            />
          )}
          {status === "ready" && !notFound && thread && <MessageList thread={thread} />}
          {status === "ready" && !notFound && !thread && <NewThreadIntro brandName={project?.name} onPick={applyScenario} />}
        </div>

        {status === "ready" && !notFound && (
          <Composer ref={composerRef} value={draft} onChange={setDraft} onSubmit={send} />
        )}
      </section>

      <aside className={styles.contextPane} aria-label="Контекст бренда">
        <ContextPanel project={project} onUseScenario={applyScenario} />
      </aside>

      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} title="История диалогов" variant="sheet" side="left" size="sm">
        <ThreadList activeId={thread?.id ?? null} onNew={startNew} onNavigate={() => setHistoryOpen(false)} />
      </Dialog>
      <Dialog open={contextOpen} onClose={() => setContextOpen(false)} title="Контекст бренда" variant="sheet">
        <ContextPanel project={project} onUseScenario={applyScenario} />
      </Dialog>
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Удалить диалог?"
        description={`«${title}» и все его сообщения будут удалены из этой вкладки.`}
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Отмена</Button>
            <Button variant="danger" icon={Trash2} onClick={removeThread}>
              Удалить
            </Button>
          </>
        }
      />
    </div>
  );
}

function MessageList({ thread }: { thread: Thread }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef<HTMLLIElement>(null);
  const prevThread = useRef<ID | null>(null);
  const prevCount = useRef(0);

  useEffect(() => {
    const switched = prevThread.current !== thread.id;
    const grew = thread.messages.length > prevCount.current;
    prevThread.current = thread.id;
    prevCount.current = thread.messages.length;
    const container = scrollRef.current;
    const last = lastRef.current;
    if (switched && container && last) {
      // Scroll only the message list (scrollIntoView would also scroll the page).
      container.scrollTop += last.getBoundingClientRect().top - container.getBoundingClientRect().top - 16;
    } else if (grew && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [thread.id, thread.messages.length]);

  if (thread.messages.length === 0) {
    return (
      <div className={styles.messages}>
        <EmptyState compact tone="ai" icon={Sparkles} title="Диалог пуст" description="Напишите первое сообщение ниже." />
      </div>
    );
  }

  return (
    <div className={styles.messages} ref={scrollRef}>
      <ol className={styles.messageList} role="log" aria-label="Сообщения">
        {thread.messages.map((m, i) => (
          <li key={m.id} ref={i === thread.messages.length - 1 ? lastRef : undefined} className={styles.messageItem}>
            <MessageView message={m} threadId={thread.id} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function MessageView({ message, threadId }: { message: Message; threadId: ID }) {
  if (message.role === "user") {
    return (
      <div className={styles.userMessage}>
        <div className={styles.userBubble}>{message.text}</div>
        <div className={styles.messageMeta}>
          {message.delivery === "local" ? (
            <span className={styles.localNote}>
              <CloudOff size={12} aria-hidden /> Сохранено локально · AI не подключён
            </span>
          ) : (
            <span>Вы</span>
          )}
          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.aiMessage}>
      <div className={styles.aiHeader}>
        <LogoMark size={26} />
        <span className={styles.aiName}>Brenvio AI</span>
        <Badge tone="outline" size="sm" title="Ответ из демонстрационного набора данных">
          Пример ответа
        </Badge>
        <time className={styles.aiTime} dateTime={message.createdAt}>
          {formatTime(message.createdAt)}
        </time>
      </div>
      <p className={styles.aiText}>{message.text}</p>
      {message.result && <ResultCard threadId={threadId} messageId={message.id} result={message.result} />}
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
          Выберите сценарий — мы подставим готовую формулировку запроса с учётом бренда. Её можно отредактировать перед отправкой.
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
        <p className={cx(styles.introText, styles.introFootnote)}>
          Нужен контекст бренда? <ButtonLink href="/projects" variant="ghost" size="sm">Заполнить в проектах</ButtonLink>
        </p>
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
