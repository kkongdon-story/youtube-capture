// Native Messaging 헬퍼 클라이언트. 매 호출마다 새 포트 — MV3 SW idle 대응.
import { AI_CONFIG } from "./config.js";

const HOST = "com.youtubecapture.bridge";

export function callHelper(message, { timeoutMs = 60000, onChunk } = {}) {
  return new Promise((resolve, reject) => {
    let port;
    try { port = chrome.runtime.connectNative(HOST); }
    catch (e) { reject(new Error(`헬퍼 연결 실패: ${e.message}`)); return; }

    const id = crypto.randomUUID();
    let finished = false;
    let collected = "";

    const cleanup = (fn) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { port.disconnect(); } catch {}
      fn();
    };
    const timer = setTimeout(() => cleanup(() => reject(new Error("헬퍼 응답 시간 초과"))), timeoutMs);

    port.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError;
      if (err && !finished) cleanup(() => reject(new Error(`헬퍼 연결 끊김: ${err.message}`)));
    });

    port.onMessage.addListener((msg) => {
      if (msg.id !== id) return;
      if (msg.type === "chunk") {
        collected += msg.data || "";
        onChunk?.(msg.data || "");
      } else if (msg.type === "done") {
        cleanup(() => resolve({ ok: true, text: collected, ...msg.result }));
      } else if (msg.type === "error") {
        cleanup(() => reject(new Error(msg.error || "헬퍼 오류")));
      }
    });

    try { port.postMessage({ id, ...message }); }
    catch (e) { cleanup(() => reject(new Error(`헬퍼 전송 실패: ${e.message}`))); }
  });
}

export function checkHelperHealth() {
  return callHelper({ action: "health" }, { timeoutMs: 5000 });
}

export function summarize({ provider, captionsText, meta, language = "ko", ollamaModel, claudeModel }) {
  const cfg = AI_CONFIG.SUMMARY;
  const targetName = sourceLangName(language);
  const isKo = language.startsWith("ko");

  // 엔티티 레이블 (config.js 에서 한 번에 수정 가능)
  const { PEOPLE, TECH, CONCEPTS } = cfg.ENTITY_LABELS;
  const { WHAT, WHY, HOW, TAKEAWAY } = cfg.LAYER_LABELS;

  const prompt = [
    `You are a senior analyst. Analyze the following YouTube transcript and produce a structured report in ${targetName}.`,
    ``,
    `**Video info:**`,
    `- Title: ${meta.title}`,
    `- Channel: ${meta.channel}`,
    ``,
    `**Transcript:**`,
    captionsText,
    ``,
    `**Output in ${targetName} — plain Markdown, no code blocks, no preamble. Follow this EXACT structure:**`,
    ``,
    `### 개요`,
    `(${cfg.OVERVIEW_SENTENCES} sentences: the single most important takeaway, context, and conclusion)`,
    ``,
    `### 등장 요소`,
    `**${PEOPLE}**: (people, speakers, channel name, organizations — comma-separated, if none write "없음")`,
    `**${TECH}**: (tools, frameworks, languages, software, platforms — comma-separated, if none write "없음")`,
    `**${CONCEPTS}**: (domain terms, ideas, methodologies — comma-separated)`,
    ``,
    `### 층위 분석`,
    `**[${WHAT}]** (1~2 sentences: what is this video about specifically)`,
    `**[${WHY}]** (1~2 sentences: why does it matter / what problem does it solve)`,
    `**[${HOW}]** (2~3 sentences: how it works, the process or method demonstrated)`,
    `**[${TAKEAWAY}]** (1~2 sentences: the one thing a viewer should remember)`,
    ``,
    `### 핵심 포인트`,
    `(${cfg.KEY_POINTS_COUNT} bullets, each a complete sentence, most important facts/steps/insights)`,
    `- `,
    `- `,
    isKo ? `\n모든 출력은 한국어로. 외국어 단어는 원문 유지(예: Laravel, Claude). 중국어/일본어 혼용 금지.` : "",
  ].filter(Boolean).join("\n");

  return callHelper(
    { action: "summarize", provider, prompt, ollamaModel, claudeModel },
    { timeoutMs: AI_CONFIG.TIMEOUTS.SUMMARIZE }
  );
}

