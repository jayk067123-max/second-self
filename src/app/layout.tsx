import type { Metadata } from "next";
import { APP_NAME, APP_SUBTITLE } from "@/shared/constants";
import "./globals.css";

export const metadata: Metadata = {
  title: `${APP_NAME} · 骨架`,
  description: APP_SUBTITLE,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh bg-ink-950 text-ink-100 antialiased">
        <div className="bg-grid min-h-dvh">{children}</div>
      </body>
    </html>
  );
}
