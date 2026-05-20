#!/usr/bin/env node
// Chrome Native Messaging 호스트.
// stdio 길이-프리픽스 프로토콜: 4바이트 LE uint32 길이 + UTF-8 JSON.
// 의존성 0개 — Node stdlib만 사용.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { appendFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";

const VERSION = "0.1.0";
const ALLOWED_ACTIONS = new Set(["health", "summarize", "transcribe", "pythonHook"]);
const ALLOWED_PROVIDERS = new Set(["codex", "claude", "ollama"]);
const MAX_MESSAGE_BYTES = 64 * 1024 * 1024; // 64 MB (오디오 전송 허용)

// ---------- 로깅 (에러만, 토큰 절대 X) ----------
const LOG_DIR = join(homedir(), ".youtube-capture");
try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}
const LOG_FILE = join(LOG_DIR, "helper.log");

function logErr(msg, extra) {
  try {
    const line = `[${new Date().toISOString()}] ${msg}${extra ? " " + JSON.stringify(extra) : ""}\n`;
    appendFileSync(LOG_FILE, line);
  } catch {}
}

process.on("uncaughtException", (e) => { logErr("uncaughtException", { e: String(e), stack: e.stack }); });
process.on("unhandledRejection", (e) => { logErr("unhandledRejection", { e: String(e) }); });

// ---------- NM stdio 프로토콜 ----------
function writeMessage(obj) {
  const json = Buffer.from(JSON.stringify(obj), "utf8");
  if (json.length > MAX_MESSAGE_BYTES) {
    logErr("outgoing message too large", { len: json.length });
    return;
  }
  const len = Buffer.alloc(4);
  len.writeUInt32LE(json.length, 0);
  process.stdout.write(Buffer.concat([len, json]));
}

let stdinBuf = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  stdinBuf = Buffer.concat([stdinBuf, chunk]);
  while (stdinBuf.length >= 4) {
    const len = stdinBuf.readUInt32LE(0);
    if (len > MAX_MESSAGE_BYTES) {
      logErr("incoming message too large, terminating", { len });
      process.exit(1);
    }
    if (stdinBuf.length < 4 + len) break;
    const body = stdinBuf.slice(4, 4 + len).toString("utf8");
    stdinBuf = stdinBuf.slice(4 + len);
    let msg;
    try { msg = JSON.parse(body); } catch (e) {
      logErr("invalid JSON message", { e: String(e) });
      continue;
    }
    handleMessage(msg).catch((e) => {
      logErr("handler crashed", { e: String(e) });
      writeMessage({ id: msg?.id || "?", type: "error", error: String(e) });
    });
  }
});

process.stdin.on("end", () => process.exit(0));

// ---------- 메시지 핸들러 ----------
async function handleMessage(msg) {
  const id = typeof msg.id === "string" ? msg.id : "?";
  const action = msg.action;
  if (!ALLOWED_ACTIONS.has(action)) {
    writeMessage({ id, type: "error", error: `허용되지 않은 action: ${action}` });
    return;
  }
  if (action === "health") {
    writeMessage({
      id,
      type: "done",
      result: {
        version: VERSION,
        platform: platform(),
        node: process.version,
        cli: {
          codex: locateCli("codex"),
          claude: locateCli("claude"),
          ollama: locateCli("ollama"),
          whisper: locateCli("whisper"),
        },
      },
    });
    return;
  }
  if (action === "summarize") {
    await runSummarize(id, msg);
    return;
  }
  if (action === "transcribe") {
    await runTranscribe(id, msg);
    return;
  }
  if (action === "pythonHook") {
    await runPythonHook(id, msg);
    return;
  }
}

