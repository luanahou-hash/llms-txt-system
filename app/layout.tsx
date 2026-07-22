import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "llms.txt 结构化生成与校验系统",
    template: "%s | llms.txt Generator",
  },
  description: "免费的 llms.txt 结构化生成与合规校验工具，帮助您创建符合大模型标准索引文件规范的文档索引",
  keywords: ["llms.txt", "大模型", "AI", "文档索引", "结构化生成", "合规校验"],
  authors: [{ name: "llms.txt Team" }],
  creator: "llms.txt Generator",
  publisher: "llms.txt Generator",
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    title: "llms.txt 结构化生成与校验系统",
    description: "免费的 llms.txt 结构化生成与合规校验工具",
    siteName: "llms.txt Generator",
  },
  twitter: {
    card: "summary_large_image",
    title: "llms.txt 结构化生成与校验系统",
    description: "免费的 llms.txt 结构化生成与合规校验工具",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#4f46e5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#4f46e5" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="llms.txt Generator" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
