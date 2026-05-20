// Offscreen document: MV3 SW에서 직접 못 쓰는 navigator.mediaDevices·MediaRecorder를 사용해
// 탭 오디오를 녹음하고 background로 base64 오디오를 돌려준다.

let recorder = null;
let chunks = [];
let stream = null;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== "offscreen") return;

  if (msg.type === "START_RECORDING") {
    startRecording(msg.streamId, msg.maxSeconds || 600)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === "STOP_RECORDING") {
    stopRecording()
      .then((b64) => sendResponse({ ok: true, audioBase64: b64 }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});

async function startRecording(streamId, maxSeconds) {
  if (recorder) throw new Error("이미 녹음 중입니다.");
  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId },
    },
    video: false,
  });

  // 탭 오디오가 스피커로도 들리도록 (사용자가 영상 자체 들을 수 있게)
  const audioCtx = new AudioContext();
  const src = audioCtx.createMediaStreamSource(stream);
  src.connect(audioCtx.destination);

  chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.start(1000);

  setTimeout(() => {
    if (recorder && recorder.state !== "inactive") {
      // 자동 종료 (안전장치)
      recorder.stop();
    }
  }, maxSeconds * 1000);
}

function stopRecording() {
  return new Promise((resolve, reject) => {
    if (!recorder) return reject(new Error("녹음 중이 아닙니다."));
    const finish = async () => {
      try {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const buf = await blob.arrayBuffer();
        const b64 = arrayBufferToBase64(buf);
        // 정리
        try { stream?.getTracks().forEach((t) => t.stop()); } catch {}
        recorder = null; stream = null; chunks = [];
        resolve(b64);
      } catch (e) { reject(e); }
    };
    if (recorder.state === "inactive") finish();
    else { recorder.addEventListener("stop", finish, { once: true }); recorder.stop(); }
  });
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}
