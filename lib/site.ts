/**
 * Brand and deployment settings in one place, so the product name or domain
 * can change without touching components.
 *
 * SITE_URL is read at build time (static pages are prerendered). It is not a
 * NEXT_PUBLIC_ variable and holds no secrets; it only feeds canonical/Open Graph URLs.
 */
export const brand = {
  name: "Brenvio",
  tagline: "AI Marketing Copilot",
  taglineRu: "AI-копилот для маркетинга",
  description:
    "Brenvio — AI-копилот для маркетинга: исследование рынка, стратегии, работа с брендами, контент и документы в одном рабочем пространстве.",
} as const;

const FALLBACK_URL = "http://localhost:3000";

export function siteUrl(): URL {
  const raw = process.env.SITE_URL?.trim();
  if (!raw) return new URL(FALLBACK_URL);
  try {
    return new URL(raw);
  } catch {
    return new URL(FALLBACK_URL);
  }
}

/**
 * The public deployment is a preview: keep it out of search engines unless
 * ALLOW_INDEXING=true is set explicitly at build time.
 */
export function allowIndexing(): boolean {
  return process.env.ALLOW_INDEXING === "true";
}

export const appVersion = process.env.APP_VERSION?.trim() || "dev";
