/**
 * 중앙 변수 시스템 (Single Source of Truth)
 * ──────────────────────────────────────────
 * AI 프롬프트 구조, 출력 섹션 레이블, 처리 한도, 기본 설정값을
 * 이 파일 하나에서 관리합니다. 수정 시 전체 동작이 일관되게 반영됩니다.
 *
 * 사용:  import { AI_CONFIG, MD_CONFIG, SETTING_DEFAULTS } from "../lib/config.js";
 */

// ── AI 처리 파라미터 ───────────────────────────────────────────────────────────
export const AI_CONFIG = {

  // 요약 출력 언어 기본값 (options에서 summaryLanguage로 재정의 가능)
  SUMMARY_LANGUAGE: "ko",

  // 요약 프롬프트 구조 — 여기만 수정하면 aiBridge.js 프롬프트가 자동 반영됩니다
  SUMMARY: {
    OVERVIEW_SENTENCES: "3~5",     // 개요 단락 문장 수
    KEY_POINTS_COUNT:   "10~15",   // 핵심 포인트 개수

    // ─ 엔티티 레이블 (언어를 바꿀 경우 이 객체만 수정) ─
    ENTITY_LABELS: {
      PEOPLE:    "👤 인물·채널",
      TECH:      "🛠 기술·도구",
      CONCEPTS:  "💡 핵심 개념",
    },

    // ─ 층위 분석 레이블 ─
    LAYER_LABELS: {
      WHAT:      "무엇",      // 영상이 무엇에 관한가
      WHY:       "왜",        // 왜 중요·유용한가
      HOW:       "어떻게",    // 과정·방법
      TAKEAWAY:  "시사점",    // 핵심 교훈·결론
    },
  },

  // Ollama 입력 글자 수 상한 (컨텍스트 오버플로우 방지)
  OLLAMA: {
    MAX_POLISH_CHARS:    12000,
    MAX_SUMMARIZE_CHARS:  8000,
  },

  // 병렬 polish 청크 설정 — 속도 최적화 핵심 파라미터
  // 원리: 자막을 N개 청크로 나눠 Promise.all 병렬 처리 → 시간 N분의 1로 단축
  // CHUNK_CHARS: 청크당 목표 글자 수 (이 값 이하면 단일 호출)
  // MAX_PARALLEL: 동시 실행 최대 청크 수 (너무 많으면 메모리/프로세스 과부하)
  POLISH_CHUNK_CHARS:  3000,   // 3,000자 이하 → 단일 호출, 초과 → 병렬 분할
  POLISH_MAX_PARALLEL:    4,   // 최대 4개 동시 (12,000자 영상도 1/4 시간)

  // 각 작업별 타임아웃 (ms)
  // POLISH: 청크 단위 기준 (3,000자 청크 1개 한도) — 이전 240s(전체 자막 단일 호출)에서 단축
  TIMEOUTS: {
    HEALTH:       5_000,
    POLISH:      70_000,  // 청크 1개(≤3,000자) 한도. 초과 시 해당 청크만 실패→원본 유지
    SUMMARIZE:  120_000,
    PYTHON_HOOK: 75_000,
    TRANSCRIBE: 600_000,
  },
};

// ── Markdown 출력 구조 레이블 ─────────────────────────────────────────────────
export const MD_CONFIG = {
  SECTIONS: {
    DESCRIPTION:  "설명",
    TRANSCRIPT:   "대본",
    TRANSCRIPT_STT: "대본 (STT)",
    SUMMARY:      "AI 분석",         // 요약 섹션 헤더
    FRAMES:       "프레임 캡쳐",
    RELATED:      "관련 영상 (프리미엄)",
  },
};

// ── 공용 설정 기본값 (background.js / options.js 양쪽에서 import) ─────────────
// 번역 관련 키를 제거했습니다 — enableTranslate / translateTarget / autoTranslateNonNative
export const SETTING_DEFAULTS = {
  preferredLangs:     ["ko", "en"],
  filenamePattern:    "{channel}/{date}_{title}",
  aiProvider:         "none",
  ollamaModel:        "qwen2.5:3b",
  claudeModel:        "",
  summaryLanguage:    AI_CONFIG.SUMMARY_LANGUAGE,
  enablePolish:       true,
  enableSummary:      true,
  enableAutoCleanup:  true,
  enablePythonHook:   false,
  userDictionary:     {},
  enableSTT:          false,
  sttLanguage:        "ko",
  sttMaxSeconds:      600,
  licenseKey:         "",
  premiumAutoClassify:   false,
  premiumIncludeRelated: false,
};
