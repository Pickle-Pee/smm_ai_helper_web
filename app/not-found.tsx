import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <div style={{ display: "grid", justifyItems: "center", gap: 16, maxWidth: 420 }}>
        <Logo />
        <p style={{ fontSize: 56, fontWeight: 700, letterSpacing: "-0.04em", color: "var(--violet-600)", lineHeight: 1 }}>404</p>
        <h1 style={{ fontSize: 22 }}>Такой страницы нет</h1>
        <p style={{ color: "var(--color-text-secondary)" }}>Проверьте адрес или вернитесь на рабочий стол.</p>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 40,
            padding: "0 16px",
            borderRadius: 8,
            background: "var(--color-accent)",
            color: "var(--color-accent-on)",
            fontWeight: 600,
          }}
        >
          На рабочий стол
        </Link>
      </div>
    </main>
  );
}
