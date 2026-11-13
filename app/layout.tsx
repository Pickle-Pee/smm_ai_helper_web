import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";
import "@/styles/tokens.css";
import "./globals.css";

const onest = Onest({
  subsets: ["latin", "cyrillic"],
  variable: "--font-onest",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "SMM AI Helper", template: "%s · SMM AI Helper" },
  description: "Рабочее пространство маркетолога: бренды, AI-стратегии, контент и документы в одном месте.",
};

export const viewport: Viewport = {
  themeColor: "#15253d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={onest.variable}>
      <body>{children}</body>
    </html>
  );
}
