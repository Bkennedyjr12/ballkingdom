#!/usr/bin/env python3
"""Verify the local Ballers Kingdom ecosystem-film review animatic contract."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path


PACKAGE = Path(__file__).resolve().parent
CONTRACT_PATH = PACKAGE / "narration_contract.json"
SHOTLIST_PATH = PACKAGE / "shotlist.json"
ANIMATIC_PATH = PACKAGE / "ecosystem-animatic.mp4"


def probe_animatic(path: Path) -> dict[str, object]:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout)
    video = next(stream for stream in payload["streams"] if stream["codec_type"] == "video")
    audio = next(stream for stream in payload["streams"] if stream["codec_type"] == "audio")
    numerator, denominator = video["r_frame_rate"].split("/", maxsplit=1)
    return {
        "duration_seconds": round(float(payload["format"]["duration"])),
        "width": video["width"],
        "height": video["height"],
        "fps": int(int(numerator) / int(denominator)),
        "video_codec": video["codec_name"],
        "audio_codec": audio["codec_name"],
    }


def main() -> None:
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    assert ANIMATIC_PATH.is_file(), "The local review animatic has not been rendered."
    shotlist = json.loads(SHOTLIST_PATH.read_text(encoding="utf-8"))
    probe = probe_animatic(ANIMATIC_PATH)

    assert probe["duration_seconds"] == 70
    assert probe["width"] == 1920 and probe["height"] == 1080
    assert probe["fps"] == 24
    assert probe["video_codec"] == "h264"
    assert probe["audio_codec"] == "aac"
    assert [shot["beat_id"] for shot in shotlist] == [beat["id"] for beat in contract["beats"]]
    assert [shot["start_seconds"] for shot in shotlist] == [
        beat["start_seconds"] for beat in contract["beats"]
    ]
    assert [shot["duration_seconds"] for shot in shotlist] == [
        beat["duration_seconds"] for beat in contract["beats"]
    ]


if __name__ == "__main__":
    main()