// ---------- Python 커스텀 hook ----------
// ~/.youtube-capture/transcript_hook.py를 호출 (없으면 noop)
// stdin: {segments:[{startMs,text}], meta:{...}, captionLang}
// stdout: {segments:[{startMs,text}]} 또는 동일 형식
async function runPythonHook(id, msg) {
  const hookPath = join(homedir(), ".youtube-capture", "transcript_hook.py");
  if (!existsSync(hookPath)) {
    writeMessage({ id, type: "done", result: { skipped: true, reason: "hook 스크립트가 없습니다" } });
    return;
  }
  const pythonBin = locatePython();
  if (!pythonBin) {
    writeMessage({ id, type: "error", error: "Python을 찾지 못했습니다. PATH에 python 또는 python3 필요" });
    return;
  }
  const payload = JSON.stringify({
    segments: Array.isArray(msg.segments) ? msg.segments : [],
    meta: msg.meta || {},
    captionLang: msg.captionLang || "",
  });
  let child;
  try {
    child = spawn(pythonBin, [hookPath], { stdio: ["pipe", "pipe", "pipe"], shell: false, windowsHide: true });
  } catch (e) {
    writeMessage({ id, type: "error", error: `Python 실행 실패: ${e.message}` });
    return;
  }
  let stdoutBuf = "", stderrBuf = "";
  const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 60000);
  child.stdout.on("data", (b) => { stdoutBuf += b.toString("utf8"); });
  child.stderr.on("data", (b) => { stderrBuf += b.toString("utf8"); });
  child.on("close", (code) => {
    clearTimeout(timer);
    if (code !== 0) {
      writeMessage({ id, type: "error", error: `hook 실패 (${code}): ${stderrBuf.slice(0, 400).trim()}` });
      return;
    }
    let parsed;
    try { parsed = JSON.parse(stdoutBuf); }
    catch (e) {
      writeMessage({ id, type: "error", error: `hook 출력 JSON 파싱 실패: ${e.message}` });
      return;
    }
    writeMessage({ id, type: "done", result: parsed });
  });
  child.on("error", (e) => {
    clearTimeout(timer);
    writeMessage({ id, type: "error", error: `Python 오류: ${e.message}` });
  });
  try { child.stdin.write(payload); child.stdin.end(); }
  catch (e) { writeMessage({ id, type: "error", error: `hook 입력 쓰기 실패: ${e.message}` }); }
}

function locatePython() {
  // PATH의 python3 우선, 없으면 python
  for (const cmd of ["python3", "python"]) {
    const p = locateCli(cmd);
    if (p) return p;
  }
  return null;
}

// ---------- STT via OpenAI Whisper CLI ----------
async function runTranscribe(id, msg) {
  const audioBase64 = typeof msg.audioBase64 === "string" ? msg.audioBase64 : "";
  const language = typeof msg.language === "string" ? msg.language : "en";
  const format = (msg.format || "webm").replace(/[^a-z0-9]/gi, "");
  if (!audioBase64) {
    writeMessage({ id, type: "error", error: "오디오 데이터가 비어있습니다." });
    return;
  }
  const whisperPath = locateCli("whisper");
  if (!whisperPath) {
    writeMessage({
      id, type: "error",
      error: "Whisper CLI를 찾지 못했습니다. 설치: 'pip install -U openai-whisper' (ffmpeg 필요)",
    });
    return;
  }

  // 임시 파일에 오디오 저장
  const tmpDir = join(homedir(), ".youtube-capture", "tmp");
  try { mkdirSync(tmpDir, { recursive: true }); } catch {}
  const tag = randomBytes(6).toString("hex");
  const audioPath = join(tmpDir, `audio-${tag}.${format}`);
  try {
    writeFileSync(audioPath, Buffer.from(audioBase64, "base64"));
  } catch (e) {
    writeMessage({ id, type: "error", error: `임시 파일 쓰기 실패: ${e.message}` });
    return;
  }

  const args = [
    audioPath,
    "--model", "small",
    "--language", language,
    "--output_dir", tmpDir,
    "--output_format", "srt",
    "--fp16", "False",
  ];

  let child;
  try {
    child = spawn(whisperPath, args, { stdio: ["ignore", "pipe", "pipe"], shell: false, windowsHide: true });
  } catch (e) {
    try { unlinkSync(audioPath); } catch {}
    writeMessage({ id, type: "error", error: `Whisper 실행 실패: ${e.message}` });
    return;
  }

  let stderrBuf = "";
  const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 540000);

  child.stdout.on("data", () => {}); // whisper의 진행 출력 무시
  child.stderr.on("data", (b) => { stderrBuf += b.toString("utf8"); });
  child.on("close", (code) => {
    clearTimeout(timer);
    if (code !== 0) {
      try { unlinkSync(audioPath); } catch {}
      writeMessage({ id, type: "error", error: stderrBuf.slice(0, 800).trim() || `Whisper 비정상 종료 (${code})` });
      return;
    }
    // SRT 파일 읽기
    const srtPath = audioPath.replace(/\.[^.]+$/, ".srt");
    let srt = "";
    try { srt = readFileSync(srtPath, "utf8"); } catch {}
    try { unlinkSync(audioPath); } catch {}
    try { unlinkSync(srtPath); } catch {}
    writeMessage({ id, type: "chunk", data: srt });
    writeMessage({ id, type: "done", result: { format: "srt" } });
  });
  child.on("error", (e) => {
    clearTimeout(timer);
    try { unlinkSync(audioPath); } catch {}
    writeMessage({ id, type: "error", error: `Whisper 오류: ${e.message}` });
  });
}

