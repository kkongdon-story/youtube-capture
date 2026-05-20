# YouTube Capture 설치 가이드 (비개발자용)

코딩을 전혀 모르셔도 따라할 수 있게 단계별로 설명합니다. **10~20분** 정도 걸려요.

---

## 한눈에 보기

| 부품 | 무엇 | 설치 필요? |
|---|---|---|
| 크롬 확장 | 단축키·자막·MD 저장의 본체 | 필수 |
| 헬퍼 (Node.js) | 확장과 AI CLI를 잇는 다리 | AI/STT 쓸 때 |
| Codex CLI 또는 Claude CLI | 결제 중인 ChatGPT/Claude 구독으로 AI 사용 | AI 쓸 때 |
| Whisper CLI | 자막 없는 영상을 STT로 변환 | STT 쓸 때 |

**자막 있는 영상만 저장**한다면 → 1단계만 하면 끝.
**AI 요약·번역**까지 → 1~3단계.
**STT(자막 없는 영상)** 까지 → 1~4단계.

---

## 1단계: 크롬 확장 설치

1. Chrome 주소창에 `chrome://extensions` 입력 → 엔터
2. 우측 상단 **개발자 모드** 켜기
3. **압축 해제된 확장 프로그램을 로드합니다** 클릭
4. 받으신 폴더의 `extension` 폴더 선택
5. "YouTube Capture" 카드가 보이면 성공
6. 카드 안의 **ID**(긴 영문 문자열) 복사해두세요

### 🎯 첫 테스트
- 유튜브에서 자막 있는 영상 열기 (TED, 일반 유튜버 영상 대부분 OK)
- `Ctrl+Shift+S` (Mac: `⌘+Shift+S`)
- 다운로드 → `YouTube-Capture/{채널}/{날짜}_{제목}.md` 확인

### 📸 프레임 캡쳐 (보너스)
- 같은 영상 재생 중 `Ctrl+Shift+F`
- 방금 만든 MD 옆에 `.jpg` 파일이 생기고 MD 안 `## 프레임 캡쳐` 섹션에 자동 첨부

여기까지가 **AI 없이도 동작하는 기능**. AI를 안 쓸 거면 끝.

---

## 2단계: 헬퍼 설치 (AI / STT 기능을 쓸 때)

### Node.js 먼저 설치
- [nodejs.org/ko](https://nodejs.org/ko) → LTS 다운로드 → 다음 → 다음 → 완료

### 헬퍼 등록
운영체제에 맞는 파일 더블클릭:
- **Windows**: `installers/windows/install.bat`
- **macOS**: `installers/macos/install.command` (보안 경고 시: 시스템 설정 → 개인정보 보호 및 보안 → "그래도 열기")
- **Linux**: 터미널에서 `bash installers/linux/install.sh`

검은 창이 뜨면 1단계에서 복사한 **확장 ID 붙여넣기** → 엔터.
"✅ 헬퍼 설치 완료" 나오면 성공.

---

## 3단계: AI CLI 설치 (둘 중 하나, 또는 둘 다)

### A. ChatGPT Plus 구독을 그대로 사용
터미널(Windows: PowerShell) 열고:
```
npm install -g @openai/codex
codex login
```
브라우저 열리면 본인 ChatGPT 계정으로 로그인. Plus/Pro 구독이 그대로 사용됩니다.

### B. Claude Pro 구독을 그대로 사용
```
npm install -g @anthropic-ai/claude-code
claude login
```
브라우저에서 Anthropic 계정 로그인.

> 둘 다 설치해도 OK. 확장 옵션에서 어느 쪽을 쓸지 선택.

---

## 4단계: STT 도구 설치 (선택 — 자막 없는 영상까지 처리)

자막이 아예 없는 영상(라이브, 일부 음악 등)을 처리하려면 OpenAI Whisper가 필요합니다.

```
pip install -U openai-whisper
```

**ffmpeg** 도 필요:
- Windows: [ffmpeg.org/download.html](https://ffmpeg.org/download.html#build-windows) 또는 `winget install ffmpeg`
- macOS: `brew install ffmpeg`
- Linux: `sudo apt install ffmpeg` (Ubuntu/Debian)

⚠️ STT는 시간이 좀 걸립니다 (영상 길이만큼 녹음 + Whisper 처리 시간). MVP에서는 영상을 처음부터 끝까지 재생하면서 탭 오디오를 녹음하는 방식이라, 영상이 정상 재생되어야 합니다.

---

## 5단계: 옵션 페이지에서 설정

확장 아이콘 우클릭 → **옵션** 클릭.

| 섹션 | 설정 |
|---|---|
| AI 요약 | "Codex" 또는 "Claude" 선택 → 연결 점검 → 저장 |
| 자동 번역 | 체크 + 대상 언어 (예: `en`) 입력 |
| STT | 자동 STT 활성화 + 언어 입력 |
| 프리미엄 | "체험 키 발급" 클릭하면 자동 인증 (MVP 데모용) |

**연결 점검** 버튼이 `Codex: OK / Claude: OK / Whisper: OK`를 모두 OK 띄우면 완벽.

---

## 프리미엄 기능 미리보기

옵션 페이지에서 **체험 키 발급** 클릭 후 저장하면 활성화:

- **자동 분류**: AI가 영상 주제 보고 `개발/비즈니스/요리/...` 폴더 자동 분류
- **관련 영상 첨부**: 사이드바의 추천 영상 10개를 MD에 함께 저장 (알고리즘 추천 보존)
- **릴리스 AI 수준**: AI 요약 + 자동 번역 + 자동 분류 + 관련 영상이 한 번에 동작

(정식 배포 시에는 결제·라이선스 서버 연동 예정)

---

## 문제 해결

| 증상 | 해결 |
|---|---|
| 단축키가 안 먹힘 | `chrome://extensions/shortcuts` 에서 다시 설정 |
| "헬퍼 연결 실패" | 인스톨러 재실행, 확장 ID 정확한지 확인 |
| "CLI를 찾지 못했습니다" | 터미널에서 `codex --version` / `claude --version` 동작 확인 |
| STT가 동작 안 함 | Whisper + ffmpeg 설치 확인. 영상이 재생 중이어야 함 |
| 프레임 캡쳐 실패 | DRM 보호 영상은 캡쳐 불가 (대부분의 일반 YouTube 영상은 OK) |
| 한글 자막이 영어로 | 옵션에서 선호 언어를 `ko, en` 순서로 |

로그: `~/.youtube-capture/helper.log` (토큰·키 절대 기록 안 함).

---

## 보안

- ChatGPT/Claude 구독은 **공식 CLI**를 통해서만 사용. 확장이 직접 비밀번호를 다루지 않음.
- 자막·오디오는 AI/STT 활성 시에만 CLI에 전달.
- 헬퍼는 우리 확장 ID만 받도록 잠겨 다른 사이트가 호출 불가.
- 외부 npm 의존성 0개 — 공급망 공격 면적 최소.
