#!/usr/bin/env python3
"""Generate local-only review narration with the authorized Brian clone lane."""
from __future__ import annotations

import argparse
import hashlib
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
    executable = APPROVED_CHATTERBOX_PYTHON
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


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def caption_cues(beat: dict[str, object], clip_duration: float) -> list[dict[str, object]]:
    """Assign readable phrase cues across the actual synthesized speech span."""
    phrases = beat["caption_phrases"]
    if " ".join(phrases) != beat["text"]:
        raise SystemExit(f"Caption phrases do not reconstruct locked copy for {beat['id']}.")
    weights = [max(1, len(phrase.split())) for phrase in phrases]
    total_weight = sum(weights)
    start = float(beat["start_seconds"])
    elapsed = 0.0
    cues = []
    for index, (phrase, weight) in enumerate(zip(phrases, weights, strict=True)):
        cue_start = start + elapsed
        elapsed += clip_duration * weight / total_weight
        cue_end = start + clip_duration if index == len(phrases) - 1 else start + elapsed
        cues.append(
            {
                "text": phrase,
                "start_seconds": round(cue_start, 3),
                "end_seconds": round(cue_end, 3),
            }
        )
    return cues


def synthesize(beat: dict[str, object], destination: Path, output_dir: Path) -> None:
    if destination.exists():
        raise SystemExit("Refusing to overwrite existing local narration output.")
    reference = authorized_reference()
    if not CHATTERBOX_SCRIPT.is_file():
        raise SystemExit("Authorized local Chatterbox synthesis script is unavailable.")
    text_path = output_dir / f"{beat['id']}.txt"
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


def assemble_master(beats: list[dict[str, object]], output_dir: Path) -> None:
    clips = [output_dir / f"{beat['id']}.wav" for beat in beats]
    master = output_dir / "narration.wav"
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


def write_provenance_manifest(beats: list[dict[str, object]], output_dir: Path) -> Path:
    reference = authorized_reference()
    runtime = APPROVED_CHATTERBOX_PYTHON
    master = output_dir / "narration.wav"
    manifest = {
        "schema_version": 1,
        "voice_lane": AUTHORIZED_LANE,
        "contract_sha256": sha256_file(CONTRACT_PATH),
        "authorized_reference": {
            "id": AUTHORIZED_LANE,
            "path": str(reference),
            "sha256": sha256_file(reference),
        },
        "runtime": {
            "executable": str(runtime),
            "resolved_executable": str(runtime.resolve()),
            "sha256": sha256_file(runtime),
        },
        "synthesis_script": {"path": str(CHATTERBOX_SCRIPT), "sha256": sha256_file(CHATTERBOX_SCRIPT)},
        "beats": [
            {
                "id": beat["id"],
                "filename": f"{beat['id']}.wav",
                "duration_seconds": round(wav_duration_seconds(output_dir / f"{beat['id']}.wav"), 3),
                "sha256": sha256_file(output_dir / f"{beat['id']}.wav"),
                "caption_cues": caption_cues(
                    beat, wav_duration_seconds(output_dir / f"{beat['id']}.wav")
                ),
            }
            for beat in beats
        ],
        "master": {
            "filename": master.name,
            "duration_seconds": round(wav_duration_seconds(master), 3),
            "sha256": sha256_file(master),
        },
    }
    manifest_path = output_dir / "authorized-clone-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sample", metavar="BEAT_ID", help="Generate one local Brian-lane review sample.")
    parser.add_argument("--all", action="store_true", help="Generate the timed local review master.")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR, help="Local output directory; useful for isolated review/test runs.")
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
    output_dir = args.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    if args.sample:
        matches = [beat for beat in beats if beat["id"] == args.sample]
        if not matches:
            raise SystemExit(f"Unknown beat: {args.sample}")
        destination = output_dir / f"{args.sample}.wav"
        synthesize(matches[0], destination, output_dir)
        print(f"Local authorized Brian review sample written: {destination}")
        return

    for beat in beats:
        synthesize(beat, output_dir / f"{beat['id']}.wav", output_dir)
    assemble_master(beats, output_dir)
    manifest_path = write_provenance_manifest(beats, output_dir)
    print(f"Local authorized Brian review master written: {output_dir / 'narration.wav'}")
    print(f"Authorized clone provenance manifest written: {manifest_path}")


if __name__ == "__main__":
    main()
