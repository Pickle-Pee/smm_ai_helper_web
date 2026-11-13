import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";
import { allowIndexing, brand, siteUrl } from "@/lib/site";
import "@/styles/tokens.css";
import "./globals.css";

const onest = Onest({
  subsets: ["latin", "cyrillic"],
  variable: "--font-onest",
  display: "swap",
});

const indexable = allowIndexing();

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  applicationName: brand.name,
  title: { default: `${brand.name} — ${brand.tagline}`, template: `%s · ${brand.name}` },
  description: brand.description,
  robots: indexable ? { index: true, follow: true } : { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  openGraph: {
    type: "website",
    siteName: brand.name,
    locale: "ru_RU",
    title: `${brand.name} — ${brand.tagline}`,
    description: brand.description,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: `${brand.name} — ${brand.tagline}`, description: brand.description },
  formatDetection: { telephone: false, email: false, address: false },
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
