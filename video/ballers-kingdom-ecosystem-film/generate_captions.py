#!/usr/bin/env python3
"""Generate local review captions directly from the locked narration contract."""
from __future__ import annotations

import json
from pathlib import Path


PACKAGE = Path(__file__).resolve().parent
CONTRACT_PATH = PACKAGE / "narration_contract.json"
OUTPUT_DIR = PACKAGE / "narration"


def timestamp(seconds: int, separator: str) -> str:
    hours, remainder = divmod(seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}{separator}000"


def main() -> None:
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    beats = contract["beats"]
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    srt_blocks = []
    vtt_blocks = []
    for index, beat in enumerate(beats, start=1):
        start = beat["start_seconds"]
        end = start + beat["duration_seconds"]
        text = beat["text"]
        srt_blocks.append(
            f"{index}\n{timestamp(start, ',')} --> {timestamp(end, ',')}\n{text}"
        )
        vtt_blocks.append(
            f"{timestamp(start, '.')} --> {timestamp(end, '.')}\n{text}"
        )

    (OUTPUT_DIR / "narration.srt").write_text("\n\n".join(srt_blocks) + "\n", encoding="utf-8")
    (OUTPUT_DIR / "narration.vtt").write_text(
        "WEBVTT\n\n" + "\n\n".join(vtt_blocks) + "\n", encoding="utf-8"
    )
    print(f"Captions written: {OUTPUT_DIR / 'narration.srt'} and {OUTPUT_DIR / 'narration.vtt'}")


if __name__ == "__main__":
    main()
