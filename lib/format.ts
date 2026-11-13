/** Formatting helpers for the Russian UI. Pure functions — safe to unit test. */

const timeFormat = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
const dayMonthFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
const fullDateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const weekdayFormat = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" });

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

const DAY = 24 * 60 * 60 * 1000;

/** «3 диалога», «5 документов». */
export function pluralize(count: number, forms: readonly [one: string, few: string, many: string]): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export function countLabel(count: number, forms: readonly [string, string, string]): string {
  return `${count} ${pluralize(count, forms)}`;
}

/** Relative timestamp used in lists: «только что», «12 мин назад», «сегодня, 14:20», «вчера, 09:05», «12 ноября». */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diff = now.getTime() - date.getTime();
  if (diff < 60_000 && diff > -60_000) return "только что";
  if (diff > 0 && diff < 60 * 60_000) return `${Math.floor(diff / 60_000)} мин назад`;
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY);
  if (days === 0) return `сегодня, ${timeFormat.format(date)}`;
  if (days === 1) return `вчера, ${timeFormat.format(date)}`;
  if (date.getFullYear() === now.getFullYear()) return dayMonthFormat.format(date);
  return fullDateFormat.format(date);
}

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return fullDateFormat.format(new Date(iso));
}

export function formatWeekday(date: Date): string {
  return weekdayFormat.format(date);
}

export type DayBucket = "today" | "yesterday" | "week" | "earlier";

export function dayBucket(iso: string, now: Date = new Date()): DayBucket {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return "week";
  return "earlier";
}

export const dayBucketLabel: Record<DayBucket, string> = {
  today: "Сегодня",
  yesterday: "Вчера",
  week: "На этой неделе",
  earlier: "Ранее",
};

export function formatFileSize(kb: number): string {
  if (kb < 1024) return `${kb} КБ`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0).replace(".", ",")} МБ`;
}

export function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 5) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

export function initials(name: string): string {
  const words = name
    .replace(/[«»"']/g, "")
    .split(/[\s—–-]+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

let counter = 0;
/** Locally unique id for client-side records (never sent anywhere). */
export function createId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

/** Wraps a name in «ёлочки» unless it already contains them: «Little Feet», but Кофейня «Зерно». */
export function quoted(name: string): string {
  return /[«»"]/.test(name) ? name : `«${name}»`;
}
