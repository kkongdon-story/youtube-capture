// 팝업: 포맷별 캡처 버튼 + 설정 아이콘 + 단축키 안내
// 마지막 선택 포맷은 chrome.storage.local에 저장되어 다음 사용 시 강조 표시

const $ = (id) => document.getElementById(id);
const LAST_FORMAT_KEY = "lastUsedFormat";

function setStatus(text, kind = "ok") {
  const el = $("status");
  el.textContent = text;
  el.className = `status ${kind}`;
}

async function getActiveYouTubeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https:\/\/www\.youtube\.com\/watch/.test(tab.url)) return null;
  return tab;
}

async function triggerCapture(format) {
  const tab = await getActiveYouTubeTab();
  if (!tab) {
    setStatus("유튜브 영상 페이지에서만 사용 가능합니다.", "warn");
    return;
  }
  setStatus(`${format.toUpperCase()} 포맷으로 처리 중...`, "ok");
  await chrome.storage.local.set({ [LAST_FORMAT_KEY]: format });

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_CAPTURE", format });
    setStatus("작업이 시작되었습니다. 잠시 후 결과를 확인하세요.", "ok");
  } catch (e) {
    // content script 미주입 시 강제 주입 후 재시도
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/content.js"] });
      await chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_CAPTURE", format });
      setStatus("작업이 시작되었습니다.", "ok");
    } catch (e2) {
      setStatus(`오류: ${e2.message}`, "err");
    }
  }
}

// 포맷 버튼 이벤트 바인딩
document.querySelectorAll(".format-btn").forEach((btn) => {
  btn.addEventListener("click", () => triggerCapture(btn.dataset.fmt));
});

// 설정 아이콘
$("settingsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// 단축키 안내
$("shortcutLink").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

// 초기화: 단축키 표시 + 최근 사용 포맷 강조
(async () => {
  try {
    const cmds = await chrome.commands.getAll();
    const cap = cmds.find((c) => c.name === "capture");
    $("kbd").textContent = cap?.shortcut || "(미설정)";
  } catch {}

  try {
    const { [LAST_FORMAT_KEY]: last } = await chrome.storage.local.get(LAST_FORMAT_KEY);
    if (last) {
      const btn = document.querySelector(`.format-btn[data-fmt="${last}"]`);
      if (btn) btn.classList.add("recent");
    } else {
      // 기본 강조: md
      document.querySelector('.format-btn[data-fmt="md"]')?.classList.add("recent");
    }
  } catch {}
})();
