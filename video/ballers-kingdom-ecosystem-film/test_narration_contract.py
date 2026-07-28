#!/usr/bin/env python3
"""Verify the locked Ballers Kingdom narration and caption contract."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


PACKAGE = Path(__file__).resolve().parent
CONTRACT_PATH = PACKAGE / "narration_contract.json"
CLAIM_REGISTER_PATH = PACKAGE / "claim_register.json"
CAPTION_GENERATOR = PACKAGE / "generate_captions.py"
NARRATION_GENERATOR = PACKAGE / "generate_narration.py"
CAPTIONS_DIR = PACKAGE / "narration"


def parse_srt(path: Path) -> list[tuple[int, str, str, str]]:
    blocks = path.read_text(encoding="utf-8").strip().split("\n\n")
    captions: list[tuple[int, str, str, str]] = []
    for block in blocks:
        lines = block.splitlines()
        assert len(lines) == 3, f"invalid SRT block: {block!r}"
        start, end = lines[1].split(" --> ", 1)
        captions.append((int(lines[0]), start, end, lines[2]))
    return captions


def parse_vtt(path: Path) -> list[tuple[str, str, str]]:
    lines = path.read_text(encoding="utf-8").strip().splitlines()
    assert lines[0] == "WEBVTT"
    entries = "\n".join(lines[2:]).split("\n\n")
    captions: list[tuple[str, str, str]] = []
    for entry in entries:
        timing, text = entry.split("\n", 1)
        start, end = timing.split(" --> ", 1)
        captions.append((start, end, text))
    return captions


def main() -> None:
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    claims = json.loads(CLAIM_REGISTER_PATH.read_text(encoding="utf-8"))
    approved_claim_ids = {claim["id"] for claim in claims if claim["availability"] == "verified-live"}

    assert contract["runtime_seconds"] == 70
    beats = contract["beats"]
    assert sum(beat["duration_seconds"] for beat in beats) == 70
    assert all(beat["text"] for beat in beats)
    assert all(
        claim_id in approved_claim_ids
        for beat in beats
        for claim_id in beat["visual_claim_ids"]
    )
    assert [(beat["start_seconds"], beat["duration_seconds"]) for beat in beats] == [
        (0, 16), (16, 18), (34, 22), (56, 8), (64, 6)
    ]
    assert beats[-1]["text"] == "Choose your path at ballkingdom.com."

    subprocess.run([sys.executable, str(CAPTION_GENERATOR)], check=True)
    srt_captions = parse_srt(CAPTIONS_DIR / "narration.srt")
    vtt_captions = parse_vtt(CAPTIONS_DIR / "narration.vtt")
    assert [caption[3] for caption in srt_captions] == [beat["text"] for beat in beats]
    assert [caption[2] for caption in vtt_captions] == [beat["text"] for beat in beats]
    assert [caption[0] for caption in srt_captions] == list(range(1, len(beats) + 1))
    assert len(srt_captions) == len(vtt_captions) == len(beats)
    assert [
        (start.replace(",", "."), end.replace(",", "."), text)
        for _, start, end, text in srt_captions
    ] == [
        (caption[0], caption[1], beat["text"])
        for caption, beat in zip(vtt_captions, beats, strict=True)
    ]

    unauthorized_environment = os.environ | {
        "BALLERS_AUTHORIZED_BRIAN_VOICE_REFERENCE": str(PACKAGE / "unapproved.wav")
    }
    rejected = subprocess.run(
        [sys.executable, str(NARRATION_GENERATOR), "--sample", "foundation"],
        env=unauthorized_environment,
        capture_output=True,
        text=True,
    )
    assert rejected.returncode != 0
    assert "Refusing non-authorized voice reference." in rejected.stderr

    print("narration contract: PASS")


if __name__ == "__main__":
    main()
