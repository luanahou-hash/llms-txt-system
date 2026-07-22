"use client";

/**
 * llms.txt 结构化生成与校验系统 — 主页面
 * ============================================================
 * MVP 版本：文本直接输入 → 实时生成 llms.txt → 合规校验报告
 * 后续可扩展：网页抓取、文件上传、API 路由、持久化存储等
 */

import { useCallback, useMemo, useState } from "react";

// ─────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────

/** 校验项状态：通过 / 警告 / 失败 */
type ValidationStatus = "pass" | "warning" | "fail";

/** 单条校验结果 */
interface ValidationItem {
  id: string;
  label: string;
  detail: string;
  status: ValidationStatus;
}

/** 左侧 Tab 标识 */
type InputTab = "text" | "scrape" | "upload";

/** 项目基础配置 */
interface ProjectConfig {
  projectName: string;
  projectDescription: string;
  baseUrl: string;
  author: string;
}

/** 网页抓取状态 */
type ScrapeStatus = "idle" | "loading" | "success" | "error";

/** 抓取结果 */
interface ScrapeResult {
  title: string;
  description: string;
  content: string;
  url: string;
}

/** SEO 审计类别 */
type SeoAuditCategory = "meta" | "content" | "technical" | "performance" | "china";

/** SEO 审计检查项 */
interface SeoAuditItem {
  id: string;
  category: SeoAuditCategory;
  label: string;
  detail: string;
  status: ValidationStatus;
}

/** SEO 审计报告 */
interface SeoAuditReport {
  score: number;
  items: SeoAuditItem[];
  summary: {
    pass: number;
    warning: number;
    fail: number;
    total: number;
  };
}

// ─────────────────────────────────────────────────────────────
// 常量与演示数据
// ─────────────────────────────────────────────────────────────

/** 系统版本号 */
const APP_VERSION = "v1.0.0 Pro";

/** llms.txt 建议文件大小上限（字节） */
const SIZE_LIMIT_BYTES = 100 * 1024;

/** 演示用原始文本，一键填充便于软著截图与功能演示 */
const DEMO_RAW_TEXT = `# 智能文档助手

> 面向企业知识库的大模型索引解决方案

## 核心能力

- 自动从 Markdown / HTML 文档中提取结构化摘要
- 生成符合 llms.txt 规范的标准索引文件
- 内置合规校验：文件大小、标题层级、Markdown 语法

## 快速开始

1. 在左侧输入原始文档内容
2. 填写项目名称与描述
3. 右侧实时预览生成的 llms.txt 并查看校验报告

## 相关链接

- [官方规范说明](https://llmstxt.org/): llms.txt 标准文档
- [API 参考](/docs/api): RESTful 接口说明
- [常见问题](/docs/faq): 使用与合规 FAQ`;

/** 默认项目配置 */
const DEFAULT_CONFIG: ProjectConfig = {
  projectName: "",
  projectDescription: "",
  baseUrl: "",
  author: "",
};

// ─────────────────────────────────────────────────────────────
// 工具函数：网页抓取与 HTML 转文本
// ─────────────────────────────────────────────────────────────

/** CORS 代理服务列表（依次尝试，提高可用性） */
const CORS_PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
];

/**
 * 从 HTML 中提取标题、描述和正文文本
 * 使用浏览器内置的 DOMParser 解析 HTML，去除脚本和样式，提取结构化内容
 */
function parseHtmlToContent(html: string): ScrapeResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // 提取标题
  const title =
    doc.querySelector("meta[property='og:title']")?.getAttribute("content") ||
    doc.querySelector("title")?.textContent ||
    doc.querySelector("h1")?.textContent ||
    "未命名页面";

  // 提取描述
  const description =
    doc.querySelector("meta[name='description']")?.getAttribute("content") ||
    doc.querySelector("meta[property='og:description']")?.getAttribute("content") ||
    "";

  // 移除不需要的标签
  const removeTags = ["script", "style", "nav", "footer", "header", "aside", "iframe", "noscript", "svg", "form"];
  for (const tag of removeTags) {
    doc.querySelectorAll(tag).forEach((el) => el.remove());
  }

  // 优先提取 main / article 内容，其次取 body
  const contentRoot =
    doc.querySelector("main") ||
    doc.querySelector("article") ||
    doc.querySelector("#content") ||
    doc.querySelector(".content") ||
    doc.body;

  if (!contentRoot) {
    return { title, description, content: "", url: "" };
  }

  // 将 HTML 转换为结构化文本
  const lines: string[] = [];

  /** 递归遍历 DOM 节点，提取文本 */
  function walkNode(node: Node, depth: number = 0) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) {
        lines.push(text);
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    const tagName = el.tagName.toLowerCase();

    // 标题转换为 Markdown 格式
    if (/^h[1-6]$/.test(tagName)) {
      const level = parseInt(tagName[1]);
      const prefix = "#".repeat(level);
      const text = el.textContent?.trim();
      if (text) {
        lines.push("");
        lines.push(`${prefix} ${text}`);
        lines.push("");
      }
      return;
    }

    // 列表处理
    if (tagName === "li") {
      const text = el.textContent?.trim();
      if (text) {
        lines.push(`- ${text}`);
      }
      return;
    }

    // 段落处理
    if (tagName === "p") {
      const text = el.textContent?.trim();
      if (text) {
        lines.push("");
        lines.push(text);
        lines.push("");
      }
      return;
    }

    // 链接处理
    if (tagName === "a") {
      const href = el.getAttribute("href");
      const text = el.textContent?.trim();
      if (text && href) {
        lines.push(`[${text}](${href})`);
      } else if (text) {
        lines.push(text);
      }
      return;
    }

    // 代码块处理
    if (tagName === "pre" || tagName === "code") {
      const text = el.textContent?.trim();
      if (text) {
        lines.push("");
        lines.push("```");
        lines.push(text);
        lines.push("```");
        lines.push("");
      }
      return;
    }

    // 引用块处理
    if (tagName === "blockquote") {
      const text = el.textContent?.trim();
      if (text) {
        lines.push("");
        lines.push(`> ${text}`);
        lines.push("");
      }
      return;
    }

    // 表格处理：简化为逐行文本
    if (tagName === "table") {
      const rows = el.querySelectorAll("tr");
      rows.forEach((row) => {
        const cells = Array.from(row.querySelectorAll("th, td"));
        const cellTexts = cells.map((c) => c.textContent?.trim() || "");
        if (cellTexts.some((t) => t)) {
          lines.push(`| ${cellTexts.join(" | ")} |`);
        }
      });
      lines.push("");
      return;
    }

    // 换行处理
    if (tagName === "br") {
      lines.push("");
      return;
    }

    // 递归处理子节点
    for (const child of Array.from(el.childNodes)) {
      walkNode(child, depth + 1);
    }
  }

  walkNode(contentRoot);

  // 清理多余的空行
  const cleanedContent = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { title, description, content: cleanedContent, url: "" };
}

