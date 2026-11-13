"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Bot, Building2, CreditCard, FlaskConical, KeyRound, Lock, Palette, Plug, RotateCcw, ShieldCheck, User, Users } from "lucide-react";
import { Badge, SoonBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Form";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useToast } from "@/components/ui/Toast";
import { useProjects } from "@/features/projects/store";
import { useWorkspace } from "@/features/workspace/store";
import { useDocuments } from "@/features/documents/store";
import type { DemoView } from "@/lib/resource";
import { roleLabel, useAccount, type AccountProfile } from "./store";
import styles from "./Settings.module.css";

const sections = [
  { id: "profile", label: "Профиль", icon: User },
  { id: "workspace", label: "Рабочее пространство", icon: Building2 },
  { id: "appearance", label: "Интерфейс", icon: Palette },
  { id: "demo", label: "Демо-состояния", icon: FlaskConical },
  { id: "team", label: "Команда", icon: Users },
  { id: "billing", label: "Тариф и оплата", icon: CreditCard },
  { id: "integrations", label: "Интеграции", icon: Plug },
  { id: "security", label: "Безопасность", icon: ShieldCheck },
];

const timezones = [
  { value: "Europe/Kaliningrad", label: "Калининград (UTC+2)" },
  { value: "Europe/Moscow", label: "Москва (UTC+3)" },
  { value: "Europe/Samara", label: "Самара (UTC+4)" },
  { value: "Asia/Yekaterinburg", label: "Екатеринбург (UTC+5)" },
  { value: "Asia/Novosibirsk", label: "Новосибирск (UTC+7)" },
  { value: "Asia/Vladivostok", label: "Владивосток (UTC+10)" },
];

export function SettingsView() {
  return (
    <Page>
      <PageHeader
        title="Настройки"
        description="Профиль и рабочее пространство. В демо-версии изменения хранятся только в этой вкладке; аккаунты, команда и оплата появятся вместе с авторизацией."
      />
      <div className={styles.layout}>
        <nav className={styles.subnav} aria-label="Разделы настроек">
          <ul>
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <li key={s.id}>
                  <a href={`#${s.id}`} className={styles.subnavLink}>
                    <Icon size={16} aria-hidden />
                    {s.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className={styles.sections}>
          <ProfileSection />
          <WorkspaceSection />
          <AppearanceSection />
          <DemoSection />
          <LockedSection
            id="team"
            icon={Users}
            title="Команда"
            description="Приглашение коллег, роли и доступ к проектам."
            items={["Приглашения по email", "Роли: владелец, маркетолог, наблюдатель", "Доступ к отдельным брендам"]}
          />
          <LockedSection
            id="billing"
            icon={CreditCard}
            title="Тариф и оплата"
            description="Тарифы, лимиты AI-запросов и счета."
            items={["Выбор тарифа", "История платежей и закрывающие документы", "Лимиты генераций по проектам"]}
          />
          <LockedSection
            id="integrations"
            icon={Plug}
            title="Интеграции"
            description="Подключение каналов и связка с Telegram-ботом SMM AI Helper."
            items={["Связка аккаунта с Telegram-ботом через подтверждение входа", "Публикация в VK и Telegram-каналы", "Импорт статистики"]}
            extraIcon={Bot}
          />
          <LockedSection
            id="security"
            icon={KeyRound}
            title="Безопасность"
            description="Вход, сессии и журнал действий."
            items={["Вход по email и двухфакторная аутентификация", "Активные сессии", "Журнал действий в пространстве"]}
          />
        </div>
      </div>
    </Page>
  );
}

function Section({ id, icon: Icon, title, description, badge, children }: { id: string; icon: typeof User; title: string; description: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <Card id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <CardHeader
        id={`${id}-title`}
        title={title}
        description={description}
        icon={
          <span className={styles.sectionIcon} aria-hidden>
            <Icon size={16} />
          </span>
        }
        action={badge}
      />
      <div className={styles.sectionBody}>{children}</div>
    </Card>
  );
}

function ProfileSection() {
  const { profile, updateProfile } = useAccount();
  const { notify } = useToast();
  const [name, setName] = useState(profile.name);
  const [role, setRole] = useState<AccountProfile["role"]>(profile.role);
  const [error, setError] = useState<string>();
  const dirty = name !== profile.name || role !== profile.role;

  function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Введите имя — оно используется в приветствии");
      return;
    }
    setError(undefined);
    updateProfile({ name: name.trim(), role });
    setName(name.trim());
    notify({ title: "Профиль сохранён", description: "Изменения действуют в этой вкладке до перезагрузки." });
  }

  return (
    <Section id="profile" icon={User} title="Профиль" description="Как к вам обращаться в интерфейсе">
      <form className={styles.form} onSubmit={save}>
        <div className={styles.formGrid}>
          <Field label="Имя" required error={error}>
            {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />}
          </Field>
          <Field label="Роль">
            {(p) => (
              <Select {...p} value={role} onChange={(e) => setRole(e.target.value as AccountProfile["role"])}>
                {(Object.keys(roleLabel) as AccountProfile["role"][]).map((r) => (
                  <option key={r} value={r}>
                    {roleLabel[r]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Email" hint="Появится вместе с авторизацией" aside={<SoonBadge />}>
            {(p) => <Input {...p} value="" placeholder="name@company.ru" disabled />}
          </Field>
        </div>
        <FormActions dirty={dirty} onReset={() => { setName(profile.name); setRole(profile.role); setError(undefined); }} />
      </form>
    </Section>
  );
}

function WorkspaceSection() {
  const { workspace, updateWorkspace } = useAccount();
  const { notify } = useToast();
  const [name, setName] = useState(workspace.name);
  const [timezone, setTimezone] = useState(workspace.timezone);
  const [error, setError] = useState<string>();
  const dirty = name !== workspace.name || timezone !== workspace.timezone;

  function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Название пространства не может быть пустым");
      return;
    }
    setError(undefined);
    updateWorkspace({ name: name.trim(), timezone });
    setName(name.trim());
    notify({ title: "Рабочее пространство обновлено", description: "Изменения действуют в этой вкладке до перезагрузки." });
  }

  return (
    <Section id="workspace" icon={Building2} title="Рабочее пространство" description="Название агентства или компании и часовой пояс">
      <form className={styles.form} onSubmit={save}>
        <div className={styles.formGrid}>
          <Field label="Название" required error={error}>
            {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}
          </Field>
          <Field label="Часовой пояс">
            {(p) => (
              <Select {...p} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {timezones.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Язык интерфейса" hint="Другие языки появятся позже">
            {(p) => (
              <Select {...p} value="ru" disabled>
                <option value="ru">Русский</option>
              </Select>
            )}
          </Field>
        </div>
        <FormActions dirty={dirty} onReset={() => { setName(workspace.name); setTimezone(workspace.timezone); setError(undefined); }} />
      </form>
    </Section>
  );
}

function FormActions({ dirty, onReset }: { dirty: boolean; onReset: () => void }) {
  return (
    <div className={styles.formActions}>
      {dirty && <span className={styles.dirty}>Есть несохранённые изменения</span>}
      <Button onClick={onReset} disabled={!dirty} variant="ghost">
        Отменить
      </Button>
      <Button type="submit" variant="primary" disabled={!dirty}>
        Сохранить
      </Button>
    </div>
  );
}

function AppearanceSection() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light");
  return (
    <Section id="appearance" icon={Palette} title="Интерфейс" description="Тема оформления">
      <div className={styles.row}>
        <div>
          <p className={styles.rowTitle}>Тема</p>
          <p className={styles.rowHint}>Тёмная и системная темы появятся в следующих версиях.</p>
        </div>
        <SegmentedControl
          legend="Тема оформления"
          value={theme}
          onChange={setTheme}
          options={[
            { value: "light", label: "Светлая" },
            { value: "dark", label: "Тёмная", disabled: true },
            { value: "system", label: "Системная", disabled: true },
          ]}
        />
      </div>
    </Section>
  );
}

function DemoSection() {
  const { demoView, setDemoView } = useAccount();
  const projects = useProjects();
  const workspace = useWorkspace();
  const documents = useDocuments();
  const { notify } = useToast();

  async function reset() {
    setDemoView("live");
    await Promise.all([projects.reload(), workspace.reload(), documents.reload()]);
    notify({ title: "Демо-данные восстановлены", description: "Проекты, диалоги и документы вернулись к исходному набору." });
  }

  return (
    <Section
      id="demo"
      icon={FlaskConical}
      title="Демо-состояния"
      description="Для проверки интерфейса: переключает отображение данных во всех разделах"
      badge={demoView !== "live" ? <Badge tone="warning" dot>Включено</Badge> : undefined}
    >
      <div className={styles.row}>
        <div>
          <p className={styles.rowTitle}>Состояние данных</p>
          <p className={styles.rowHint}>Загрузка, пустые списки и ошибка — так разделы выглядят без данных или при сбое сервиса.</p>
        </div>
        <SegmentedControl<DemoView>
          legend="Состояние данных"
          value={demoView}
          onChange={setDemoView}
          options={[
            { value: "live", label: "Данные" },
            { value: "loading", label: "Загрузка" },
            { value: "empty", label: "Пусто" },
            { value: "error", label: "Ошибка" },
          ]}
        />
      </div>
      <div className={styles.row}>
        <div>
          <p className={styles.rowTitle}>Сбросить демо-данные</p>
          <p className={styles.rowHint}>Удаляет созданные проекты, диалоги и отметки и возвращает исходный набор.</p>
        </div>
        <Button icon={RotateCcw} onClick={reset}>
          Сбросить
        </Button>
      </div>
    </Section>
  );
}

function LockedSection({
  id,
  icon,
  title,
  description,
  items,
  extraIcon: Extra,
}: {
  id: string;
  icon: typeof User;
  title: string;
  description: string;
  items: string[];
  extraIcon?: typeof User;
}) {
  return (
    <Section id={id} icon={icon} title={title} description={description} badge={<Badge tone="outline" icon={Lock}>Недоступно в демо</Badge>}>
      <ul className={styles.lockedList}>
        {items.map((item) => (
          <li key={item}>
            {Extra && item.includes("Telegram") ? <Extra size={15} aria-hidden /> : <Lock size={14} aria-hidden />}
            {item}
          </li>
        ))}
      </ul>
    </Section>
  );
}
