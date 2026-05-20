#!/usr/bin/env node
// 크로스플랫폼 Native Messaging host 매니페스트 등록 스크립트.
// 사용법:
//   node install.mjs                       (등록)
//   node install.mjs --uninstall           (해제)
//   node install.mjs --extension-id <ID>   (확장 ID 명시)
//
// 환경변수:
//   YTC_EXTENSION_ID  - 기본 확장 ID 지정
//   YTC_HOST_PATH     - 헬퍼 실행 경로 명시 (없으면 자동 추정)

import { existsSync, mkdirSync, writeFileSync, unlinkSync, chmodSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HOST_NAME = "com.youtubecapture.bridge";
const DEFAULT_EXTENSION_IDS = [
  // manifest.json의 "key" 필드로 고정된 ID (배포 시 모든 사용자가 동일)
  "kjdgcjakmgocegklcnkanbpjigfajkal",
];

const args = process.argv.slice(2);
const uninstall = args.includes("--uninstall");
const idArg = args.indexOf("--extension-id");
const extensionId =
  (idArg !== -1 && args[idArg + 1]) ||
  process.env.YTC_EXTENSION_ID ||
  DEFAULT_EXTENSION_IDS[0];

if (!uninstall && !extensionId) {
  console.error(`
[YouTube Capture 헬퍼 설치]

확장 ID를 알려주세요. 다음 방법 중 하나:

1. chrome://extensions/ 페이지에서 "YouTube Capture" 카드의 ID 복사
2. 아래처럼 다시 실행:
     node install.mjs --extension-id <복사한_ID>

또는 YTC_EXTENSION_ID 환경변수 설정.
`);
  process.exit(1);
}

// 헬퍼 실행 경로 결정
// Chrome NM은 한글·공백 포함 경로에서 호스트 spawn 실패 사례가 있음.
// 안전 경로(~/.youtube-capture/helper-src/)로 항상 복사한 뒤 런처 생성.
const __dirname = dirname(fileURLToPath(import.meta.url));
const helperSrcOriginal = resolve(__dirname, "..", "src");
const helperEntry = stageHelperToSafePath(helperSrcOriginal);
const hostPath = process.env.YTC_HOST_PATH || makeLauncher(helperEntry);

const hostDir = hostDirectory();
const hostFile = join(hostDir, `${HOST_NAME}.json`);

if (uninstall) {
  try { if (existsSync(hostFile)) unlinkSync(hostFile); } catch {}
  if (platform() === "win32") regDelete();
  console.log(`✅ 제거 완료: ${hostFile}`);
  process.exit(0);
}

mkdirSync(hostDir, { recursive: true });
const manifest = {
  name: HOST_NAME,
  description: "YouTube Capture - bridges Chrome extension to local Codex/Claude CLIs",
  path: hostPath,
  type: "stdio",
  allowed_origins: [`chrome-extension://${extensionId}/`],
};
writeFileSync(hostFile, JSON.stringify(manifest, null, 2), "utf8");

if (platform() === "win32") regAdd(hostFile);

console.log(`✅ Native Messaging 호스트 등록 완료`);
console.log(`   매니페스트: ${hostFile}`);
console.log(`   실행 경로: ${hostPath}`);
console.log(`   허용 확장: chrome-extension://${extensionId}/`);

// ---------- helpers ----------

function hostDirectory() {
  const home = homedir();
  switch (platform()) {
    case "darwin":
      // Chrome / Chromium / Edge / Brave 모두 지원하려면 여러 경로 — 우선 Chrome만
      return join(home, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts");
    case "linux":
      return join(home, ".config", "google-chrome", "NativeMessagingHosts");
    case "win32":
      // Windows는 레지스트리 + 임의 경로의 JSON 사용
      return join(home, ".youtube-capture", "nm-host");
    default:
      throw new Error(`지원하지 않는 OS: ${platform()}`);
  }
}

// 헬퍼 소스를 안전 경로(~/.youtube-capture/helper-src/)로 복사.
// 한글·공백·OneDrive 경로 문제 회피.
function stageHelperToSafePath(srcDir) {
  const safeDir = join(homedir(), ".youtube-capture", "helper-src");
  mkdirSync(safeDir, { recursive: true });
  // helper/src/* 복사
  for (const f of readdirSync(srcDir)) {
    const sp = join(srcDir, f);
    if (statSync(sp).isFile()) copyFileSync(sp, join(safeDir, f));
  }
  // helper/package.json도 같이 복사 (ES module 인식용)
  const pkgPath = resolve(srcDir, "..", "package.json");
  if (existsSync(pkgPath)) copyFileSync(pkgPath, join(safeDir, "package.json"));
  return join(safeDir, "index.js");
}

function makeLauncher(entry) {
  // Chrome NM은 실행파일을 직접 호출. node 스크립트는 OS별 런처 파일이 필요.
  const launcherDir = join(homedir(), ".youtube-capture", "bin");
  mkdirSync(launcherDir, { recursive: true });

  if (platform() === "win32") {
    const bat = join(launcherDir, "youtube-capture-helper.cmd");
    writeFileSync(
      bat,
      `@echo off\r\nnode "${entry}" %*\r\n`,
      "utf8"
    );
    return bat;
  } else {
    const sh = join(launcherDir, "youtube-capture-helper");
    writeFileSync(
      sh,
      `#!/usr/bin/env bash\nexec node "${entry}" "$@"\n`,
      "utf8"
    );
    try { chmodSync(sh, 0o755); } catch {}
    return sh;
  }
}

function regAdd(jsonPath) {
  // HKCU\Software\Google\Chrome\NativeMessagingHosts\<host_name> (기본값) = <json 경로>
  const key = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`;
  const res = spawnSync("reg", ["add", key, "/ve", "/t", "REG_SZ", "/d", jsonPath, "/f"], { stdio: "inherit" });
  if (res.status !== 0) console.warn("⚠️  레지스트리 등록에 실패했을 수 있습니다.");
}

function regDelete() {
  const key = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`;
  spawnSync("reg", ["delete", key, "/f"], { stdio: "ignore" });
}
