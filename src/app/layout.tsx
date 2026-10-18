import type { Metadata } from "next";
import { APP_NAME, APP_SUBTITLE } from "@/shared/constants";
import "./globals.css";

export const metadata: Metadata = {
  title: `${APP_NAME} · 今日`,
  description: APP_SUBTITLE,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh text-ink-100 antialiased">{children}</body>
    </html>
  );
}
