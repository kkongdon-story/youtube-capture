// 유튜브 watch 페이지 안에서 동작. 단축키 감지, 프레임 캡쳐, 사이드바 파싱.
// playerResponse는 background가 executeScript(world:MAIN)으로 직접 읽음.

(function () {
  const MARK = "__yt_capture_injected__";
  if (window[MARK]) return;
  window[MARK] = true;

  function captureFrame() {
    const video = document.querySelector("video.html5-main-video, video.video-stream") || document.querySelector("video");
    if (!video) return { ok: false, error: "비디오 요소를 찾지 못했습니다." };
    if (!video.videoWidth) return { ok: false, error: "영상이 아직 로드되지 않았습니다." };
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      return { ok: true, dataUrl: canvas.toDataURL("image/jpeg", 0.85), currentTime: video.currentTime || 0 };
    } catch (e) {
      return { ok: false, error: `프레임 캡쳐 실패 (DRM 영상일 수 있음): ${e.message}` };
    }
  }

  function getRelatedVideos(limit = 10) {
    const items = document.querySelectorAll("ytd-compact-video-renderer");
    const out = [];
    items.forEach((el, i) => {
      if (i >= limit) return;
      const a = el.querySelector("a#thumbnail");
      const titleEl = el.querySelector("#video-title");
      const channelEl = el.querySelector("ytd-channel-name a, .ytd-channel-name a");
      const metaEl = el.querySelector("#metadata-line");
      if (a && titleEl) {
        out.push({
          title: (titleEl.textContent || "").trim(),
          url: new URL(a.getAttribute("href") || "", location.origin).href,
          channel: (channelEl?.textContent || "").trim(),
          meta: (metaEl?.textContent || "").replace(/\s+/g, " ").trim(),
        });
      }
    });
    return out;
  }

  function doCapture(format) {
    notify("저장 중...", 999999);
    chrome.runtime.sendMessage(
      {
        type: "CAPTURE_VIDEO",
        pageUrl: location.href,
        relatedVideos: getRelatedVideos(),
        format: format || "md",
      },
      (resp) => {
        if (chrome.runtime.lastError) { notify(`오류: ${chrome.runtime.lastError.message}`); return; }
        if (resp?.ok) notify(`저장 완료: ${resp.filename || "(PDF 새 탭)"}`);
        else notify(`오류: ${resp?.error || "알 수 없음"}`);
      }
    );
  }

  function doFrameCapture() {
    const result = captureFrame();
    if (!result.ok) { notify(result.error); return; }
    notify("프레임 캡쳐 중...");
    chrome.runtime.sendMessage(
      {
        type: "CAPTURE_FRAME",
        videoId: new URLSearchParams(location.search).get("v"),
        currentTime: result.currentTime,
        dataUrl: result.dataUrl,
      },
      (resp) => {
        if (chrome.runtime.lastError) { notify(`오류: ${chrome.runtime.lastError.message}`); return; }
        if (resp?.ok) notify(`프레임 첨부됨`);
        else notify(`오류: ${resp?.error || "알 수 없음"}`);
      }
    );
  }

  function notify(text, durMs) {
    if (durMs == null) durMs = 3500;
    let el = document.getElementById("__ytcap_toast__");
    if (!el) {
      el = document.createElement("div");
      el.id = "__ytcap_toast__";
      el.style.cssText = [
        "position:fixed", "right:20px", "bottom:20px", "z-index:2147483647",
        "background:rgba(20,20,20,0.92)", "color:#fff", "padding:12px 16px",
        "border-radius:8px", "font:14px/1.4 system-ui,sans-serif", "max-width:360px",
        "box-shadow:0 6px 24px rgba(0,0,0,0.3)", "pointer-events:none",
        "transition:opacity .25s", "opacity:0",
      ].join(";");
      document.documentElement.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = "1";
    clearTimeout(notify._t);
    notify._t = setTimeout(() => { el.style.opacity = "0"; }, durMs);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "TRIGGER_CAPTURE") { doCapture(msg.format); sendResponse({ ok: true }); }
    else if (msg?.type === "TRIGGER_FRAME") { doFrameCapture(); sendResponse({ ok: true }); }
    else if (msg?.type === "TOAST") { notify(msg.text || "", msg.durMs); sendResponse({ ok: true }); }
    else if (msg?.type === "GET_VIDEO_INFO") {
      const v = document.querySelector("video");
      sendResponse({ ok: true, currentTime: v?.currentTime || 0, duration: v?.duration || 0 });
    } else if (msg?.type === "FETCH_URL") {
      // 페이지 쿠키로 URL을 fetch해서 텍스트 반환 (SW에서는 YouTube 인증 쿠키 없음)
      // credentials:'include' 로 YouTube 로그인 쿠키 포함 전송
      fetch(msg.url, { credentials: "include" })
        .then((r) => {
          if (!r.ok) {
            sendResponse({ ok: false, error: `HTTP ${r.status}`, status: r.status });
            return;
          }
          r.text().then((text) => sendResponse({ ok: true, text, len: text.length }));
        })
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true; // 비동기 응답을 위해 필수
    }
    return true;
  });
})();
