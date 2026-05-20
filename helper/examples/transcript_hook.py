#!/usr/bin/env python3
"""
YouTube Capture — 자막 커스텀 정리 hook (예시).

설치:
  이 파일을 다음 위치에 복사:
    Windows: %USERPROFILE%\.youtube-capture\transcript_hook.py
    macOS/Linux: ~/.youtube-capture/transcript_hook.py
  옵션 페이지에서 "Python 커스텀 hook 사용" 켜기

프로토콜:
  stdin (JSON):
    {
      "segments": [{"startMs": 0, "text": "..."}, ...],
      "meta":     {"title": "...", "channel": "...", "videoId": "..."},
      "captionLang": "ko"
    }
  stdout (JSON):
    {"segments": [{"startMs": 0, "text": "..."}, ...]}

원하면 외부 라이브러리(KoNLPy, deepmultilingualpunctuation, ollama 클라이언트 등) 자유롭게 사용 가능.
시간 제한: 60초.
"""

import json
import re
import sys


# 도메인별 사용자 사전 — 본인 영상 주제에 맞게 추가하세요
DOMAIN_DICT = {
    # 예: 군대 관련 영상
    "취사뱅": "취사병",
    "행보광": "행보관",
    "관씸병": "관심병",

    # 예: 영화 리뷰 영상
    "엔딩 크레딧": "엔딩 크레딧",
    "결말부": "결말 부분",

    # 본인이 자주 보는 도메인 단어 추가
}


# 영상 제목/채널에 따라 동적으로 적용할 사전을 고를 수도 있음
def get_dict_for_context(meta):
    title = (meta.get("title") or "").lower()
    channel = (meta.get("channel") or "").lower()
    dict_out = dict(DOMAIN_DICT)
    if "취사병" in title or "군대" in title:
        dict_out.update({
            # 군대 특화
            "디박": "디비",
            "휴개념": "휴게실",
        })
    return dict_out


def apply_dict(text, d):
    for bad, good in d.items():
        if bad:
            text = re.sub(re.escape(bad), good, text)
    return text


def main():
    data = json.load(sys.stdin)
    segments = data.get("segments", [])
    meta = data.get("meta", {})

    dict_to_apply = get_dict_for_context(meta)

    out = []
    for seg in segments:
        text = seg.get("text", "")
        text = apply_dict(text, dict_to_apply)
        # 추가 정리 규칙을 여기에...
        # 예: text = your_korean_punctuation_restoration(text)
        # 예: text = your_ollama_local_llm_call(text)
        out.append({"startMs": seg.get("startMs", 0), "text": text})

    json.dump({"segments": out}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
