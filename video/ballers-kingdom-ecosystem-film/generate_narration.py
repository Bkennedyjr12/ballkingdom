#!/usr/bin/env python3
"""Generate local-only review narration with the authorized Brian clone lane."""
from __future__ import annotations

import argparse
import json
import os
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
APPROVED_CHATTERBOX_PYTHON = Path(
    "/Users/briankennedyjrm.ed/ai-toolkit/vendor/chatterbox-env/bin/python"
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
    executable = APPROVED_CHATTERBOX_PYTHON.resolve()
    if not executable.is_file() or not os.access(executable, os.X_OK):
        raise SystemExit(
            "Approved local Chatterbox runtime is unavailable; no fallback, provider, or alternate runtime is allowed."
        )
    return str(executable)


def wav_duration_seconds(path: Path) -> float:
    if not path.is_file() or path.stat().st_size <= 44:
        raise SystemExit(f"Narration synthesis did not create a non-empty WAV: {path}")
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=format_name,duration",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    metadata = json.loads(result.stdout)["format"]
    if metadata["format_name"] != "wav":
        raise SystemExit(f"Narration synthesis did not create a WAV container: {path}")
    duration = float(metadata["duration"])
    if duration <= 0:
        raise SystemExit(f"Narration synthesis created an empty WAV: {path}")
    return duration


def validate_wav(path: Path, max_duration_seconds: int) -> float:
    duration = wav_duration_seconds(path)
    if duration > max_duration_seconds:
        raise SystemExit(
            f"Narration clip {path.name} is {duration:.3f}s and exceeds its "
            f"{max_duration_seconds}-second caption window."
        )
    return duration


def synthesize(beat: dict[str, object], destination: Path) -> None:
    if destination.exists():
        raise SystemExit("Refusing to overwrite existing local narration output.")
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
    validate_wav(destination, max_duration_seconds=int(beat["duration_seconds"]))


def assemble_master(beats: list[dict[str, object]]) -> None:
    clips = [OUTPUT_DIR / f"{beat['id']}.wav" for beat in beats]
    master = OUTPUT_DIR / "narration.wav"
    if master.exists():
        raise SystemExit("Refusing to overwrite existing local narration output.")
    for clip, beat in zip(clips, beats, strict=True):
        validate_wav(clip, max_duration_seconds=int(beat["duration_seconds"]))
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-n"]
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
        ["-filter_complex", filter_graph, "-map", "[a]", "-c:a", "pcm_s16le", str(master)]
    )
    subprocess.run(command, check=True)
    duration = validate_wav(master, max_duration_seconds=int(load_contract()["runtime_seconds"]))
    if abs(duration - int(load_contract()["runtime_seconds"])) > 0.01:
        raise SystemExit(f"Narration master must be exactly 70 seconds; got {duration:.3f}s.")


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
