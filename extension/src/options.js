// 옵션 페이지 로직

const $ = (id) => document.getElementById(id);

// SETTING_DEFAULTS는 config.js에서 관리 — 중앙 Single Source of Truth
// options.js는 로컬 참조용 사본 (ES module import 불가한 options 페이지 대응)
const DEFAULTS = {
  preferredLangs: ["ko", "en"],
  filenamePattern: "{channel}/{date}_{title}",
  aiProvider: "none",
  ollamaModel: "qwen2.5:3b",
  claudeModel: "",
  summaryLanguage: "ko",
  enablePolish: true,
  enableSummary: true,
  enableAutoCleanup: true,
  enablePythonHook: false,
  userDictionary: {},
  enableSTT: false,
  sttLanguage: "ko",
  sttMaxSeconds: 600,
  licenseKey: "",
  premiumAutoClassify: false,
  premiumIncludeRelated: false,
};

// ───── 사용자 사전 (textarea ↔ object) ─────
function dictToText(dict) {
  return Object.entries(dict || {}).map(([k, v]) => `${k}=${v}`).join("\n");
}

function textToDict(text) {
  const out = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}

// ───── 라이선스 ─────
function validateLicense(key) {
  if (!key) return false;
  const m = String(key).trim().match(/^YTC-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})$/);
  if (!m) return false;
  const all = m[1] + m[2] + m[3];
  let sum = 0;
  for (let i = 0; i < all.length - 1; i++) sum ^= all.charCodeAt(i);
  return (sum % 36).toString(36).toUpperCase() === all[all.length - 1];
}