// polish + translate 통합 호출 — 한 번의 LLM 호출로 둘 다 수행
// 응답 형식: <POLISHED>...</POLISHED><TRANSLATION>...</TRANSLATION>
// 토큰 ~50% 절감, 시간 ~50% 단축
export function polishAndTranslate({ provider, transcriptText, meta, sourceLang, targetLang, ollamaModel, claudeModel }) {
  const srcName = sourceLangName(sourceLang);
  const tgtName = sourceLangName(targetLang);
  const tgtCode = String(targetLang || "").toLowerCase();
  const isKoTarget = tgtCode.startsWith("ko");
  const prompt = [
    `You will receive a YouTube auto-generated transcript. Perform TWO tasks in one response:`,
    ``,
    `**TASK 1 — Clean (in ${srcName})**: Fix ASR errors based on context (e.g., "cloud code" → "Claude Code"). Remove stutters ("d default" → "default", "very very" → "very"). Keep speaker voice. Preserve [HH:MM:SS] timestamps as-is. Keep proper nouns intact.`,
    ``,
    `**TASK 2 — Translate (into ${tgtName})**: Translate the CLEANED transcript into ${tgtName}. Every line. Natural fluent ${tgtName}, not literal. Preserve [HH:MM:SS] timestamps. Keep proper nouns (e.g., "Claude Code", "GitHub") in original form.`,
    isKoTarget ? `대상 언어는 한국어. 중국어/일본어 단어 섞이지 않도록 주의.` : "",
    ``,
    `**Output format — EXACTLY this structure, no preamble, no code blocks:**`,
    `<POLISHED>`,
    `[00:00] cleaned line 1`,
    ``,
    `[00:05] cleaned line 2`,
    `...`,
    `</POLISHED>`,
    `<TRANSLATION>`,
    `[00:00] translated line 1`,
    ``,
    `[00:05] translated line 2`,
    `...`,
    `</TRANSLATION>`,
    ``,
    `**Video info:** ${meta?.title || ""} (${meta?.channel || ""})`,
    ``,
    `**Source transcript (in ${srcName}):**`,
    transcriptText,
    ``,
    `Begin output now with <POLISHED>:`,
  ].filter(Boolean).join("\n");
  return callHelper({ action: "summarize", provider, prompt, ollamaModel, claudeModel }, { timeoutMs: 300000 });
}

// 자막 정리: ASR 오류 교정 + 매끄러운 문단화. 원본 언어를 유지하면서 정리.
export function polishTranscript({ provider, transcriptText, meta, sourceLang, ollamaModel, claudeModel }) {
  const langName = sourceLangName(sourceLang);
  const prompt = [
    `You are a transcript editor. Clean up the following auto-generated transcript while keeping it in the SAME language as the input.`,
    ``,
    `**CRITICAL RULES:**`,
    `1. Output language MUST be the same as input language (${langName}). DO NOT TRANSLATE.`,
    `2. Fix obviously misrecognized words based on context (e.g., "cloud code" -> "Claude Code" when context is about Anthropic's Claude).`,
    `3. Remove ASR stutters where a partial word is followed by the full word (e.g., "d default" -> "default", "differ different" -> "different", "co code" -> "code"). Also collapse exact duplicates ("very very" -> "very").`,
    `4. Remove filler words but keep the speaker's voice/style.`,
    `5. Keep timestamps in [HH:MM:SS] or [MM:SS] format exactly as-is at the start of each paragraph.`,
    `6. Fix punctuation and spacing for readability.`,
    `7. DO NOT add information not in the original. DO NOT summarize. Keep length similar.`,
    `8. Output ONLY the cleaned transcript. No explanations, no headers, no code blocks, no preamble.`,
    ``,
    `**Video context (for understanding terms):**`,
    `- Title: ${meta?.title || ""}`,
    `- Channel: ${meta?.channel || ""}`,
    `- Source language: ${langName}`,
    ``,
    `**Original transcript (in ${langName}):**`,
    transcriptText,
    ``,
    `**Cleaned transcript (in ${langName}, same language):**`,
  ].join("\n");
  // 청크 단위 병렬 처리 기준 타임아웃 — 3,000자 청크는 60s 이내 완료 기대
  // 전체 자막 단일 호출 시절(240s)에서 단축. 청크 실패 시 원본 유지 fallback 있음.
  return callHelper({ action: "summarize", provider, prompt, ollamaModel, claudeModel }, { timeoutMs: AI_CONFIG.TIMEOUTS.POLISH });
}