// ---------- CLI 위치 탐색 ----------
// ANSI escape 시퀀스 제거 — \x1b[로 시작하는 모든 터미널 컨트롤 코드 + 단독 BEL/CR
// 주의: \r (CR) 을 빈 문자열이 아니라 공백으로 교체해야 단어가 붙지 않음.
// Ollama CLI는 파이프(non-TTY) 환경에서도 \r\x1b[2K 패턴으로 토큰을 스트리밍함.
// ANSI 제거 후 남은 \r 을 공백으로 바꿔야 "Hello\rWorld" → "Hello World" 로 보존됨.
function stripAnsi(s) {
  return String(s || "")
    // \r\n (Windows 줄끝) → \n 으로 정규화 (먼저 처리)
    .replace(/\r\n/g, "\n")
    // CSI sequences: ESC [ ... letter  (예: \x1b[2K, \x1b[1D)
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
    // OSC sequences: ESC ] ... BEL or ESC \
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "")
    // 기타 ESC + 1글자
    .replace(/\x1b[@-Z\\-_]/g, "")
    // 단독 \r (스피너·덮어쓰기) → 공백으로 (빈 문자열로 제거하면 단어 붙음)
    .replace(/\r/g, " ")
    // 단독 BEL
    .replace(/\x07/g, "")
    // ANSI 제거 후 연속 공백 정리 (단, 줄바꿈은 유지)
    .replace(/[^\S\n]{2,}/g, " ");
}

