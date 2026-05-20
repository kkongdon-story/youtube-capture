#!/usr/bin/env bash
# YouTube Capture - macOS 자동 설치 마법사
# 사용: Finder에서 더블클릭 (최초 1회: chmod +x install.command)

set -e

BLUE='\033[1;34m'; YELLOW='\033[1;33m'; GREEN='\033[1;32m'
RED='\033[1;31m'; GRAY='\033[1;30m'; RESET='\033[0m'

title() {
  echo ""
  echo -e "${BLUE}════════════════════════════════════════════════════════════${RESET}"
  echo -e "${BLUE}  $1${RESET}"
  echo -e "${BLUE}════════════════════════════════════════════════════════════${RESET}"
}
step() { echo -e "${YELLOW}▶ $1${RESET}"; }
ok()   { echo -e "  ${GREEN}✓ $1${RESET}"; }
warn() { echo -e "  ${YELLOW}⚠ $1${RESET}"; }
err()  { echo -e "  ${RED}✗ $1${RESET}"; }
pause_exit() { echo ""; read -p "Enter 키로 종료" _; exit "${1:-0}"; }

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"

title "유튜브 스크립트 캡쳐 설치 마법사"
echo "  유튜브 영상을 단축키 한 번으로 Markdown으로 저장하는 확장입니다."
echo ""

# 1. Node.js
step "Node.js 확인 중..."
if ! command -v node >/dev/null 2>&1; then
  err "Node.js가 설치되지 않았습니다."
  read -p "  Homebrew로 자동 설치할까요? (Y/n) " ans
  if [[ ! "$ans" =~ ^[nN] ]]; then
    if command -v brew >/dev/null 2>&1; then
      brew install node
    else
      warn "Homebrew 없음. brew.sh 설치 또는 nodejs.org 직접 받기"
      open "https://nodejs.org/ko"
      pause_exit 1
    fi
  else
    open "https://nodejs.org/ko"
    pause_exit 1
  fi
fi
ok "Node.js 발견: $(node -v)"

# 2. Fixed extension ID
step "Using fixed extension ID"
EXT_ID="kjdgcjakmgocegklcnkanbpjigfajkal"
ok "Extension ID: $EXT_ID"

# 3. 헬퍼 등록
step "Native Messaging 헬퍼 등록 중..."
node "$PROJECT_ROOT/helper/manifest/install.mjs" --extension-id "$EXT_ID"
ok "헬퍼 등록 완료"

# 4. Ollama
step "Ollama (무료 로컬 AI) 확인 중..."
WANT_OLLAMA=false
if command -v ollama >/dev/null 2>&1; then
  ok "Ollama 발견: $(ollama -v 2>/dev/null || echo installed)"
  WANT_OLLAMA=true
else
  warn "Ollama가 설치되지 않았습니다."
  echo ""
  echo "  Ollama는 본인 Mac에서 무료로 동작하는 AI 엔진입니다."
  echo "  · 자막 자동 정리 + 영어 → 한국어 자동 번역"
  echo "  · 구독료 없음, 인터넷 없이도 작동"
  read -p "  지금 자동 설치할까요? (Y/n) " ans
  if [[ ! "$ans" =~ ^[nN] ]]; then
    if command -v brew >/dev/null 2>&1; then
      brew install ollama
      brew services start ollama 2>/dev/null || true
      ok "Ollama 설치 완료"
      WANT_OLLAMA=true
    else
      warn "Homebrew 없음. 공식 페이지 엽니다."
      open "https://ollama.com/download/mac"
      WANT_OLLAMA=false
    fi
  fi
fi

# 5. 모델
if $WANT_OLLAMA && command -v ollama >/dev/null 2>&1; then
  step "AI 모델(qwen2.5:3b) 확인 중..."
  if ollama list 2>/dev/null | grep -q "qwen2.5:3b"; then
    ok "qwen2.5:3b 이미 설치됨"
  else
    echo "  qwen2.5:3b 다운로드 중... (약 2GB, 5~15분)"
    if ollama pull qwen2.5:3b; then
      ok "모델 다운로드 완료"
    else
      err "모델 다운로드 실패. 나중에 'ollama pull qwen2.5:3b' 실행 가능"
    fi
  fi
fi

# 6. 사용자 폴더
step "사용자 데이터 폴더 준비"
mkdir -p "$HOME/.youtube-capture"
ok "$HOME/.youtube-capture 준비 완료"

# 7. 최종
title "설치 완료"
echo ""
echo "  다음 단계:"
echo "  1. chrome://extensions/ 에서 확장 새로고침"
echo "  2. 옵션 페이지 → 헬퍼·CLI 연결 점검"
$WANT_OLLAMA && echo "  3. AI 공급자에서 'Ollama' 선택 → 저장"
echo "  4. YouTube에서 Cmd+Shift+S로 캡처 테스트"
echo ""
echo -e "${GRAY}  문제 발생 시: ~/.youtube-capture/helper.log 확인${RESET}"
echo ""
pause_exit 0
