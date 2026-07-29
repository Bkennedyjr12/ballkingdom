#!/usr/bin/env python3
"""Verify the local-only Ballers Kingdom ecosystem review master."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
from pathlib import Path


PACKAGE = Path(__file__).resolve().parent
CONTRACT = PACKAGE / "narration_contract.json"
R3_NARRATION = PACKAGE / "narration" / "r3-authorized"
MANIFEST = R3_NARRATION / "authorized-clone-manifest.json"
PHRASE_ALIGNMENT = R3_NARRATION / "phrase-alignment.json"
CAPTION_CUES = R3_NARRATION / "caption-cues.json"
MASTER = PACKAGE / "final-review" / "ballers-kingdom-ecosystem-review.mp4"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, check=True, capture_output=True, text=True)


def probe(path: Path) -> dict[str, object]:
    payload = json.loads(
        run(
            "ffprobe", "-v", "error",
            "-show_entries",
            "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,duration,sample_rate,channels,channel_layout",
            "-of", "json", str(path),
        ).stdout
    )
    video = next(stream for stream in payload["streams"] if stream["codec_type"] == "video")
    audio = next(stream for stream in payload["streams"] if stream["codec_type"] == "audio")
    numerator, denominator = video["r_frame_rate"].split("/", maxsplit=1)
    return {
        "width": video["width"],
        "height": video["height"],
        "fps": int(int(numerator) / int(denominator)),
        "duration_seconds": round(float(payload["format"]["duration"])),
        "video_duration_seconds": float(video["duration"]),
        "audio_duration_seconds": float(audio["duration"]),
        "codecs": {video["codec_name"], audio["codec_name"]},
        "sample_rate": int(audio["sample_rate"]),
        "channels": audio["channels"],
        "channel_layout": audio.get("channel_layout"),
    }


def srt_text(path: Path) -> list[str]:
    blocks = re.split(r"\n\s*\n", path.read_text(encoding="utf-8").strip())
    return [
        " ".join(line.strip() for line in block.splitlines()[2:])
        for block in blocks
    ]


def tail_mean_db(path: Path) -> float:
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-ss", "60", "-t", "10", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
        check=True,
        capture_output=True,
        text=True,
    )
    match = re.search(r"mean_volume: (-?[\d.]+) dB", result.stderr)
    assert match, "Could not measure final-ten-second audio."
    return float(match.group(1))


def no_black_or_frozen_frames(path: Path) -> None:
    black = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(path), "-vf", "blackdetect=d=0.25:pix_th=0.02", "-an", "-f", "null", "-"],
        check=True,
        capture_output=True,
        text=True,
    )
    assert "black_start" not in black.stderr, "Detected a black frame segment in the master."
    hashes = [
        line.rsplit(",", maxsplit=1)[-1].strip()
        for line in run(
            "ffmpeg", "-hide_banner", "-i", str(path), "-map", "0:v:0",
            "-vf", "fps=1,scale=320:-2", "-f", "framemd5", "-"
        ).stdout.splitlines()
        if line.startswith("0,")
    ]
    assert len(hashes) == 70, f"Expected 70 one-second frame hashes, got {len(hashes)}."
    assert all(left != right for left, right in zip(hashes, hashes[1:])), "Detected a frozen one-second frame interval."


def main() -> None:
    assert MASTER.is_file(), "The review master is missing; run render_review_master.sh."
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    alignment = json.loads(PHRASE_ALIGNMENT.read_text(encoding="utf-8"))
    cues = json.loads(CAPTION_CUES.read_text(encoding="utf-8"))

    assert manifest["master"]["sha256"] == sha256(R3_NARRATION / "narration.wav")
    assert alignment["master_sha256"] == manifest["master"]["sha256"]
    assert len(cues) == len(alignment["cues"]) == 17
    assert cues == alignment["cues"], "Captions must use the manifest-bound r3 phrase cues."
    narration_text = [phrase for beat in contract["beats"] for phrase in beat["caption_phrases"]]
    caption_text = [cue["text"] for cue in cues]
    assert caption_text == narration_text
    assert srt_text(R3_NARRATION / "narration.srt") == narration_text

    metadata = probe(MASTER)
    assert {key: metadata[key] for key in ("width", "height", "fps", "duration_seconds")} == {
        "width": 1920, "height": 1080, "fps": 24, "duration_seconds": 70,
    }
    assert {"h264", "aac"} <= metadata["codecs"]
    assert metadata["sample_rate"] == 48000
    assert metadata["channels"] == 2 and metadata["channel_layout"] == "stereo"
    frame_tolerance = (1 / 24) + 0.001
    assert abs(metadata["video_duration_seconds"] - 70) <= frame_tolerance
    assert abs(metadata["audio_duration_seconds"] - 70) <= frame_tolerance
    final_ten_seconds_mean_db = tail_mean_db(MASTER)
    assert final_ten_seconds_mean_db > -42
    no_black_or_frozen_frames(MASTER)
    print(f"master QA: PASS (tail mean {final_ten_seconds_mean_db:.1f} dB)")


if __name__ == "__main__":
    main()