// ─────────────────────────────────────────────────────────────
// 工具函数：SEO 审计
// ─────────────────────────────────────────────────────────────

/** 审计类别中文名 */
const AUDIT_CATEGORY_LABELS: Record<SeoAuditCategory, string> = {
  meta: "Meta 标签",
  content: "内容质量",
  technical: "技术优化",
  performance: "性能与体验",
  china: "国内市场专属",
};

/**
 * 对抓取到的 HTML 执行 SEO 审计，生成诊断报告
 * 检查范围：Meta 标签、标题结构、图片、链接、结构化数据、移动端适配等
 */
function runSeoAudit(html: string, url: string): SeoAuditReport {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const items: SeoAuditItem[] = [];

  // ── 1. Meta 标签检查 ──

  // Title 标签
  const titleEl = doc.querySelector("title");
  const titleText = titleEl?.textContent?.trim() || "";
  const ogTitle = doc.querySelector("meta[property='og:title']")?.getAttribute("content") || "";
  if (!titleText) {
    items.push({ id: "meta-title", category: "meta", label: "Title 标签", detail: "页面缺少 <title> 标签，搜索引擎无法识别页面主题。", status: "fail" });
  } else if (titleText.length > 60) {
    items.push({ id: "meta-title", category: "meta", label: "Title 标签", detail: `标题长度 ${titleText.length} 字符，建议控制在 60 字符以内以避免搜索结果截断。`, status: "warning" });
  } else {
    items.push({ id: "meta-title", category: "meta", label: "Title 标签", detail: `标题：「${titleText}」，长度 ${titleText.length} 字符，符合规范。`, status: "pass" });
  }

  // Meta Description
  const descEl = doc.querySelector("meta[name='description']");
  const descContent = descEl?.getAttribute("content") || "";
  const ogDesc = doc.querySelector("meta[property='og:description']")?.getAttribute("content") || "";
  if (!descContent) {
    items.push({ id: "meta-desc", category: "meta", label: "Meta Description", detail: "缺少 meta description 标签，搜索引擎将自动截取页面内容作为摘要，可能影响点击率。", status: "fail" });
  } else if (descContent.length < 50 || descContent.length > 160) {
    items.push({ id: "meta-desc", category: "meta", label: "Meta Description", detail: `描述长度 ${descContent.length} 字符，建议在 50-160 字符之间以获得最佳搜索结果展示。`, status: "warning" });
  } else {
    items.push({ id: "meta-desc", category: "meta", label: "Meta Description", detail: `描述长度 ${descContent.length} 字符，符合最佳实践。`, status: "pass" });
  }

  // Canonical 标签
  const canonical = doc.querySelector("link[rel='canonical']")?.getAttribute("href");
  if (!canonical) {
    items.push({ id: "meta-canonical", category: "meta", label: "Canonical 标签", detail: "缺少 canonical 标签，可能导致重复内容问题。建议添加 <link rel='canonical'> 指向规范 URL。", status: "warning" });
  } else {
    items.push({ id: "meta-canonical", category: "meta", label: "Canonical 标签", detail: `已设置 canonical: ${canonical}，有效防止重复内容。`, status: "pass" });
  }

  // Open Graph 标签
  const ogTags = {
    "og:title": ogTitle,
    "og:description": ogDesc,
    "og:image": doc.querySelector("meta[property='og:image']")?.getAttribute("content") || "",
    "og:url": doc.querySelector("meta[property='og:url']")?.getAttribute("content") || "",
    "og:type": doc.querySelector("meta[property='og:type']")?.getAttribute("content") || "",
  };
  const ogCount = Object.values(ogTags).filter((v) => v).length;
  if (ogCount === 0) {
    items.push({ id: "meta-og", category: "meta", label: "Open Graph 标签", detail: "未检测到任何 Open Graph 标签，社交分享时将无法正确展示预览图和摘要。", status: "fail" });
  } else if (ogCount < 3) {
    items.push({ id: "meta-og", category: "meta", label: "Open Graph 标签", detail: `检测到 ${ogCount}/5 个 OG 标签，建议补全 og:title、og:description、og:image、og:url、og:type 以获得完整社交分享体验。`, status: "warning" });
  } else {
    items.push({ id: "meta-og", category: "meta", label: "Open Graph 标签", detail: `检测到 ${ogCount}/5 个 OG 标签，社交分享预览配置完善。`, status: "pass" });
  }

  // Twitter Card 标签
  const twitterCard = doc.querySelector("meta[name='twitter:card']")?.getAttribute("content") || "";
  if (!twitterCard) {
    items.push({ id: "meta-twitter", category: "meta", label: "Twitter Card 标签", detail: "缺少 Twitter Card 标签，Twitter/X 分享时无法生成卡片预览。", status: "warning" });
  } else {
    items.push({ id: "meta-twitter", category: "meta", label: "Twitter Card 标签", detail: `Twitter Card 类型: ${twitterCard}，分享预览配置正常。`, status: "pass" });
  }

  // ── 2. 内容质量检查 ──

  // H1 标签
  const h1List = doc.querySelectorAll("h1");
  if (h1List.length === 0) {
    items.push({ id: "content-h1", category: "content", label: "H1 标题", detail: "页面缺少 H1 标签，H1 是页面最重要的标题，对 SEO 至关重要。", status: "fail" });
  } else if (h1List.length > 1) {
    items.push({ id: "content-h1", category: "content", label: "H1 标题", detail: `检测到 ${h1List.length} 个 H1 标签，建议每页仅保留 1 个 H1 以明确页面主题。`, status: "warning" });
  } else {
    items.push({ id: "content-h1", category: "content", label: "H1 标题", detail: `H1 内容：「${h1List[0].textContent?.trim().slice(0, 50)}」，符合规范。`, status: "pass" });
  }

  // 标题层级
  const h2List = doc.querySelectorAll("h2");
  const h3List = doc.querySelectorAll("h3");
  if (h2List.length === 0 && h3List.length === 0) {
    items.push({ id: "content-headings", category: "content", label: "标题层级结构", detail: "未检测到 H2/H3 标签，缺乏结构化标题可能影响内容组织和 SEO 排名。", status: "warning" });
  } else {
    items.push({ id: "content-headings", category: "content", label: "标题层级结构", detail: `检测到 H2: ${h2List.length} 个，H3: ${h3List.length} 个，标题结构清晰。`, status: "pass" });
  }

  // 图片 alt 属性
  const images = doc.querySelectorAll("img");
  const imgsWithoutAlt = Array.from(images).filter((img) => !img.getAttribute("alt"));
  if (images.length === 0) {
    items.push({ id: "content-img-alt", category: "content", label: "图片 Alt 属性", detail: "页面未包含图片。", status: "pass" });
  } else if (imgsWithoutAlt.length > 0) {
    items.push({ id: "content-img-alt", category: "content", label: "图片 Alt 属性", detail: `${imgsWithoutAlt.length}/${images.length} 张图片缺少 alt 属性，影响图片搜索和无障碍体验。`, status: imgsWithoutAlt.length > images.length / 2 ? "fail" : "warning" });
  } else {
    items.push({ id: "content-img-alt", category: "content", label: "图片 Alt 属性", detail: `所有 ${images.length} 张图片均设置了 alt 属性。`, status: "pass" });
  }

  // 链接分析
  const links = doc.querySelectorAll("a[href]");
  const internalLinks = Array.from(links).filter((a) => {
    const href = a.getAttribute("href") || "";
    return href.startsWith("/") || href.startsWith("#") || href.startsWith(url);
  });
  const externalLinks = Array.from(links).filter((a) => {
    const href = a.getAttribute("href") || "";
    return href.startsWith("http") && !href.startsWith(url);
  });
  const linksWithoutText = Array.from(links).filter((a) => !a.textContent?.trim());
  if (links.length === 0) {
    items.push({ id: "content-links", category: "content", label: "链接分析", detail: "页面未包含任何链接，建议添加内部链接以改善站点结构。", status: "warning" });
  } else if (linksWithoutText.length > 0) {
    items.push({ id: "content-links", category: "content", label: "链接分析", detail: `共 ${links.length} 个链接（内部 ${internalLinks.length}，外部 ${externalLinks.length}），其中 ${linksWithoutText.length} 个链接缺少文字，影响 SEO 和无障碍。`, status: "warning" });
  } else {
    items.push({ id: "content-links", category: "content", label: "链接分析", detail: `共 ${links.length} 个链接（内部 ${internalLinks.length}，外部 ${externalLinks.length}），均有文字描述。`, status: "pass" });
  }

  // ── 3. 技术优化检查 ──

  // Viewport / 移动端适配
  const viewport = doc.querySelector("meta[name='viewport']")?.getAttribute("content") || "";
  if (!viewport) {
    items.push({ id: "tech-viewport", category: "technical", label: "移动端适配", detail: "缺少 viewport meta 标签，页面在移动设备上可能无法正确显示。这是 Google 移动优先索引的必需项。", status: "fail" });
  } else {
    items.push({ id: "tech-viewport", category: "technical", label: "移动端适配", detail: `viewport 配置正常，适配移动端浏览。`, status: "pass" });
  }

  // 结构化数据 JSON-LD
  const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
  if (jsonLdScripts.length === 0) {
    items.push({ id: "tech-schema", category: "technical", label: "结构化数据 (Schema.org)", detail: "未检测到 JSON-LD 结构化数据，添加 Schema.org 标记有助于搜索引擎理解页面内容，获得富文本结果。", status: "warning" });
  } else {
    items.push({ id: "tech-schema", category: "technical", label: "结构化数据 (Schema.org)", detail: `检测到 ${jsonLdScripts.length} 个 JSON-LD 结构化数据块，有助于富文本搜索结果。`, status: "pass" });
  }

  // robots meta
  const robotsMeta = doc.querySelector("meta[name='robots']")?.getAttribute("content") || "";
  if (robotsMeta.toLowerCase().includes("noindex")) {
    items.push({ id: "tech-robots", category: "technical", label: "Robots 索引指令", detail: `页面设置了 noindex 指令（${robotsMeta}），搜索引擎将不会索引此页面。`, status: "warning" });
  } else {
    items.push({ id: "tech-robots", category: "technical", label: "Robots 索引指令", detail: robotsMeta ? `robots meta: ${robotsMeta}，索引正常。` : "未设置 robots 限制，页面可被正常索引。", status: "pass" });
  }

  // lang 属性
  const langAttr = doc.documentElement.getAttribute("lang") || "";
  if (!langAttr) {
    items.push({ id: "tech-lang", category: "technical", label: "语言声明 (lang)", detail: "缺少 <html lang> 属性，影响搜索引擎语言判断和无障碍体验。", status: "warning" });
  } else {
    items.push({ id: "tech-lang", category: "technical", label: "语言声明 (lang)", detail: `语言声明: lang="${langAttr}"，符合规范。`, status: "pass" });
  }

  // ── 4. 性能与体验检查 ──

  // HTML 大小
  const htmlSize = new TextEncoder().encode(html).length;
  const htmlSizeKB = htmlSize / 1024;
  if (htmlSizeKB > 500) {
    items.push({ id: "perf-htmlsize", category: "performance", label: "HTML 体积", detail: `HTML 体积 ${htmlSizeKB.toFixed(1)} KB，过大可能影响加载速度。建议精简内联样式和脚本。`, status: "warning" });
  } else {
    items.push({ id: "perf-htmlsize", category: "performance", label: "HTML 体积", detail: `HTML 体积 ${htmlSizeKB.toFixed(1)} KB，在合理范围内。`, status: "pass" });
  }

  // 内联样式
  const inlineStyles = doc.querySelectorAll("style");
  const inlineStyleAttrs = Array.from(doc.querySelectorAll("[style]"));
  if (inlineStyles.length > 3 || inlineStyleAttrs.length > 10) {
    items.push({ id: "perf-inline-css", category: "performance", label: "内联样式", detail: `检测到 ${inlineStyles.length} 个 <style> 标签和 ${inlineStyleAttrs.length} 个内联 style 属性，建议提取为外部 CSS 文件。`, status: "warning" });
  } else {
    items.push({ id: "perf-inline-css", category: "performance", label: "内联样式", detail: `内联样式使用合理（${inlineStyles.length} 个 style 标签，${inlineStyleAttrs.length} 个 style 属性）。`, status: "pass" });
  }

  // 资源引用统计
  const stylesheets = doc.querySelectorAll('link[rel="stylesheet"]');
  const scripts = doc.querySelectorAll("script[src]");
  const totalResources = stylesheets.length + scripts.length;
  if (totalResources > 15) {
    items.push({ id: "perf-resources", category: "performance", label: "外部资源数量", detail: `共 ${totalResources} 个外部资源（CSS ${stylesheets.length}，JS ${scripts.length}），请求过多可能影响加载速度。`, status: "warning" });
  } else {
    items.push({ id: "perf-resources", category: "performance", label: "外部资源数量", detail: `共 ${totalResources} 个外部资源（CSS ${stylesheets.length}，JS ${scripts.length}），数量合理。`, status: "pass" });
  }

  // ── 5. 国内市场专属检查 ──

  // ICP 备案检测
  const pageText = doc.body?.textContent || "";
  const icpMatch = pageText.match(/[京沪粤津渝冀苏浙皖闽赣鲁豫鄂湘川陕甘宁青新藏桂蒙辽吉黑云贵海南内]\w*ICP[备号]\d+/);
  const footerEl = doc.querySelector("footer") || doc.querySelector(".footer");
  const footerText = footerEl?.textContent || "";
  const hasIcpInFooter = /[京沪粤津渝冀苏浙皖闽赣鲁豫鄂湘川陕甘宁青新藏桂蒙辽吉黑云贵海南内]\w*ICP[备号]\d+/.test(footerText);
  const hasIcpAnywhere = !!icpMatch || hasIcpInFooter;
  if (hasIcpAnywhere) {
    const icpNumber = icpMatch?.[0] || footerText.match(/[京沪粤津渝冀苏浙皖闽赣鲁豫鄂湘川陕甘宁青新藏桂蒙辽吉黑云贵海南内]\w*ICP[备号]\d+/)?.[0] || "";
    items.push({ id: "china-icp", category: "china", label: "ICP 备案", detail: `检测到 ICP 备案号：${icpNumber}，符合中国大陆网站运营合规要求。`, status: "pass" });
  } else {
    items.push({ id: "china-icp", category: "china", label: "ICP 备案", detail: "未在页面中检测到 ICP 备案号。面向中国大陆用户的网站需在页脚展示 ICP 备案信息，否则可能面临搜索引擎降权或关站风险。", status: "fail" });
  }

  // 百度搜索验证
  const baiduVerify = doc.querySelector("meta[name='baidu-site-verification']")?.getAttribute("content") || "";
  if (baiduVerify) {
    items.push({ id: "china-baidu", category: "china", label: "百度搜索验证", detail: `已配置百度站长验证（${baiduVerify.slice(0, 20)}...），可在百度搜索资源平台提交 sitemap 和监控收录。`, status: "pass" });
  } else {
    items.push({ id: "china-baidu", category: "china", label: "百度搜索验证", detail: "缺少百度站长验证标签（baidu-site-verification），无法在百度搜索资源平台管理站点收录和索引。", status: "warning" });
  }

  // 搜狗搜索验证
  const sogouVerify = doc.querySelector("meta[name='sogou_site_verification']")?.getAttribute("content") || "";
  if (sogouVerify) {
    items.push({ id: "china-sogou", category: "china", label: "搜狗搜索验证", detail: `已配置搜狗站长验证（${sogouVerify.slice(0, 20)}...），可在搜狗站长平台提交链接。`, status: "pass" });
  } else {
    items.push({ id: "china-sogou", category: "china", label: "搜狗搜索验证", detail: "缺少搜狗站长验证标签（sogou_site_verification），建议在搜狗站长平台添加站点以改善收录。", status: "warning" });
  }

  // 360 搜索验证
  const verify360 = doc.querySelector("meta[name='360-site-verification']")?.getAttribute("content") || "";
  if (verify360) {
    items.push({ id: "china-360", category: "china", label: "360 搜索验证", detail: `已配置 360 站长验证（${verify360.slice(0, 20)}...），可在 360 站长平台管理站点。`, status: "pass" });
  } else {
    items.push({ id: "china-360", category: "china", label: "360 搜索验证", detail: "缺少 360 站长验证标签（360-site-verification），建议在 360 站长平台添加站点。", status: "warning" });
  }

  // 神马搜索验证
  const shenmaVerify = doc.querySelector("meta[name='shenma-site-verification']")?.getAttribute("content") || "";
  if (shenmaVerify) {
    items.push({ id: "china-shenma", category: "china", label: "神马搜索验证", detail: `已配置神马站长验证（${shenmaVerify.slice(0, 20)}...），可在神马搜索平台管理移动端收录。`, status: "pass" });
  } else {
    items.push({ id: "china-shenma", category: "china", label: "神马搜索验证", detail: "缺少神马站长验证标签（shenma-site-verification），神马是 UC 浏览器默认搜索引擎，移动端流量重要来源。", status: "warning" });
  }

  // 站点地图引用检测
  const sitemapLink = doc.querySelector("link[rel='sitemap']")?.getAttribute("href") || "";
  const robotsTxtSitemap = false; // 无法直接 fetch robots.txt，仅检测页面内引用
  const hasSitemapRef = !!sitemapLink || !!robotsTxtSitemap;
  if (hasSitemapRef) {
    items.push({ id: "china-sitemap", category: "china", label: "站点地图引用", detail: `检测到 sitemap 引用：${sitemapLink || "robots.txt 中已声明"}，有利于搜索引擎发现和索引页面。`, status: "pass" });
  } else {
    items.push({ id: "china-sitemap", category: "china", label: "站点地图引用", detail: "页面未引用 sitemap.xml。建议在 robots.txt 中声明 Sitemap 路径，并在百度/搜狗站长平台主动提交，加速收录。", status: "warning" });
  }

  // 中文语言声明检测
  const langAttr2 = doc.documentElement.getAttribute("lang") || "";
  if (langAttr2 === "zh-CN" || langAttr2 === "zh-cn" || langAttr2 === "zh") {
    items.push({ id: "china-lang", category: "china", label: "中文语言声明", detail: `语言声明为 lang="${langAttr2}"，符合中文网站最佳实践，有助于搜索引擎和浏览器正确识别语言。`, status: "pass" });
  } else if (langAttr2) {
    items.push({ id: "china-lang", category: "china", label: "中文语言声明", detail: `当前 lang="${langAttr2}"，面向国内用户建议改为 lang="zh-CN" 以确保搜索引擎和浏览器正确识别为中文页面。`, status: "warning" });
  } else {
    items.push({ id: "china-lang", category: "china", label: "中文语言声明", detail: "缺少 lang 属性，面向国内用户建议设置 lang=\"zh-CN\"。", status: "warning" });
  }

  // 微信分享优化检测
  const wxShareTags = {
    "weixin:article": doc.querySelector("meta[property='weixin:article']")?.getAttribute("content") || "",
    "weixin:type": doc.querySelector("meta[property='weixin:type']")?.getAttribute("content") || "",
  };
  // 微信分享主要依赖 Open Graph，检测 OG + 微信专用标签完整度
  const ogImage = doc.querySelector("meta[property='og:image']")?.getAttribute("content") || "";
  const ogTitle2 = doc.querySelector("meta[property='og:title']")?.getAttribute("content") || "";
  const ogDesc2 = doc.querySelector("meta[property='og:description']")?.getAttribute("content") || "";
  const wxReady = ogImage && ogTitle2 && ogDesc2;
  const wxSpecificCount = Object.values(wxShareTags).filter((v) => v).length;
  if (wxReady && wxSpecificCount > 0) {
    items.push({ id: "china-wechat", category: "china", label: "微信分享优化", detail: `Open Graph 标签完整 + 微信专用标签 ${wxSpecificCount} 个，微信内分享预览效果最佳。`, status: "pass" });
  } else if (wxReady) {
    items.push({ id: "china-wechat", category: "china", label: "微信分享优化", detail: "Open Graph 标签完整，微信分享可正常展示标题、描述和图片。建议补充微信专用标签以获得更好体验。", status: "pass" });
  } else if (ogTitle2 || ogDesc2 || ogImage) {
    items.push({ id: "china-wechat", category: "china", label: "微信分享优化", detail: `Open Graph 标签不完整（缺少 ${!ogTitle2 ? "og:title " : ""}${!ogDesc2 ? "og:description " : ""}${!ogImage ? "og:image" : ""}），微信分享时预览信息缺失。`, status: "warning" });
  } else {
    items.push({ id: "china-wechat", category: "china", label: "微信分享优化", detail: "缺少 Open Graph 标签，微信内分享时无法展示标题、描述和预览图，严重影响分享点击率。", status: "fail" });
  }

  // ── 计算评分 ──
  const passCount = items.filter((i) => i.status === "pass").length;
  const warningCount = items.filter((i) => i.status === "warning").length;
  const failCount = items.filter((i) => i.status === "fail").length;
  const total = items.length;
  const score = Math.round(((passCount + warningCount * 0.5) / total) * 100);

  return {
    score,
    items,
    summary: { pass: passCount, warning: warningCount, fail: failCount, total },
  };
}

