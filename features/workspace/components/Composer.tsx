"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, type FormEvent } from "react";
import { CloudOff, Paperclip, SendHorizontal } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import styles from "../Workspace.module.css";

export interface ComposerHandle {
  focus: () => void;
}

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
}

const MAX_HEIGHT = 220;

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { value, onChange, onSubmit, placeholder = "Опишите задачу или задайте вопрос по бренду…", disabled },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    },
  }));

  // Auto-grow up to MAX_HEIGHT, then scroll.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!value.trim() || disabled) return;
    onSubmit();
  }

  return (
    <form className={styles.composer} onSubmit={submit}>
      <div className={styles.composerBox}>
        <label htmlFor="workspace-composer" className="sr-only">
          Сообщение для AI
        </label>
        <textarea
          id="workspace-composer"
          ref={textareaRef}
          rows={1}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          className={styles.composerInput}
          aria-describedby="workspace-composer-note"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className={styles.composerBar}>
          <IconButton icon={Paperclip} label="Вложения появятся после подключения хранилища" disabled size="sm" />
          <span className={styles.composerKeys} aria-hidden>
            Enter — отправить · Shift + Enter — новая строка
          </span>
          <Button type="submit" variant="ai" size="sm" icon={SendHorizontal} disabled={!value.trim() || disabled}>
            Отправить
          </Button>
        </div>
      </div>
      <p className={styles.composerNote} id="workspace-composer-note">
        <CloudOff size={13} aria-hidden />
        Демо-версия: AI не подключён. Сообщения сохраняются только в этой вкладке и никуда не отправляются.
      </p>
    </form>
  );
});
