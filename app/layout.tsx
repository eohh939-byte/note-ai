import "./globals.css";
import "@blocknote/react/style.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "智记 · AI 笔记整理本",
  manifest: "/manifest.json",
  description: "基于大模型的笔记整理本，支持电脑与平板触屏",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
