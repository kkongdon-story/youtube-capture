# 유튜브 스크립트 캡쳐 (YouTube Script Capture)

유튜브 영상에서 **단축키 한 번**으로 메타데이터·자막을 **Markdown 파일**로 저장하는 크롬 확장 프로그램. 본인이 구독 중인 **ChatGPT Plus / Claude Pro**를 연동해 AI 요약까지 자동화합니다.

## 빠른 시작 (비개발자)

→ **[docs/INSTALL_KO.md](docs/INSTALL_KO.md)** 한국어 단계별 가이드를 보세요.

## 핵심 기능 (v0.2)

- ⌨️ `Ctrl+Shift+S` 단축키로 즉시 캡쳐 (YAML frontmatter MD 저장)
- 📸 `Ctrl+Shift+F` 로 현재 프레임을 캡쳐해 같은 MD에 첨부
- 🌐 다국어 자막 지원 + 자동 번역 (사용자 정의 대상 언어)
- 🎤 자막 없는 영상은 STT(OpenAI Whisper) 자동 폴백
- 🤖 ChatGPT Plus / Claude Pro 구독을 그대로 AI 요약에 활용
- 💎 프리미엄 (라이선스 키): 자동 카테고리 분류 + 관련 영상 첨부
- 🔒 외부 라이브러리 0개, 권한 최소, OpenAI/Anthropic 공식 CLI 경로만 사용

## 아키텍처 (개발자용)

```
Chrome 확장 ──(Native Messaging)── 헬퍼(Node) ──(spawn)── codex / claude CLI ── ChatGPT/Anthropic
```

- **확장**: `extension/` — Manifest V3, vanilla JS, 외부 의존성 0
- **헬퍼**: `helper/` — Node.js stdlib만 사용, stdio 길이-프리픽스 NM 프로토콜 직접 구현
- **인스톨러**: `installers/` — Windows BAT, macOS .command, Linux sh

## 개발자 로드

```bash
# 1) 확장 로드
# chrome://extensions → 개발자 모드 → "압축 해제된 확장 프로그램 로드" → extension/ 폴더

# 2) 확장 ID 복사 → 헬퍼 등록
node helper/manifest/install.mjs --extension-id <확장ID>

# 3) (선택) AI CLI 설치
npm install -g @openai/codex && codex login
# 또는
npm install -g @anthropic-ai/claude-code && claude login

# 4) 옵션 페이지에서 "연결 점검"
```

## 보안 모델

- `nativeMessaging` 권한만으로 외부 통신; host 권한은 `youtube.com`만
- 헬퍼 매니페스트 `allowed_origins`로 우리 확장 ID만 허용
- `spawn`은 인자 배열 + `shell: false` → 셸 인젝션 차단
- action / provider 화이트리스트, 메시지 크기 1MB 상한
- 토큰은 CLI(OS keychain)가 보관, 우리 코드는 절대 접근 X
- MV3 CSP 기본값, eval/인라인 스크립트 금지

## 검증 (verification)

`docs/INSTALL_KO.md`의 "첫 테스트" 단락대로 동작하면 핵심 흐름 OK. 상세 검증 항목은 `C:\Users\js480\.claude\plans\hazy-pondering-map.md` 끝부분 참조.

## 라이선스 (예정)

MIT. 사용된 외부 도구의 라이선스:
- OpenAI Codex CLI — Apache-2.0 (사용자가 직접 설치)
- Anthropic Claude Code CLI — 사용자가 직접 설치

## v2+ 로드맵

- 결제 시스템(Stripe) + 서버측 라이선스 검증 (현재는 오프라인 체크섬)
- YouTube Data API 기반 알고리즘 추천 영상 검색
- 로컬 임베딩 기반 대규모 자동 분류
- 영상 챕터별 자동 요약 + 인덱싱
