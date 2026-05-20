// 메타데이터+자막을 Markdown 문서로 변환.

import { formatTimestamp } from "./youtube.js";
import { MD_CONFIG } from "./config.js";

export function buildMarkdown({ meta, captions, captionLang, aiSummary, relatedVideos, sttUsed, frames }) {
  const S = MD_CONFIG.SECTIONS;
  const fm = buildFrontmatter({ meta, captionLang, sttUsed });
  const header = buildHeader(meta);
  const desc = meta.description?.trim() ? `## ${S.DESCRIPTION}\n${meta.description.trim()}\n` : "";
  const transcript = buildTranscript(captions, sttUsed);
  const ai = aiSummary ? `\n## ${S.SUMMARY} (${aiSummary.provider})\n${cleanAiSummary(aiSummary.text)}\n` : "";
  const framesSec = buildFrames(frames);
  const related = buildRelated(relatedVideos);
  return [fm, header, desc, transcript, ai, framesSec, related].filter(Boolean).join("\n");
}

function buildFrames(frames) {
  if (!frames?.length) return "";
  const lines = [`\n## ${MD_CONFIG.SECTIONS.FRAMES}`];
  for (const f of frames) {
    lines.push(`\n### [${formatTimestamp(f.currentTime)}]`);
    lines.push(`![frame-${f.currentTime}](${f.relativePath})`);
    if (f.note) lines.push(f.note);
  }
  return lines.join("\n") + "\n";
}

function buildRelated(items) {
  if (!items?.length) return "";
  const lines = [`\n## ${MD_CONFIG.SECTIONS.RELATED}`];
  for (const r of items) {
    lines.push(`- [${r.title}](${r.url}) — ${r.channel}${r.meta ? ` · ${r.meta}` : ""}`);
  }
  return lines.join("\n") + "\n";
}

