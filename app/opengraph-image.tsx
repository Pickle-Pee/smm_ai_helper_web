import { ImageResponse } from "next/og";
import { brand } from "@/lib/site";

export const alt = `${brand.name} — ${brand.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Open Graph card, rendered at build time. Latin text only: the bundled OG font has no Cyrillic. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#15253D",
          color: "#FFFFFF",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width="96" height="96" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="9" fill="#22385A" />
            <path d="M7.5 21.5 12.25 16.75 15.75 19.75 21 14.5" stroke="#19B6AE" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M23.5 6c.38 2.3 1.2 3.12 3.5 3.5-2.3.38-3.12 1.2-3.5 3.5-.38-2.3-1.2-3.12-3.5-3.5 2.3-.38 3.12-1.2 3.5-3.5Z" fill="#A79EF4" />
            <circle cx="7.5" cy="21.5" r="1.6" fill="#19B6AE" />
          </svg>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 700, letterSpacing: -2 }}>
            Bren<span style={{ color: "#B2A9F1" }}>vio</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1.5 }}>{brand.tagline}</div>
          <div style={{ fontSize: 30, color: "#BAC6DA" }}>Research · Strategy · Brands · Content · Documents</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 26, color: "#9FE6E1" }}>
          <div style={{ width: 12, height: 12, borderRadius: 6, background: "#19B6AE" }} />
          Preview
        </div>
      </div>
    ),
    size,
  );
}
