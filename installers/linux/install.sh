#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "============================================================"
echo " YouTube Capture - 헬퍼 설치 (Linux)"
echo "============================================================"

if ! command -v node >/dev/null 2>&1; then
  echo "[오류] Node.js가 설치되어 있지 않습니다. 패키지 매니저로 설치 후 재실행하세요."
  exit 1
fi
echo " Node.js: $(node -v)  ✓"
echo

echo " chrome://extensions 에서 확장 ID 복사 후 붙여넣으세요."
read -p "확장 ID 입력: " EXT_ID
[ -z "$EXT_ID" ] && { echo "[오류] 확장 ID가 비어 있습니다."; exit 1; }

node "$(pwd)/../../helper/manifest/install.mjs" --extension-id "$EXT_ID"

echo
echo " ✅ 헬퍼 설치 완료!"
echo "    AI를 쓰려면: npm install -g @openai/codex (또는 @anthropic-ai/claude-code) 후 login"