// Codex/외부 CLI가 stdout에 출력하는 프로세스 정리 메시지 필터링
// 패턴 1: "SUCCESS: The process with PID 1234 (child process of PID 5678) has been terminated."
// 패턴 2: 한국어 Windows CP949 → UTF-8 잘못 디코딩 버전 (◆ 등 대체문자 포함)
//         공통 특징: 같은 줄에 "PID <숫자>"가 2번 이상 등장
function stripCodexCleanup(s) {
  return s
    // 영문 패턴: SUCCESS/FAILED/WARNING: The process with PID ... terminated.
    .replace(/[^\n]*(SUCCESS|FAILED|WARNING|ERROR):\s+The process with PID[^\n]*/gi, "")
    // 같은 줄에 PID \d+가 두 번 이상 나오는 줄 (로컬라이즈/인코딩 오염 버전 포함)
    .replace(/[^\n]*\bPID[ \t]*\d+[^\n]*\bPID[ \t]*\d+[^\n]*/g, "")
    // 정리 후 3개 이상 연속 빈 줄 → 빈 줄 1개로
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function locateCli(name) {
  const exe = platform() === "win32" ? `${name}.cmd` : name;
  const exeAlt = platform() === "win32" ? `${name}.exe` : null;
  const tries = [];

  // PATH
  const pathEnv = (process.env.PATH || "").split(platform() === "win32" ? ";" : ":");
  for (const dir of pathEnv) {
    if (!dir) continue;
    tries.push(join(dir, exe));
    if (exeAlt) tries.push(join(dir, exeAlt));
    tries.push(join(dir, name));
  }
  // npm 전역 표준 위치
  const home = homedir();
  if (platform() === "win32") {
    tries.push(join(process.env.APPDATA || join(home, "AppData/Roaming"), "npm", `${name}.cmd`));
  } else {
    tries.push(join(home, ".npm-global", "bin", name));
    tries.push("/usr/local/bin/" + name);
    tries.push("/opt/homebrew/bin/" + name);
  }

  // 도구별 일반 설치 경로 (PATH 갱신 안 된 경우 대비)
  if (name === "ollama") {
    if (platform() === "win32") {
      const local = process.env.LOCALAPPDATA || join(home, "AppData/Local");
      tries.push(join(local, "Programs/Ollama/ollama.exe"));
      tries.push(join(local, "Ollama/ollama.exe"));
      tries.push(join(process.env.ProgramFiles || "C:/Program Files", "Ollama/ollama.exe"));
    } else if (platform() === "darwin") {
      tries.push("/Applications/Ollama.app/Contents/Resources/ollama");
      tries.push("/opt/homebrew/bin/ollama");
    }
  } else if (name === "claude" && platform() === "win32") {
    tries.push(join(home, ".local/bin/claude.exe"));
  }

  for (const p of tries) {
    try { if (existsSync(p)) return p; } catch {}
  }
  return null;
}

// ---------- summarize 실행 ----------
function runSummarize(id, msg) {
  return new Promise((resolve) => {
    const provider = msg.provider;
    const prompt = typeof msg.prompt === "string" ? msg.prompt : "";

    if (!ALLOWED_PROVIDERS.has(provider)) {
      writeMessage({ id, type: "error", error: `허용되지 않은 provider: ${provider}` });
      return resolve();
    }
    if (!prompt || prompt.length > 200000) {
      writeMessage({ id, type: "error", error: "프롬프트가 비었거나 너무 깁니다." });
      return resolve();
    }

    const cliPath = locateCli(provider);
    if (!cliPath) {
      const installHint = provider === "ollama"
        ? "Ollama 미설치. https://ollama.com/download 에서 설치 후 'ollama pull qwen2.5:3b' 실행"
        : `${provider} CLI를 찾지 못했습니다. 설치 후 'codex login' 또는 'claude login'을 실행하세요.`;
      writeMessage({ id, type: "error", error: installHint });
      return resolve();
    }

    const ollamaModel = (typeof msg.ollamaModel === "string" && msg.ollamaModel) || "qwen2.5:3b";

    // Ollama: 모델 사전 점검 — 없으면 명확한 에러 (자동 pull은 시간 너무 오래 걸려 UX 망함)
    if (provider === "ollama") {
      const listRes = spawnSync(cliPath, ["list"], { encoding: "utf8", windowsHide: true, timeout: 8000 });
      const modelExists = listRes.status === 0 && listRes.stdout && listRes.stdout.includes(ollamaModel);
      if (!modelExists) {
        writeMessage({
          id, type: "error",
          error: `Ollama 모델 '${ollamaModel}'이 설치되지 않았습니다. 터미널에서 실행: ollama pull ${ollamaModel}`
        });
        return resolve();
      }
    }

    // 모델별 CLI 인자
    let args;
    if (provider === "codex") {
      // codex exec: stdin으로 프롬프트 받음 (- 마커)
      args = ["exec", "--skip-git-repo-check", "-"];
    } else if (provider === "claude") {
      // Claude Code: agent 루프 차단 + 모델 선택. 기본은 sonnet, haiku로 5~10배 가속
      args = ["-p", "--output-format", "text", "--max-turns", "1"];
      const claudeModel = (typeof msg.claudeModel === "string" && msg.claudeModel.trim()) || "claude-haiku-4-5-20251001";
      args.push("--model", claudeModel);
    } else /* ollama */ {
      args = ["run", ollamaModel, "--"];
    }

    // Windows: .cmd/.bat 실행파일은 shell 없이 spawn 불가 → shell:true 필요
    // args는 우리가 제어하는 고정값 + claudeModel(검증된 식별자)뿐이라 인젝션 위험 없음
    // 사용자 프롬프트는 stdin으로 전달되므로 shell 모드와 무관
    const needsShell = platform() === "win32" && /\.(cmd|bat)$/i.test(cliPath);
    let child;
    try {
      child = spawn(cliPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: needsShell,
        windowsHide: true,
      });
    } catch (e) {
      writeMessage({ id, type: "error", error: `CLI 실행 실패: ${e.message}` });
      return resolve();
    }

    let stderrBuf = "";
    // Ollama는 파이프(non-TTY)에서도 \r\x1b[K 덮어쓰기 스트리밍을 사용.
    // 청크 단위로 처리하면 공백이 증발하고 중간 상태가 누적됨.
    // → stdout 전체를 버퍼링 후 close 시 한 번에 처리.
    // Claude/Codex는 청크 스트리밍해도 안전하지만 통일성을 위해 동일 경로 사용.
    let stdoutRaw = Buffer.alloc(0);

    // 청크 단위 병렬 처리 도입으로 청크당 입력이 3,000자 이하.
    // 이전 110s 타임아웃(전체 자막 단일 호출 기준)을 60s로 단축.
    // 청크가 60s 내에 안 끝나면 잘못된 것 → 조기 실패 후 fallback(원본 유지)이 더 낫다.
    const killTimer = setTimeout(() => {
      try { child.kill("SIGTERM"); } catch {}
      setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 2000);
    }, 60000);

    child.stdout.on("data", (buf) => { stdoutRaw = Buffer.concat([stdoutRaw, buf]); });
    child.stderr.on("data", (buf) => { stderrBuf += buf.toString("utf8"); });
    child.on("error", (e) => {
      clearTimeout(killTimer);
      writeMessage({ id, type: "error", error: `CLI 오류: ${e.message}` });
      resolve();
    });
    child.on("close", (code) => {
      clearTimeout(killTimer);
      if (code === 0) {
        // stdout 전체를 한 번에 처리:
        // 1) CR 기반 덮어쓰기 해석: 각 "\n" 줄 내에서 마지막 "\r" 이후 부분만 취함
        // 2) ANSI 제거 → Codex 정리 메시지 제거
        const rawText = stdoutRaw.toString("utf8");
        const crResolved = rawText
          .split("\n")
          .map((line) => {
            // 줄 안에 \r 이 있으면 마지막 \r 이후만 취함 (터미널 덮어쓰기 의미)
            const parts = line.split("\r");
            return parts[parts.length - 1];
          })
          .join("\n");
        const cleaned = stripCodexCleanup(stripAnsi(crResolved));
        if (cleaned) writeMessage({ id, type: "chunk", data: cleaned });
        writeMessage({ id, type: "done", result: { provider, exitCode: 0 } });
      } else {
        const errMsg = stderrBuf.slice(0, 800).trim() || `CLI 비정상 종료 (code=${code})`;
        writeMessage({ id, type: "error", error: errMsg });
      }
      resolve();
    });

    // 프롬프트를 stdin으로 전달 (인자에 직접 박지 않아 안전)
    try { child.stdin.end(prompt, "utf8"); }
    catch (e) {
      writeMessage({ id, type: "error", error: `stdin 쓰기 실패: ${e.message}` });
      resolve();
    }
  });
}
