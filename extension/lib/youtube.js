// YouTube 페이지에서 메타데이터와 자막을 추출하는 순수 함수 모음.
// content.js에서만 호출되므로 페이지 컨텍스트에 접근 가능하다고 가정.

export function extractPlayerResponse() {
  // 1) window.ytInitialPlayerResponse (가장 신뢰)
  if (typeof ytInitialPlayerResponse !== "undefined" && ytInitialPlayerResponse) {
    return ytInitialPlayerResponse;
  }
  // 2) <script> 태그 안의 var ytInitialPlayerResponse = {...};
  const scripts = document.getElementsByTagName("script");
  for (const s of scripts) {
    const text = s.textContent || "";
    const m = text.match(/var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s);
    if (m) {
      try { return JSON.parse(m[1]); } catch {}
    }
  }
  return null;
}

export function extractMetadata(pr) {
  const vd = pr?.videoDetails || {};
  const mf = pr?.microformat?.playerMicroformatRenderer || {};
  const videoId = vd.videoId || new URLSearchParams(location.search).get("v") || "";

  return {
    videoId,
    title: vd.title || document.title.replace(/ - YouTube$/, ""),
    channel: vd.author || mf.ownerChannelName || "",
    channelId: vd.channelId || mf.externalChannelId || "",
    channelUrl: mf.ownerProfileUrl || (vd.channelId ? `https://www.youtube.com/channel/${vd.channelId}` : ""),
    url: `https://www.youtube.com/watch?v=${videoId}`,
    description: vd.shortDescription || mf.description?.simpleText || "",
    lengthSeconds: parseInt(vd.lengthSeconds || mf.lengthSeconds || "0", 10),
    publishedDate: mf.publishDate || mf.uploadDate || "",
    keywords: vd.keywords || mf.tags || [],
    thumbnail: pickBestThumbnail(vd.thumbnail?.thumbnails || []),
    viewCount: vd.viewCount || "",
    isLive: !!vd.isLive,
  };
}

function pickBestThumbnail(arr) {
  if (!arr.length) return "";
  return arr.reduce((best, t) => (t.width > (best.width || 0) ? t : best), {}).url || "";
}

export function getCaptionTracks(pr) {
  const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  return tracks.map((t) => ({
    baseUrl: t.baseUrl,
    languageCode: t.languageCode,
    name: t.name?.simpleText || t.name?.runs?.[0]?.text || t.languageCode,
    kind: t.kind || "manual", // "asr" 이면 자동생성
  }));
}

export function pickPreferredTrack(tracks, preferredLangs) {
  if (!tracks.length) return null;

  const score = (t) => {
    const langIdx = preferredLangs.findIndex(
      (l) => t.languageCode.toLowerCase().startsWith(l.toLowerCase())
    );
    const langScore = langIdx === -1 ? 999 : langIdx;
    const kindScore = t.kind === "asr" ? 1 : 0; // 사람 작성 우선
    return langScore * 10 + kindScore;
  };

  return [...tracks].sort((a, b) => score(a) - score(b))[0];
}

export async function fetchCaptions(track) {
  const url = `${track.baseUrl}&fmt=json3`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`자막 다운로드 실패: HTTP ${res.status}`);
  const json = await res.json();
  return parseJson3(json);
}

function parseJson3(json) {
  const events = json?.events || [];
  const lines = [];
  for (const ev of events) {
    if (!ev.segs) continue;
    const text = ev.segs.map((s) => s.utf8 || "").join("").replace(/\n/g, " ").trim();
    if (!text) continue;
    const startMs = ev.tStartMs || 0;
    lines.push({ startMs, text });
  }
  return lines;
}

export function formatTimestamp(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