/**
 * 根据原始文本与项目配置，生成标准 llms.txt 内容
 * 规范参考：https://llmstxt.org/
 */
function generateLlmsTxt(rawText: string, config: ProjectConfig): string {
  const title = config.projectName.trim() || "未命名项目";
  const description =
    config.projectDescription.trim() ||
    "本项目索引文件由 llms.txt 结构化生成与校验系统自动生成。";

  const metaLines: string[] = [];
  if (config.baseUrl.trim()) {
    metaLines.push(`- 站点根路径: ${config.baseUrl.trim()}`);
  }
  if (config.author.trim()) {
    metaLines.push(`- 维护者: ${config.author.trim()}`);
  }
  metaLines.push(`- 生成时间: ${new Date().toLocaleString("zh-CN")}`);

  return `# ${title}

> ${description}

## 元信息

${metaLines.join("\n")}

## 文档正文

${rawText.trim()}

---
*Generated by llms.txt 结构化生成与校验系统 ${APP_VERSION}*
`;
}

/**
 * 执行合规与结构校验，返回校验报告条目列表
 */
function runValidation(llmsContent: string): ValidationItem[] {
  const byteSize = new TextEncoder().encode(llmsContent).length;
  const lines = llmsContent.split("\n");

  const items: ValidationItem[] = [];

  // 1. 文件大小上限评估
  if (byteSize <= SIZE_LIMIT_BYTES * 0.5) {
    items.push({
      id: "size",
      label: "文件大小上限评估",
      detail: `当前 ${(byteSize / 1024).toFixed(1)} KB，远低于建议上限 ${SIZE_LIMIT_BYTES / 1024} KB，适合作为大模型索引文件。`,
      status: "pass",
    });
  } else if (byteSize <= SIZE_LIMIT_BYTES) {
    items.push({
      id: "size",
      label: "文件大小上限评估",
      detail: `当前 ${(byteSize / 1024).toFixed(1)} KB，接近建议上限 ${SIZE_LIMIT_BYTES / 1024} KB，建议精简非核心段落。`,
      status: "warning",
    });
  } else {
    items.push({
      id: "size",
      label: "文件大小上限评估",
      detail: `当前 ${(byteSize / 1024).toFixed(1)} KB，已超出建议上限 ${SIZE_LIMIT_BYTES / 1024} KB，可能影响大模型加载效率。`,
      status: "fail",
    });
  }

  // 2. 标题结构完整度校验
  const hasH1 = /^#\s+.+/m.test(llmsContent);
  const h2Count = (llmsContent.match(/^##\s+.+/gm) || []).length;
  const hasBlockquote = /^>\s+.+/m.test(llmsContent);

  if (hasH1 && h2Count >= 2 && hasBlockquote) {
    items.push({
      id: "heading",
      label: "标题结构完整度校验",
      detail: `检测到一级标题 1 个、二级标题 ${h2Count} 个及项目描述引用块，结构完整。`,
      status: "pass",
    });
  } else if (hasH1 && h2Count >= 1) {
    items.push({
      id: "heading",
      label: "标题结构完整度校验",
      detail: `已有一级标题，二级标题 ${h2Count} 个；建议补充项目描述（> 引用块）及更多章节。`,
      status: "warning",
    });
  } else {
    items.push({
      id: "heading",
      label: "标题结构完整度校验",
      detail: "缺少必需的一级标题（#）或章节结构不完整，请检查输入内容。",
      status: "fail",
    });
  }

  // 3. Markdown 语法规范检查
  const issues: string[] = [];

  // 未闭合的链接语法
  const unclosedLinks = (llmsContent.match(/\[[^\]]*\]\([^)]*$/gm) || []).length;
  if (unclosedLinks > 0) issues.push(`发现 ${unclosedLinks} 处未闭合链接`);

  // 连续空标题
  const emptyHeadings = (llmsContent.match(/^#{1,6}\s*$/gm) || []).length;
  if (emptyHeadings > 0) issues.push(`发现 ${emptyHeadings} 个空标题行`);

  // 混用 Tab 缩进（部分解析器不兼容）
  const hasTabs = lines.some((line) => line.startsWith("\t"));
  if (hasTabs) issues.push("检测到 Tab 缩进，建议改用空格");

  // 行尾多余空格
  const trailingSpaces = lines.filter((l) => / +$/.test(l)).length;
  if (trailingSpaces > 5) issues.push(`${trailingSpaces} 行存在行尾多余空格`);

  if (issues.length === 0) {
    items.push({
      id: "markdown",
      label: "Markdown 语法规范检查",
      detail: "未发现明显语法问题，链接、标题与段落格式符合常见 Markdown 规范。",
      status: "pass",
    });
  } else if (issues.length <= 2) {
    items.push({
      id: "markdown",
      label: "Markdown 语法规范检查",
      detail: issues.join("；") + "。",
      status: "warning",
    });
  } else {
    items.push({
      id: "markdown",
      label: "Markdown 语法规范检查",
      detail: issues.join("；") + "，建议修正后再发布。",
      status: "fail",
    });
  }

  return items;
}

/** 根据校验状态返回 Tailwind 样式类名 */
function statusStyles(status: ValidationStatus): string {
  switch (status) {
    case "pass":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
    case "warning":
      return "bg-amber-50 text-amber-700 ring-amber-600/20";
    case "fail":
      return "bg-rose-50 text-rose-700 ring-rose-600/20";
  }
}

/** 校验状态中文标签 */
function statusLabel(status: ValidationStatus): string {
  switch (status) {
    case "pass":
      return "通过";
    case "warning":
      return "警告";
    case "fail":
      return "失败";
  }
}

// ─────────────────────────────────────────────────────────────
// 子组件（内联，便于单文件维护；后续可拆至 components/）
// ─────────────────────────────────────────────────────────────

/** 校验状态徽章 */
function StatusBadge({ status }: { status: ValidationStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusStyles(status)}`}
    >
      {statusLabel(status)}
    </span>
  );
}

/** 右侧空状态引导 */
function EmptyStateGuide() {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-2xl">
        📄
      </div>
      <h3 className="text-base font-semibold text-slate-800">
        等待输入内容
      </h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
        请在左侧输入原始文档文本，或点击「填充演示数据」快速体验生成与校验流程。
        输入后，此处将实时展示 llms.txt 预览及合规报告。
      </p>
      <ul className="mt-6 space-y-1.5 text-left text-xs text-slate-400">
        <li>• 支持 Markdown 格式原文</li>
        <li>• 自动补全项目元信息与标准结构</li>
        <li>• 实时校验文件大小、标题层级与语法规范</li>
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 主页面组件
// ─────────────────────────────────────────────────────────────

export default function HomePage() {
  // ── 状态管理 ──
  const [activeTab, setActiveTab] = useState<InputTab>("text");
  const [rawText, setRawText] = useState("");
  const [config, setConfig] = useState<ProjectConfig>(DEFAULT_CONFIG);
  const [copySuccess, setCopySuccess] = useState(false);

  // ── 网页抓取状态 ──
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus>("idle");
  const [scrapeError, setScrapeError] = useState("");
  const [scrapePreview, setScrapePreview] = useState("");

  // ── SEO 审计状态 ──
  const [seoReport, setSeoReport] = useState<SeoAuditReport | null>(null);
  const [showSeoReport, setShowSeoReport] = useState(false);

  /** 是否有有效输入（用于控制右侧空状态） */
  const hasInput = rawText.trim().length > 0;

  /** 实时生成的 llms.txt 内容 */
  const llmsContent = useMemo(() => {
    if (!hasInput) return "";
    return generateLlmsTxt(rawText, config);
  }, [rawText, config, hasInput]);

  /** 实时校验报告 */
  const validationItems = useMemo(() => {
    if (!llmsContent) return [];
    return runValidation(llmsContent);
  }, [llmsContent]);

  // ── 事件处理 ──

  /** 清空输入区 */
  const handleClear = useCallback(() => {
    setRawText("");
    setConfig(DEFAULT_CONFIG);
  }, []);

  /** 填充演示数据 */
  const handleFillDemo = useCallback(() => {
    setRawText(DEMO_RAW_TEXT);
    setConfig({
      projectName: "智能文档助手",
      projectDescription:
        "面向企业知识库的大模型索引解决方案，支持自动化生成与合规校验。",
      baseUrl: "https://docs.example.com",
      author: "产品技术部",
    });
  }, []);

  /** 更新配置字段 */
  const updateConfig = useCallback(
    (field: keyof ProjectConfig, value: string) => {
      setConfig((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  /** 一键复制 llms.txt */
  const handleCopy = useCallback(async () => {
    if (!llmsContent) return;
    try {
      await navigator.clipboard.writeText(llmsContent);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      /* 降级：选区复制由浏览器处理，此处静默失败 */
    }
  }, [llmsContent]);

  /** 下载 .txt 文件 */
  const handleDownload = useCallback(() => {
    if (!llmsContent) return;
    const filename =
      (config.projectName.trim() || "llms").replace(/\s+/g, "-") + ".txt";
    const blob = new Blob([llmsContent], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [llmsContent, config.projectName]);

  /** Tab 切换：三个 Tab 均可切换，非 MVP 功能展示占位提示 */
  const handleTabChange = useCallback((tab: InputTab) => {
    setActiveTab(tab);
  }, []);

  /** 网页抓取：通过 CORS 代理获取网页内容并转换为结构化文本 */
  const handleScrape = useCallback(async () => {
    const url = scrapeUrl.trim();
    if (!url) {
      setScrapeError("请输入网页地址");
      setScrapeStatus("error");
      return;
    }

    // 校验 URL 格式
    let validUrl = url;
    if (!/^https?:\/\//.test(validUrl)) {
      validUrl = "https://" + validUrl;
    }

    try {
      new URL(validUrl);
    } catch {
      setScrapeError("网址格式不正确，请检查后重试");
      setScrapeStatus("error");
      return;
    }

    setScrapeStatus("loading");
    setScrapeError("");

    // 依次尝试多个 CORS 代理
    for (let i = 0; i < CORS_PROXIES.length; i++) {
      try {
        const proxyUrl = CORS_PROXIES[i](validUrl);
        const response = await fetch(proxyUrl, {
          headers: { Accept: "text/html, application/xhtml+xml" },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        if (!html || html.length < 100) {
          throw new Error("返回内容为空");
        }

        // 解析 HTML 并提取结构化内容
        const result = parseHtmlToContent(html);

        if (!result.content || result.content.length < 10) {
          throw new Error("未能提取有效内容");
        }

        // 自动填充项目配置
        if (result.title) {
          setConfig((prev) => ({ ...prev, projectName: result.title }));
        }
        if (result.description) {
          setConfig((prev) => ({ ...prev, projectDescription: result.description }));
        }
        setConfig((prev) => ({ ...prev, baseUrl: validUrl }));

        // 将抓取内容设为 rawText 并更新预览
        setRawText(result.content);
        setScrapePreview(result.content);
        setScrapeStatus("success");

        // 同时执行 SEO 审计
        const report = runSeoAudit(html, validUrl);
        setSeoReport(report);

        return; // 成功则退出循环
      } catch (err) {
        // 如果不是最后一个代理，继续尝试下一个
        if (i < CORS_PROXIES.length - 1) {
          continue;
        }
        // 所有代理都失败
        setScrapeError(
          err instanceof Error
            ? `抓取失败：${err.message}。部分网站可能限制访问，请尝试其他网址或使用「文本直接输入」。`
            : "抓取失败，请稍后重试或使用「文本直接输入」"
        );
        setScrapeStatus("error");
      }
    }
  }, [scrapeUrl]);

  // ── Tab 配置 ──
  const tabs: { id: InputTab; label: string }[] = [
    { id: "text", label: "文本直接输入" },
    { id: "scrape", label: "网页抓取" },
    { id: "upload", label: "文件上传" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
      {/* ═══════════════ 顶部导航栏 ═══════════════ */}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-sm font-bold text-white shadow-lg shadow-indigo-500/25">
              AI
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                  llms.txt 结构化生成与校验系统
                </h1>
                <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                  {APP_VERSION}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                符合大模型标准索引文件规范，适用于文档提炼与合规校验
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            系统就绪
          </div>
        </div>
      </header>

      {/* ═══════════════ 主内容区：左右分栏 ═══════════════ */}
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
          {/* ────────── 左侧：输入与配置区 ────────── */}
          <section className="flex flex-col rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/50">
            {/* Tab 导航 */}
            <div className="flex border-b border-slate-100">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  className={`relative flex-1 px-4 py-3.5 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? "text-indigo-600"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.id && (
                    <span className="absolute inset-x-4 -bottom-px h-0.5 rounded-full bg-indigo-600" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex flex-1 flex-col p-5 sm:p-6">
              {/* 网页抓取 Tab */}
              {activeTab === "scrape" && (
                <div className="flex flex-1 flex-col">
                  {/* URL 输入区 */}
                  <div className="mb-5">
                    <label
                      htmlFor="scrape-url"
                      className="mb-2 block text-sm font-medium text-slate-700"
                    >
                      网页地址
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="scrape-url"
                        type="text"
                        value={scrapeUrl}
                        onChange={(e) => {
                          setScrapeUrl(e.target.value);
                          setScrapeStatus("idle");
                          setScrapeError("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleScrape();
                          }
                        }}
                        placeholder="https://example.com/docs"
                        className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                      <button
                        type="button"
                        onClick={handleScrape}
                        disabled={scrapeStatus === "loading"}
                        className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {scrapeStatus === "loading" ? (
                          <>
                            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            抓取中
                          </>
                        ) : (
                          "开始抓取"
                        )}
                      </button>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400">
                      输入文档页面地址，系统将自动提取正文内容并转换为 Markdown 格式
                    </p>
                  </div>

                  {/* 错误提示 */}
                  {scrapeStatus === "error" && scrapeError && (
                    <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <span>{scrapeError}</span>
                    </div>
                  )}

                  {/* 成功提示 */}
                  {scrapeStatus === "success" && (
                    <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <div>
                        <p>抓取成功！已自动填充内容和项目配置。</p>
                        <p className="mt-1 text-xs text-emerald-600">
                          共提取 {scrapePreview.length} 字符，可在右侧查看生成的 llms.txt。
                        </p>
                      </div>
                    </div>
                  )}

                  {/* SEO 审计报告 */}
                  {seoReport && scrapeStatus === "success" && (
                    <div className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      {/* 报告头部：评分 + 展开按钮 */}
                      <button
                        type="button"
                        onClick={() => setShowSeoReport(!showSeoReport)}
                        className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-4">
                          {/* 评分圆环 */}
                          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
                            <svg className="h-14 w-14 -rotate-90" viewBox="0 0 56 56">
                              <circle cx="28" cy="28" r="24" fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-100" />
                              <circle
                                cx="28"
                                cy="28"
                                r="24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="4"
                                strokeLinecap="round"
                                strokeDasharray={`${(seoReport.score / 100) * 150.8} 150.8`}
                                className={
                                  seoReport.score >= 80
                                    ? "text-emerald-500"
                                    : seoReport.score >= 60
                                    ? "text-amber-500"
                                    : "text-rose-500"
                                }
                              />
                            </svg>
                            <span className={`absolute text-sm font-bold ${
                              seoReport.score >= 80
                                ? "text-emerald-600"
                                : seoReport.score >= 60
                                ? "text-amber-600"
                                : "text-rose-600"
                            }`}>
                              {seoReport.score}
                            </span>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-slate-800">SEO 审计报告</h3>
                            <div className="mt-1 flex items-center gap-3 text-xs">
                              <span className="text-emerald-600">通过 {seoReport.summary.pass}</span>
                              <span className="text-amber-600">警告 {seoReport.summary.warning}</span>
                              <span className="text-rose-600">失败 {seoReport.summary.fail}</span>
                              <span className="text-slate-400">共 {seoReport.summary.total} 项</span>
                            </div>
                          </div>
                        </div>
                        <svg
                          className={`h-5 w-5 text-slate-400 transition-transform ${showSeoReport ? "rotate-180" : ""}`}
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>

                      {/* 展开的详细报告 */}
                      {showSeoReport && (
                        <div className="border-t border-slate-100 px-5 py-4">
                          {/* 按类别分组 */}
                          {(["meta", "content", "technical", "performance", "china"] as SeoAuditCategory[]).map((cat) => {
                            const catItems = seoReport.items.filter((i) => i.category === cat);
                            if (catItems.length === 0) return null;
                            return (
                              <div key={cat} className="mb-5 last:mb-0">
                                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  {AUDIT_CATEGORY_LABELS[cat]}
                                </h4>
                                <div className="space-y-2">
                                  {catItems.map((item) => (
                                    <div
                                      key={item.id}
                                      className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm ${
                                        item.status === "pass"
                                          ? "bg-emerald-50/60"
                                          : item.status === "warning"
                                          ? "bg-amber-50/60"
                                          : "bg-rose-50/60"
                                      }`}
                                    >
                                      {/* 状态图标 */}
                                      <span className="mt-0.5 shrink-0">
                                        {item.status === "pass" ? (
                                          <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                          </svg>
                                        ) : item.status === "warning" ? (
                                          <svg className="h-4 w-4 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                          </svg>
                                        ) : (
                                          <svg className="h-4 w-4 text-rose-500" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                          </svg>
                                        )}
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <p className="font-medium text-slate-700">{item.label}</p>
                                        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{item.detail}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 抓取内容预览 */}
                  {scrapePreview && (
                    <div className="mb-5 flex-1">
                      <div className="mb-2 flex items-center justify-between">
                        <label className="text-sm font-medium text-slate-700">
                          抓取内容预览
                        </label>
                        <span className="text-xs text-slate-400">
                          {scrapePreview.length} 字符
                        </span>
                      </div>
                      <textarea
                        value={rawText}
                        onChange={(e) => {
                          setRawText(e.target.value);
                          setScrapePreview(e.target.value);
                        }}
                        rows={10}
                        className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 font-mono text-sm leading-relaxed text-slate-800 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  )}

                  {/* 空状态引导 */}
                  {scrapeStatus === "idle" && !scrapePreview && (
                    <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-16 text-center">
                      <div className="mb-3 text-3xl opacity-60">🌐</div>
                      <p className="text-sm font-medium text-slate-600">
                        网页抓取
                      </p>
                      <p className="mt-2 max-w-xs text-xs leading-relaxed text-slate-400">
                        输入文档页面地址，系统将通过代理抓取网页内容，自动提取正文并转换为 Markdown 格式。
                      </p>
                      <div className="mt-6 space-y-1.5 text-left text-xs text-slate-400">
                        <p>支持功能：</p>
                        <p>• 自动提取页面标题和描述</p>
                        <p>• 将 HTML 转换为 Markdown 格式</p>
                        <p>• 自动填充项目配置信息</p>
                      </div>
                    </div>
                  )}

                  {/* 项目配置区（抓取成功后显示） */}
                  {(scrapeStatus === "success" || scrapePreview) && (
                    <div className="space-y-4 border-t border-slate-100 pt-5">
                      <h2 className="text-sm font-semibold text-slate-800">
                        项目配置
                      </h2>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <label
                            htmlFor="scrape-project-name"
                            className="mb-1 block text-xs font-medium text-slate-600"
                          >
                            项目名称
                          </label>
                          <input
                            id="scrape-project-name"
                            type="text"
                            value={config.projectName}
                            onChange={(e) =>
                              updateConfig("projectName", e.target.value)
                            }
                            placeholder="例如：智能文档助手"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label
                            htmlFor="scrape-project-desc"
                            className="mb-1 block text-xs font-medium text-slate-600"
                          >
                            项目描述
                          </label>
                          <input
                            id="scrape-project-desc"
                            type="text"
                            value={config.projectDescription}
                            onChange={(e) =>
                              updateConfig("projectDescription", e.target.value)
                            }
                            placeholder="一句话概括项目用途"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="scrape-base-url"
                            className="mb-1 block text-xs font-medium text-slate-600"
                          >
                            站点根路径（可选）
                          </label>
                          <input
                            id="scrape-base-url"
                            type="url"
                            value={config.baseUrl}
                            onChange={(e) =>
                              updateConfig("baseUrl", e.target.value)
                            }
                            placeholder="https://docs.example.com"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="scrape-author"
                            className="mb-1 block text-xs font-medium text-slate-600"
                          >
                            维护者（可选）
                          </label>
                          <input
                            id="scrape-author"
                            type="text"
                            value={config.author}
                            onChange={(e) =>
                              updateConfig("author", e.target.value)
                            }
                            placeholder="团队或负责人"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 文件上传 Tab：占位提示 */}
              {activeTab === "upload" && (
                <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-16 text-center">
                  <div className="mb-3 text-3xl opacity-60">📁</div>
                  <p className="text-sm font-medium text-slate-600">
                    文件上传
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    将在后续版本开放
                  </p>
                </div>
              )}

              {activeTab === "text" && (
                <>
                  {/* 大文本输入框 */}
                  <div className="mb-5">
                    <div className="mb-2 flex items-center justify-between">
                      <label
                        htmlFor="raw-text"
                        className="text-sm font-medium text-slate-700"
                      >
                        原始文档内容
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleFillDemo}
                          className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100"
                        >
                          填充演示数据
                        </button>
                        <button
                          type="button"
                          onClick={handleClear}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                        >
                          清空
                        </button>
                      </div>
                    </div>
                    <textarea
                      id="raw-text"
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      placeholder="在此粘贴或输入 Markdown / 纯文本文档内容…"
                      rows={12}
                      className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 font-mono text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                    <p className="mt-1.5 text-right text-xs text-slate-400">
                      {rawText.length} 字符
                    </p>
                  </div>

                  {/* 基础配置项 */}
                  <div className="space-y-4 border-t border-slate-100 pt-5">
                    <h2 className="text-sm font-semibold text-slate-800">
                      项目配置
                    </h2>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label
                          htmlFor="project-name"
                          className="mb-1 block text-xs font-medium text-slate-600"
                        >
                          项目名称
                        </label>
                        <input
                          id="project-name"
                          type="text"
                          value={config.projectName}
                          onChange={(e) =>
                            updateConfig("projectName", e.target.value)
                          }
                          placeholder="例如：智能文档助手"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label
                          htmlFor="project-desc"
                          className="mb-1 block text-xs font-medium text-slate-600"
                        >
                          项目描述
                        </label>
                        <input
                          id="project-desc"
                          type="text"
                          value={config.projectDescription}
                          onChange={(e) =>
                            updateConfig("projectDescription", e.target.value)
                          }
                          placeholder="一句话概括项目用途"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="base-url"
                          className="mb-1 block text-xs font-medium text-slate-600"
                        >
                          站点根路径（可选）
                        </label>
                        <input
                          id="base-url"
                          type="url"
                          value={config.baseUrl}
                          onChange={(e) =>
                            updateConfig("baseUrl", e.target.value)
                          }
                          placeholder="https://docs.example.com"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="author"
                          className="mb-1 block text-xs font-medium text-slate-600"
                        >
                          维护者（可选）
                        </label>
                        <input
                          id="author"
                          type="text"
                          value={config.author}
                          onChange={(e) =>
                            updateConfig("author", e.target.value)
                          }
                          placeholder="团队或负责人"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* ────────── 右侧：生成与校验区 ────────── */}
          <section className="flex flex-col gap-6">
            {!hasInput ? (
              <EmptyStateGuide />
            ) : (
              <>
                {/* 上方：合规与结构校验报告 */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/50 sm:p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-800">
                      合规与结构校验报告
                    </h2>
                    <span className="text-xs text-slate-400">
                      实时更新
                    </span>
                  </div>
                  <ul className="space-y-3">
                    {validationItems.map((item) => (
                      <li
                        key={item.id}
                        className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-slate-800">
                              {item.label}
                            </span>
                            <StatusBadge status={item.status} />
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                            {item.detail}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 下方：llms.txt 预览窗口 */}
                <div className="flex flex-1 flex-col rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/50">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 sm:px-6">
                    <h2 className="text-sm font-semibold text-slate-800">
                      llms.txt 预览
                    </h2>
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-500">
                      {new TextEncoder().encode(llmsContent).length} bytes
                    </span>
                  </div>
                  <pre className="max-h-[360px] flex-1 overflow-auto bg-slate-900 px-5 py-4 font-mono text-xs leading-relaxed text-emerald-300/95 sm:px-6 sm:text-sm">
                    {llmsContent}
                  </pre>
                  <div className="flex flex-wrap gap-3 border-t border-slate-100 px-5 py-4 sm:px-6">
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    >
                      {copySuccess ? "✓ 已复制" : "一键复制"}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300/50"
                    >
                      下载 .txt 文件
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      {/* ═══════════════ 页脚 ═══════════════ */}
      <footer className="border-t border-slate-200/60 py-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} llms.txt 结构化生成与校验系统 · 大模型标准索引文件自动化工具
      </footer>
    </div>
  );
}
