import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import manifest from "@/app/manifest";
import { allowIndexing, brand, siteUrl } from "./site";

afterEach(() => vi.unstubAllEnvs());

describe("site settings", () => {
  it("uses SITE_URL and falls back to localhost for empty or invalid values", () => {
    vi.stubEnv("SITE_URL", "https://app.24rubridge.ru");
    expect(siteUrl().origin).toBe("https://app.24rubridge.ru");
    vi.stubEnv("SITE_URL", "not a url");
    expect(siteUrl().origin).toBe("http://localhost:3000");
    vi.stubEnv("SITE_URL", "");
    expect(siteUrl().origin).toBe("http://localhost:3000");
  });

  it("keeps the preview out of search engines unless explicitly allowed", () => {
    vi.stubEnv("ALLOW_INDEXING", "");
    expect(allowIndexing()).toBe(false);
    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
    vi.stubEnv("ALLOW_INDEXING", "yes");
    expect(allowIndexing()).toBe(false);
    vi.stubEnv("ALLOW_INDEXING", "true");
    expect(robots().rules).toEqual({ userAgent: "*", allow: "/" });
  });

  it("brands the manifest as Brenvio", () => {
    expect(brand.name).toBe("Brenvio");
    expect(manifest()).toMatchObject({ short_name: "Brenvio", name: "Brenvio — AI Marketing Copilot", lang: "ru" });
  });
});
