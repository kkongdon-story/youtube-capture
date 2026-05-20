// 자막 자동 정리 — AI 없이 작동하는 규칙 기반 정리.
// 외부 의존성 0, 순수 함수.

// 내장 사전: 흔한 ASR 오인식 (확실한 것만 — 오교정 방지를 위해 최소화)
const BUILTIN_DICT = {
  // 일반 ASR 오인식 (전문가 도메인은 사용자 사전에 추가)
  "어쨋든": "어쨌든",
  "어찌됐든": "어찌 됐든",
  "되요": "돼요",
  "안되": "안 돼",
  "구요": "고요",
  "이쁘": "예쁘",
  "촛점": "초점",
  "넓을": "넒을",
};

// 군더더기 토큰 (문장 중간/시작에서 단독으로 쓰일 때만 제거)
// 너무 공격적이면 의미 손실 → 보수적으로
const FILLERS = ["어", "음", "에", "아", "그러니까는"];

export function cleanupSegments(segments, { userDictionary = {}, removeFillers = true, collapseRepeats = true } = {}) {
  if (!Array.isArray(segments) || segments.length === 0) return segments;
  const dict = { ...BUILTIN_DICT, ...(userDictionary || {}) };
  return segments.map((s) => ({
    startMs: s.startMs,
    text: cleanText(s.text, { dict, removeFillers, collapseRepeats }),
  })).filter((s) => s.text && s.text.length > 0);
}

export function cleanText(text, { dict = {}, removeFillers = true, collapseRepeats = true } = {}) {
  let s = String(text || "");

  // 1. 사전 치환 (단어 경계 보장, 한국어는 공백+조사 패턴)
  for (const [bad, good] of Object.entries(dict)) {
    if (!bad) continue;
    // 한글은 \b가 잘 안 먹어서 단순 문자열 치환 (조사 보존 위해 lookahead)
    const re = new RegExp(escapeRe(bad), "g");
    s = s.replace(re, good);
  }

  // 2. 반복 단어 정리: "그 그 그래서" → "그래서", "이 이거" → "이거"
  if (collapseRepeats) {
    s = collapseRepeatedTokens(s);
  }

  // 3. 군더더기 제거 (보수적으로 — 문장 시작이나 토큰으로 단독일 때만)
  if (removeFillers) {
    s = removeFillerWords(s);
  }

  // 4. 공백/부호 정규화
  s = s
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/([.!?])(?=[^\s])/g, "$1 ")
    .trim();

  return s;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 동일 토큰이 공백 사이에서 연속으로 반복되면 하나로 합침
// + ASR 더듬거림 패턴 ("d default", "co code", "differ different")도 정리
function collapseRepeatedTokens(s) {
  // 1. 짧은 1~3글자 토큰의 직접 반복 ("그 그", "그 그 그", "이 이")
  s = s.replace(/(^|\s)(\S{1,3})(\s+\2)+(?=\s|$|[.,!?])/g, "$1$2");
  // 2. 같은 어구가 즉시 반복 (4~8글자): "취사병 취사병" → "취사병"
  s = s.replace(/(^|\s)(\S{2,8})\s+\2(?=\s|$|[.,!?])/g, "$1$2");
  // 3. ASR 더듬거림: 짧은 단어가 그것을 prefix로 갖는 완전 단어 바로 앞 ("d default" → "default")
  //    영문 ASR에서 매우 흔함. 한글에는 영향 없음.
  s = s.replace(/(^|\s)([A-Za-z]{1,4})\s+(\2[A-Za-z]+)(?=\s|$|[.,!?])/g, "$1$3");
  // 4. 역방향 더듬거림: 완전 단어 다음에 같은 prefix만 ("default d" → "default") — 드물지만 대비
  s = s.replace(/(^|\s)([A-Za-z]+)\s+([A-Za-z]{1,4})(?=\s|$|[.,!?])/g, (full, lead, full_word, partial) => {
    return full_word.startsWith(partial) && full_word.length > partial.length ? `${lead}${full_word}` : full;
  });
  return s;
}

// 군더더기 토큰을 문장에서 제거. 의미 토큰을 손상시키지 않도록 단독 토큰만.
function removeFillerWords(s) {
  // 토큰 사이에 끼인 군더더기 ("그래서 어 이거" → "그래서 이거")
  for (const f of FILLERS) {
    const re = new RegExp(`(^|\\s)${escapeRe(f)}(?=\\s)`, "g");
    s = s.replace(re, "$1");
  }
  // 문장 시작의 군더더기
  for (const f of FILLERS) {
    const re = new RegExp(`^${escapeRe(f)}\\s+`, "");
    s = s.replace(re, "");
  }
  return s;
}