function buildFrontmatter({ meta, captionLang, sttUsed }) {
  const lines = [
    "---",
    `title: ${yamlString(meta.title)}`,
    `channel: ${yamlString(meta.channel)}`,
    `channel_url: ${yamlString(meta.channelUrl)}`,
    `url: ${yamlString(meta.url)}`,
    `video_id: ${yamlString(meta.videoId)}`,
    `published: ${yamlString(meta.publishedDate)}`,
    `duration: ${yamlString(formatTimestamp(meta.lengthSeconds))}`,
    `captured: ${yamlString(new Date().toISOString())}`,
    `language: ${yamlString(captionLang || "")}`,
    `source: ${yamlString(sttUsed ? "stt" : "captions")}`,
    `thumbnail: ${yamlString(meta.thumbnail)}`,
  ];
  if (meta.keywords?.length) {
    lines.push(`tags: [${meta.keywords.map((k) => yamlString(k)).join(", ")}]`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

function buildHeader(meta) {
  const date = (meta.publishedDate || "").slice(0, 10);
  const dur = formatTimestamp(meta.lengthSeconds);
  return [
    `# ${meta.title}`,
    ``,
    `**채널**: [${meta.channel}](${meta.channelUrl}) | **길이**: ${dur}${date ? ` | **업로드**: ${date}` : ""}`,
    `**원본**: ${meta.url}`,
    ``,
  ].join("\n");
}

function buildTranscript(captions, sttUsed) {
  const label = sttUsed ? MD_CONFIG.SECTIONS.TRANSCRIPT_STT : MD_CONFIG.SECTIONS.TRANSCRIPT;
  if (!captions?.length) {
    return `## ${label}\n_자막도 STT 결과도 없습니다._\n`;
  }
  const paragraphs = groupCaptionsToParagraphs(captions);
  console.log("[YTC] 문단 그루핑:", captions.length, "줄 →", paragraphs.length, "문단");
  const body = paragraphs
    .map((p) => `[${formatTimestamp(p.startMs / 1000)}] ${p.text}`)
    .join("\n\n");
  return `## ${label}\n${body}\n`;
}

// 자막 세그먼트를 읽기 좋은 문단으로 그루핑.
// 자연 발화는 휴지가 잦아서 단순 갭만으로 나누면 매 줄이 문단이 됨.
// 규칙(우선순위):
//  1) 이전 세그먼트가 문장 종결 부호로 끝났고 + 큰 갭(>= MAJOR_GAP) → 새 문단
//  2) 누적 글자수 >= MAX_CHARS이고 문장 종결로 끝남 → 새 문단
//  3) 매우 큰 갭(>= HARD_GAP) → 강제 새 문단 (종결 부호 무관)
//  4) 그 외엔 한 문단으로 계속 이어붙임
function groupCaptionsToParagraphs(captions) {
  const MAJOR_GAP = 1500;     // 문장 종결 후 1.5초 이상 휴지면 새 문단 (자연 호흡)
  const HARD_GAP = 5000;      // 5초 이상 휴지면 무조건 새 문단
  const MAX_CHARS = 600;      // 한 문단 최대 ~600자 (가독성·길이 균형)
  const SENT_END = /[.!?…。？！]\s*$/;
  const paragraphs = [];
  let cur = null;

  for (const c of captions) {
    if (!c?.text) continue;
    const prev = cur && cur.parts[cur.parts.length - 1];
    const gap = prev ? c.startMs - prev.startMs : Infinity;
    const prevEndsSentence = prev ? SENT_END.test(prev.text) : false;
    const overLen = cur && cur.charCount > MAX_CHARS && prevEndsSentence;
    const majorBreak = prevEndsSentence && gap >= MAJOR_GAP;
    const hardBreak = gap >= HARD_GAP;

    if (!cur || majorBreak || overLen || hardBreak) {
      cur = { startMs: c.startMs, parts: [], charCount: 0 };
      paragraphs.push(cur);
    }
    cur.parts.push(c);
    cur.charCount += c.text.length + 1;
  }

  return paragraphs.map((p) => ({
    startMs: p.startMs,
    text: smoothText(p.parts.map((x) => x.text).join(" ")),
  }));
}

// 텍스트 매끄럽게: 중복 공백 정리, 문장 부호 보정
function smoothText(s) {
  let out = String(s || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")   // 부호 앞 공백 제거
    .replace(/([.!?])(?=[^\s])/g, "$1 ") // 부호 뒤 공백 보장
    .trim();
  // 종결 부호로 끝나지 않으면 마침표 추가 (한국어/영문 공통)
  if (out && !/[.!?…)"。？！]$/.test(out)) out += ".";
  return out;
}

// AI 요약 텍스트 클린업 — CLI 프로세스 정리 메시지 / ANSI 잔재 / markdown fence 제거
function cleanAiSummary(text) {
  return String(text || "")
    // ANSI 이스케이프
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
    // markdown code fence
    .replace(/```[a-zA-Z]*\n?/g, "")
    // Codex 프로세스 정리 메시지 (영문)
    .replace(/[^\n]*(SUCCESS|FAILED|WARNING|ERROR):\s+The process with PID[^\n]*/gi, "")
    // 같은 줄에 PID \d+ 두 번 이상 (인코딩 깨진 버전 포함)
    .replace(/[^\n]*\bPID[ \t]*\d+[^\n]*\bPID[ \t]*\d+[^\n]*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// YAML 안전 문자열: 큰따옴표 + 백슬래시·따옴표 이스케이프
function yamlString(s) {
  if (s == null) return '""';
  const str = String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  return `"${str}"`;
}

export function safeFilename(s, maxLen = 120) {
  // OS별 금지문자 + 제어문자 제거
  let name = String(s || "untitled")
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (name.length > maxLen) name = name.slice(0, maxLen).trim();
  // Windows 예약어
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(name)) name = `_${name}`;
  return name || "untitled";
}

export function buildFilename({ meta, pattern }) {
  const date = new Date().toISOString().slice(0, 10);
  const tokens = {
    "{date}": date,
    "{channel}": safeFilename(meta.channel, 60),
    "{title}": safeFilename(meta.title, 120),
    "{video_id}": meta.videoId,
  };
  let out = pattern || "{channel}/{date}_{title}";
  for (const [k, v] of Object.entries(tokens)) out = out.split(k).join(v);
  // 경로 구분자만 살리고 각 세그먼트는 안전화
  const parts = out.split("/").map((p) => safeFilename(p));
  return `YouTube-Capture/${parts.join("/")}.md`;
}
