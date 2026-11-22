import type { Metadata } from "next";
import { TelegramLogin } from "@/features/account/TelegramLogin";

export const metadata: Metadata = { title: "Вход через Telegram" };

export default function TelegramLoginPage() {
  return <TelegramLogin />;
}
