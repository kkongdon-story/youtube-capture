// 다중 포맷 출력 — Markdown / TXT / HTML / PDF(HTML경유) / CSV
// 모두 buildMarkdown의 결과를 기반으로 변환. 외부 의존성 0.

import { buildMarkdown, safeFilename } from "./markdown.js";
import { formatTimestamp } from "./youtube.js";

export function toMarkdown(data) {
  return buildMarkdown(data);
}

export function toTxt(data) {
  const md = buildMarkdown(data);
  return md
    .replace(/^---[\s\S]*?---\n/, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^>\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim() + "\n";
}

export function toHtml(data) {
  const md = buildMarkdown(data);
  const fmMatch = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const body = fmMatch ? fmMatch[2] : md;
  const title = data?.meta?.title || "Transcript";

  const lines = body.split("\n");
  const out = [];
  let inList = false, inPara = false;
  const flushPara = () => { if (inPara) { out.push("</p>"); inPara = false; } };
  const flushList = () => { if (inList) { out.push("</ul>"); inList = false; } };

  for (const line of lines) {
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      flushPara(); flushList();
      out.push(`<h${h[1].length}>${escapeHtml(h[2])}</h${h[1].length}>`);
      continue;
    }
    const li = line.match(/^[-*+]\s+(.+)$/);
    if (li) {
      flushPara();
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inlineHtml(li[1])}</li>`);
      continue;
    }
    if (!line.trim()) {
      flushPara(); flushList();
      continue;
    }
    flushList();
    if (!inPara) { out.push("<p>"); inPara = true; }
    out.push(inlineHtml(line));
  }
  flushPara(); flushList();

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font: 16px/1.7 -apple-system, "Pretendard", system-ui, sans-serif; max-width: 760px; margin: 0 auto; padding: 32px 20px; color: #222; }
  h1 { font-size: 26px; border-bottom: 2px solid #2D6FF7; padding-bottom: 8px; }
  h2 { font-size: 20px; margin-top: 32px; color: #2D6FF7; }
  h3 { font-size: 17px; margin-top: 20px; }
  p { margin: 10px 0; }
  ul { padding-left: 22px; }
  a { color: #2D6FF7; }
  code { background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: ui-monospace, monospace; }
  blockquote { border-left: 3px solid #ddd; margin: 12px 0; padding: 4px 16px; color: #555; }
</style>
</head>
<body>
${out.join("\n")}
</body>
</html>`;
}

function inlineHtml(s) {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function toPdfHtml(data) {
  const html = toHtml(data);
  return html.replace(
    "</body>",
    `<script>window.addEventListener('load', () => { setTimeout(() => window.print(), 500); });</script></body>`
  );
}

export function toCsv(data) {
  const captions = data?.captions || [];
  const meta = data?.meta || {};
  const lines = [
    `# ${csvCell(meta.title || "")}`,
    `# 채널: ${csvCell(meta.channel || "")}`,
    `# URL: ${csvCell(meta.url || "")}`,
    `# 언어: ${csvCell(data?.captionLang || "")}`,
    "",
    "timestamp,text",
  ];

  for (const c of captions) {
    const ts = formatTimestamp((c.startMs || 0) / 1000);
    lines.push(`${csvCell(ts)},${csvCell(c.text)}`);
  }

  return "﻿" + lines.join("\n") + "\n";
}

function csvCell(s) {
  const str = String(s == null ? "" : s);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export const FORMAT_INFO = {
  md:   { ext: "md",   mime: "text/markdown",          label: "Markdown" },
  txt:  { ext: "txt",  mime: "text/plain",             label: "일반 텍스트" },
  html: { ext: "html", mime: "text/html",              label: "HTML 페이지" },
  pdf:  { ext: "html", mime: "text/html",              label: "PDF (브라우저 인쇄)" },
  csv:  { ext: "csv",  mime: "text/csv;charset=utf-8", label: "CSV (Excel)" },
};

export function generateOutput(format, data) {
  switch (format) {
    case "txt":  return toTxt(data);
    case "html": return toHtml(data);
    case "pdf":  return toPdfHtml(data);
    case "csv":  return toCsv(data);
    case "md":
    default:     return toMarkdown(data);
  }
}
