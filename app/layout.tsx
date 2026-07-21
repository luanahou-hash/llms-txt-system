import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "llms.txt 结构化生成与校验系统",
  description: "符合大模型标准索引文件规范，适用于文档提炼与合规校验",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
