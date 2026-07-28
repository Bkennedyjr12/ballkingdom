#!/usr/bin/env python3
"""Generate local-only review narration with the authorized Brian clone lane."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


PACKAGE = Path(__file__).resolve().parent
CONTRACT_PATH = PACKAGE / "narration_contract.json"
OUTPUT_DIR = PACKAGE / "narration"
AUTHORIZED_LANE = "authorized-brian-professional-clone"
AUTHORIZED_REFERENCE = Path(
    "/Users/briankennedyjrm.ed/ei-video-handoff/refs/brian/brian_voice_clean_60s.wav"
)
CHATTERBOX_SCRIPT = Path(
    "/Users/briankennedyjrm.ed/ei-video-handoff/scripts/chatterbox_synth_text.py"
)


def load_contract() -> dict[str, object]:
    return json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))


def authorized_reference() -> Path:
    configured = Path(
        os.environ.get("BALLERS_AUTHORIZED_BRIAN_VOICE_REFERENCE", str(AUTHORIZED_REFERENCE))
    ).expanduser().resolve()
    if configured != AUTHORIZED_REFERENCE.resolve():
        raise SystemExit("Refusing non-authorized voice reference.")
    if not configured.is_file():
        raise SystemExit("Authorized Brian voice reference is unavailable locally.")
    return configured


def chatterbox_python() -> str:
    configured = os.environ.get("CHATTERBOX_PYTHON")
    if not configured:
        raise SystemExit(
            "CHATTERBOX_PYTHON must name the approved local Chatterbox environment; no cloud provider is used."
        )
    executable = Path(configured).expanduser()
    if not executable.is_file():
        raise SystemExit("CHATTERBOX_PYTHON does not name an executable local Python runtime.")
    return str(executable)


def synthesize(beat: dict[str, object], destination: Path) -> None:
    reference = authorized_reference()
    if not CHATTERBOX_SCRIPT.is_file():
        raise SystemExit("Authorized local Chatterbox synthesis script is unavailable.")
    text_path = OUTPUT_DIR / f"{beat['id']}.txt"
    text_path.write_text(str(beat["text"]) + "\n", encoding="utf-8")
    subprocess.run(
        [
            chatterbox_python(),
            str(CHATTERBOX_SCRIPT),
            "--text-file",
            str(text_path),
            "--ref",
            str(reference),
            "--out",
            str(destination),
            "--device",
            "cpu",
        ],
        check=True,
    )


def assemble_master(beats: list[dict[str, object]]) -> None:
    clips = [OUTPUT_DIR / f"{beat['id']}.wav" for beat in beats]
    for clip in clips:
        if not clip.is_file():
            raise SystemExit(f"Missing synthesized clip: {clip}")
    command = ["ffmpeg", "-hide_banner", "-y"]
    for clip in clips:
        command.extend(["-i", str(clip)])
    delays = []
    inputs = []
    for index, beat in enumerate(beats):
        delay = int(beat["start_seconds"]) * 1000
        delays.append(f"[{index}:a]adelay={delay}|{delay},aresample=48000[voice{index}]")
        inputs.append(f"[voice{index}]")
    filter_graph = ";".join(delays) + ";" + "".join(inputs)
    filter_graph += f"amix=inputs={len(inputs)}:duration=longest:normalize=0,apad,atrim=duration=70[a]"
    command.extend(
        ["-filter_complex", filter_graph, "-map", "[a]", "-c:a", "pcm_s16le", str(OUTPUT_DIR / "narration.wav")]
    )
    subprocess.run(command, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sample", metavar="BEAT_ID", help="Generate one local Brian-lane review sample.")
    parser.add_argument("--all", action="store_true", help="Generate the timed local review master.")
    parser.add_argument("--voice-lane", default=AUTHORIZED_LANE)
    args = parser.parse_args()
    if args.voice_lane != AUTHORIZED_LANE:
        raise SystemExit("Refusing a voice lane other than the authorized Brian professional clone.")
    if bool(args.sample) == args.all:
        raise SystemExit("Choose exactly one of --sample BEAT_ID or --all.")

    contract = load_contract()
    if contract["voice_lane"] != AUTHORIZED_LANE:
        raise SystemExit("Narration contract does not authorize this voice lane.")
    beats = contract["beats"]
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if args.sample:
        matches = [beat for beat in beats if beat["id"] == args.sample]
        if not matches:
            raise SystemExit(f"Unknown beat: {args.sample}")
        destination = OUTPUT_DIR / f"{args.sample}.wav"
        synthesize(matches[0], destination)
        print(f"Local authorized Brian review sample written: {destination}")
        return

    for beat in beats:
        synthesize(beat, OUTPUT_DIR / f"{beat['id']}.wav")
    assemble_master(beats)
    print(f"Local authorized Brian review master written: {OUTPUT_DIR / 'narration.wav'}")


if __name__ == "__main__":
    main()