function sourceLangName(code) {
  const map = { ko: "Korean", en: "English", ja: "Japanese", zh: "Chinese", es: "Spanish", fr: "French", de: "German" };
  if (!code) return "the source language";
  const base = code.toLowerCase().split(/[-_]/)[0];
  return map[base] || code;
}

export function translate({ provider, sourceText, targetLang, ollamaModel, claudeModel }) {
  const targetName = sourceLangName(targetLang);
  const targetCode = String(targetLang || "").toLowerCase();
  const isKo = targetCode.startsWith("ko");
  const isJa = targetCode.startsWith("ja");
  // 참고 예시(exampleBlock)를 제거함.
  // 소형 모델(Ollama qwen2.5 등)이 예시 텍스트를 그대로 응답으로 출력하는 문제 방지.
  // 대신 규칙과 마지막 지시 줄로만 구성.

  const prompt = [
    `Translate the following YouTube transcript into ${targetName}. Output ONLY the translation.`,
    ``,
    `Rules:`,
    `1. Output language: ${targetName} ONLY. Do NOT mix other languages.`,
    `2. Translate EVERY line. Do NOT skip or leave lines in the source language.`,
    `3. Keep each [MM:SS] timestamp at the start of the same line. Do NOT remove timestamps.`,
    `4. Natural fluent ${targetName}. Keep proper nouns (Claude, GitHub, Laravel, etc.) unchanged.`,
    `5. No preamble, no explanation, no headers. Output the translated lines immediately.`,
    isKo ? `6. 반드시 한국어로만 출력. 중국어·영어 단어 섞지 말 것.` : "",
    isJa ? `6. 日本語のみで出力。他の言語を混ぜないこと。` : "",
    ``,
    `Transcript:`,
    sourceText,
    ``,
    `Translation in ${targetName}:`,
  ].filter(Boolean).join("\n");
  return callHelper({ action: "summarize", provider, prompt, ollamaModel, claudeModel }, { timeoutMs: 180000 });
}

// 프리미엄: 영상 메타로부터 폴더명 자동 분류 (한 단어 카테고리)
export function classify({ provider, meta }) {
  const prompt = [
    `다음 유튜브 영상의 주제를 한 단어 한국어 카테고리로 분류해 주세요.`,
    `예: 개발, 비즈니스, 과학, 게임, 음악, 영화, 요리, 운동, 여행, 학습, 뉴스, 자기계발, 기타`,
    `반드시 한 단어로만, 따옴표나 설명 없이.`,
    ``,
    `제목: ${meta.title}`,
    `채널: ${meta.channel}`,
    `설명: ${(meta.description || "").slice(0, 500)}`,
    `태그: ${(meta.keywords || []).slice(0, 10).join(", ")}`,
  ].join("\n");
  return callHelper({ action: "summarize", provider, prompt }, { timeoutMs: 30000 });
}

// Python 커스텀 hook: ~/.youtube-capture/transcript_hook.py 호출
export function runPythonHook({ segments, meta, captionLang }) {
  return callHelper(
    { action: "pythonHook", segments, meta, captionLang },
    { timeoutMs: 75000 }
  );
}

// STT: 헬퍼에 base64 오디오 전송 → whisper CLI 호출
export function transcribeAudio({ audioBase64, language = "ko" }) {
  return callHelper(
    { action: "transcribe", audioBase64, language, format: "webm" },
    { timeoutMs: 600000 }
  );
}