function generateTrialKey() {
  const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const rnd = (n) => Array.from({ length: n }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("");
  for (let i = 0; i < 200; i++) {
    const a = rnd(4), b = rnd(4), partial = a + b + rnd(3);
    let sum = 0;
    for (let j = 0; j < partial.length; j++) sum ^= partial.charCodeAt(j);
    const c = partial.slice(8) + (sum % 36).toString(36).toUpperCase();
    const key = `YTC-${a}-${b}-${c}`;
    if (validateLicense(key)) return key;
  }
  return null;
}

function updateLicenseStatus() {
  const v = $("licenseKey").value;
  const el = $("licenseStatus");
  if (!v) { el.textContent = "미인증 상태"; el.style.color = ""; return; }
  if (validateLicense(v)) { el.textContent = "✅ 인증 완료 — 프리미엄 기능 활성"; el.style.color = "#186a3b"; }
  else { el.textContent = "❌ 잘못된 키 형식"; el.style.color = "#9b1c1c"; }
}

// ───── 언어 체크박스 ─────
function updateLangPreview() {
  const checked = [...document.querySelectorAll("#langGrid input:checked")].map((c) => c.value);
  const el = $("langPreview");
  el.textContent = checked.length
    ? "적용 순서: " + checked.join(" → ")
    : "⚠️ 언어를 하나 이상 선택하세요.";
}

function updateLangChipStyle() {
  document.querySelectorAll(".lang-chip").forEach((chip) => {
    chip.classList.toggle("checked", chip.querySelector("input").checked);
  });
  updateLangPreview();
}

// ───── 파일명 프리셋 ─────
function updatePatternCustomVisibility() {
  const selected = document.querySelector("input[name=patternPreset]:checked")?.value;
  $("patternCustomWrap").style.display = selected === "custom" ? "block" : "none";
}

function selectPatternPreset(value) {
  const radio = document.querySelector(`input[name="patternPreset"][value="${value}"]`);
  if (radio) {
    radio.checked = true;
  } else {
    document.querySelector('input[name="patternPreset"][value="custom"]').checked = true;
    $("pattern").value = value;
  }
  updatePatternCustomVisibility();
}

function getPatternValue() {
  const sel = document.querySelector("input[name=patternPreset]:checked")?.value;
  if (sel === "custom") return $("pattern").value.trim() || DEFAULTS.filenamePattern;
  return sel || DEFAULTS.filenamePattern;
}

// ───── 헬퍼 상태 박스 안전 렌더 ─────
function renderHealthOk(r) {
  const box = $("health");
  box.className = "status ok";
  box.textContent = "";
  const cli = r.cli || {};
  const text = [
    `헬퍼: v${r.version || "?"}`,
    `Codex: ${cli.codex ? "✅" : "✗ 미설치"}`,
    `Claude: ${cli.claude ? "✅" : "✗ 미설치"}`,
    `Whisper: ${cli.whisper ? "✅" : "✗ (STT 미사용 시 불필요)"}`,
  ].join("  ·  ");
  box.textContent = text;
}

function renderHealthNotInstalled(extId) {
  const box = $("health");
  box.className = "status err";
  box.textContent = "";

  const addLine = (text) => {
    const p = document.createElement("div");
    p.textContent = text;
    box.appendChild(p);
  };
  const addCode = (text) => {
    const p = document.createElement("div");
    const c = document.createElement("code");
    c.style.cssText = "background:#f8d7da;padding:4px 8px;border-radius:4px;display:block;margin:4px 0;word-break:break-all;user-select:all;cursor:pointer";
    c.textContent = text;
    c.title = "클릭하여 복사";
    c.addEventListener("click", () => navigator.clipboard.writeText(text).catch(() => {}));
    p.appendChild(c);
    box.appendChild(p);
  };
  const addLink = (text, onClick) => {
    const p = document.createElement("div");
    const a = document.createElement("a");
    a.textContent = text;
    a.href = "#";
    a.style.marginTop = "4px";
    a.addEventListener("click", (e) => { e.preventDefault(); onClick(); });
    p.appendChild(a);
    box.appendChild(p);
  };

  addLine("헬퍼가 설치되지 않았습니다. 터미널(PowerShell)에서 아래 명령을 실행해 주세요:");
  addCode(`node helper/manifest/install.mjs --extension-id ${extId}`);
  addLine(`확장 ID: ${extId} (위 명령을 클릭하면 복사됩니다)`);
  addLink("설치 가이드 열기", () => chrome.tabs.create({ url: chrome.runtime.getURL("docs/install.html") }));
}

// ───── load / save ─────
async function load() {
  const s = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const m = { ...DEFAULTS, ...s };

  selectPatternPreset(m.filenamePattern);

  const preferred = Array.isArray(m.preferredLangs) ? m.preferredLangs : DEFAULTS.preferredLangs;
  document.querySelectorAll("#langGrid input").forEach((cb) => {
    cb.checked = preferred.includes(cb.value);
  });
  updateLangChipStyle();

  document.querySelector(`input[name=ai][value="${m.aiProvider}"]`).checked = true;
  if ($("ollamaModel")) $("ollamaModel").value = m.ollamaModel || "qwen2.5:3b";
  if ($("claudeModel")) $("claudeModel").value = m.claudeModel || "";
  $("summaryLang").value = m.summaryLanguage;
  if ($("enablePolish")) $("enablePolish").checked = !!m.enablePolish;
  if ($("enableSummary")) $("enableSummary").checked = !!m.enableSummary;
  if ($("enableAutoCleanup")) $("enableAutoCleanup").checked = m.enableAutoCleanup !== false;
  if ($("enablePythonHook")) $("enablePythonHook").checked = !!m.enablePythonHook;
  if ($("userDictionary")) $("userDictionary").value = dictToText(m.userDictionary || {});
  $("enableSTT").checked = !!m.enableSTT;
  $("sttLanguage").value = m.sttLanguage;
  $("sttMaxSeconds").value = m.sttMaxSeconds;
  $("licenseKey").value = m.licenseKey;
  $("premiumAutoClassify").checked = !!m.premiumAutoClassify;
  $("premiumIncludeRelated").checked = !!m.premiumIncludeRelated;
  updateLicenseStatus();
}

async function save() {
  const langs = [...document.querySelectorAll("#langGrid input:checked")].map((c) => c.value);
  const ai = document.querySelector("input[name=ai]:checked")?.value || "none";
  await chrome.storage.local.set({
    filenamePattern: getPatternValue(),
    preferredLangs: langs.length ? langs : DEFAULTS.preferredLangs,
    aiProvider: ai,
    ollamaModel: $("ollamaModel")?.value.trim() || DEFAULTS.ollamaModel,
    claudeModel: $("claudeModel")?.value.trim() || "",
    summaryLanguage: $("summaryLang").value.trim() || DEFAULTS.summaryLanguage,
    enablePolish: $("enablePolish")?.checked ?? DEFAULTS.enablePolish,
    enableSummary: $("enableSummary")?.checked ?? DEFAULTS.enableSummary,
    enableAutoCleanup: $("enableAutoCleanup")?.checked ?? DEFAULTS.enableAutoCleanup,
    enablePythonHook: $("enablePythonHook")?.checked ?? DEFAULTS.enablePythonHook,
    userDictionary: $("userDictionary") ? textToDict($("userDictionary").value) : DEFAULTS.userDictionary,
    enableSTT: $("enableSTT").checked,
    sttLanguage: $("sttLanguage").value.trim() || DEFAULTS.sttLanguage,
    sttMaxSeconds: parseInt($("sttMaxSeconds").value, 10) || DEFAULTS.sttMaxSeconds,
    licenseKey: $("licenseKey").value.trim(),
    premiumAutoClassify: $("premiumAutoClassify").checked,
    premiumIncludeRelated: $("premiumIncludeRelated").checked,
  });
  const saved = $("saved");
  saved.classList.add("show");
  setTimeout(() => saved.classList.remove("show"), 1400);
}

// ───── 이벤트 ─────
// 시작하기 단계 상태 갱신
function markStep(stepNum, done) {
  const el = document.querySelector(`.step[data-step="${stepNum}"]`);
  if (!el) return;
  el.classList.toggle("done", !!done);
}
function updateOnboardingBadge() {
  const total = document.querySelectorAll(".step").length;
  const doneN = document.querySelectorAll(".step.done").length;
  const badge = $("onboardingStatus");
  if (!badge) return;
  if (doneN >= total) {
    badge.textContent = "✓ 준비 완료";
    badge.style.background = "#DBFCE7";
    badge.style.color = "#166534";
  } else {
    badge.textContent = `${doneN}/${total} 완료`;
  }
}

$("healthBtn").addEventListener("click", async () => {
  const box = $("health");
  box.style.display = "block";
  box.className = "status";
  box.textContent = "점검 중...";
  try {
    const res = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "HEALTH_CHECK" }, (r) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        resolve(r);
      });
    });
    if (!res.ok) throw new Error(res.error);
    renderHealthOk(res.result || {});
    // 시작하기 단계 자동 체크
    markStep(2, true); // 헬퍼 응답 = step2 완료
    const cli = res.result?.cli || {};
    markStep(3, !!cli.ollama);
    // step4(모델) 확인: ollama list로 별도 체크 필요. 우선 step3 OK면 step4도 추정
    // TODO: 모델 점검을 위한 별도 API 호출
    if (cli.ollama) markStep(4, true);
    // step5: 첫 캡처 — 사용자가 한 번 캡처하면 lastCapture 저장됨, 여기선 자동 체크 안 함
    updateOnboardingBadge();
  } catch (e) {
    const msg = e.message || "";
    const isNotFound = msg.includes("not found") || msg.includes("not installed") || msg.includes("Cannot connect") || msg.includes("Specified native");
    if (isNotFound) {
      renderHealthNotInstalled(chrome.runtime.id);
      markStep(2, false);
    } else {
      const box2 = $("health");
      box2.className = "status err";
      box2.textContent = `점검 실패: ${msg}`;
    }
  }
});

// 명령 복사 버튼
$("copyPullCmd")?.addEventListener("click", async (e) => {
  e.preventDefault();
  try {
    await navigator.clipboard.writeText("ollama pull qwen2.5:3b");
    const a = e.currentTarget;
    const orig = a.textContent;
    a.textContent = "복사됨 ✓";
    setTimeout(() => { a.textContent = orig; }, 1500);
  } catch {}
});

// "설치 가이드" 단계 링크
$("openInstallGuide")?.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL("docs/install.html") });
});

// 기술 정보 페이지
$("techGuide")?.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL("docs/technical.html") });
});

$("saveBtn").addEventListener("click", save);
$("shortcutBtn").addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));
$("installGuide").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL("docs/install.html") });
});
$("licenseKey").addEventListener("input", updateLicenseStatus);
$("trialKey").addEventListener("click", (e) => {
  e.preventDefault();
  const k = generateTrialKey();
  if (k) { $("licenseKey").value = k; updateLicenseStatus(); }
});

document.querySelectorAll("input[name=patternPreset]").forEach((r) => {
  r.addEventListener("change", updatePatternCustomVisibility);
});

document.querySelectorAll("#langGrid input").forEach((cb) => {
  cb.addEventListener("change", updateLangChipStyle);
});

load();
