#!/usr/bin/env python3
"""Validate the local-only authorized-clone narration provenance manifest."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


PACKAGE = Path(__file__).resolve().parent
CONTRACT_PATH = PACKAGE / "narration_contract.json"
AUTHORIZED_REFERENCE = Path(
    "/Users/briankennedyjrm.ed/ei-video-handoff/refs/brian/brian_voice_clean_60s.wav"
)
APPROVED_CHATTERBOX_PYTHON = Path(
    "/Users/briankennedyjrm.ed/ai-toolkit/vendor/chatterbox-env/bin/python"
)
CHATTERBOX_SCRIPT = Path(
    "/Users/briankennedyjrm.ed/ei-video-handoff/scripts/chatterbox_synth_text.py"
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def wav_duration_seconds(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=format_name,duration",
            "-of", "json", str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    metadata = json.loads(result.stdout)["format"]
    if metadata["format_name"] != "wav":
        raise ValueError(f"Expected WAV container: {path}")
    return float(metadata["duration"])


def validate(narration_dir: Path) -> dict[str, object]:
    manifest_path = narration_dir / "authorized-clone-manifest.json"
    if not manifest_path.is_file():
        raise ValueError("Missing authorized-clone-manifest.json; refusing to mix narration.")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    if manifest.get("schema_version") != 1:
        raise ValueError("Unsupported narration provenance manifest schema.")
    if manifest.get("voice_lane") != contract["voice_lane"]:
        raise ValueError("Narration manifest voice lane is not authorized by the contract.")
    if manifest.get("contract_sha256") != sha256_file(CONTRACT_PATH):
        raise ValueError("Narration manifest contract digest does not match the locked contract.")

    reference = manifest.get("authorized_reference", {})
    if reference.get("id") != "authorized-brian-professional-clone":
        raise ValueError("Narration manifest has an unapproved reference ID.")
    if reference.get("path") != str(AUTHORIZED_REFERENCE):
        raise ValueError("Narration manifest reference path is not the authorized Brian reference.")
    if not AUTHORIZED_REFERENCE.is_file() or reference.get("sha256") != sha256_file(AUTHORIZED_REFERENCE):
        raise ValueError("Narration manifest reference digest does not match the authorized local reference.")

    runtime = manifest.get("runtime", {})
    if runtime.get("executable") != str(APPROVED_CHATTERBOX_PYTHON):
        raise ValueError("Narration manifest runtime executable is not the pinned Chatterbox venv.")
    if not APPROVED_CHATTERBOX_PYTHON.is_file() or runtime.get("sha256") != sha256_file(APPROVED_CHATTERBOX_PYTHON):
        raise ValueError("Narration manifest runtime digest does not match the pinned executable.")
    synthesis = manifest.get("synthesis_script", {})
    if synthesis.get("path") != str(CHATTERBOX_SCRIPT) or not CHATTERBOX_SCRIPT.is_file():
        raise ValueError("Narration manifest synthesis script is not the authorized local script.")
    if synthesis.get("sha256") != sha256_file(CHATTERBOX_SCRIPT):
        raise ValueError("Narration manifest synthesis-script digest is stale.")

    beats = contract["beats"]
    manifest_beats = manifest.get("beats")
    if not isinstance(manifest_beats, list) or [item.get("id") for item in manifest_beats] != [beat["id"] for beat in beats]:
        raise ValueError("Narration manifest beat order does not match the locked contract.")
    for beat, record in zip(beats, manifest_beats, strict=True):
        clip = narration_dir / f"{beat['id']}.wav"
        duration = wav_duration_seconds(clip)
        if record.get("filename") != clip.name or record.get("sha256") != sha256_file(clip):
            raise ValueError(f"Narration manifest digest mismatch for {clip.name}.")
        if abs(float(record.get("duration_seconds", -1)) - duration) > 0.001:
            raise ValueError(f"Narration manifest duration mismatch for {clip.name}.")
        if duration > float(beat["duration_seconds"]):
            raise ValueError(f"Narration clip exceeds caption window: {clip.name}.")
        cues = record.get("caption_cues")
        if not isinstance(cues, list) or not cues:
            raise ValueError(f"Narration manifest has no phrase cues for {beat['id']}.")

    master = narration_dir / "narration.wav"
    master_record = manifest.get("master", {})
    master_duration = wav_duration_seconds(master)
    if master_record.get("filename") != master.name or master_record.get("sha256") != sha256_file(master):
        raise ValueError("Narration manifest master digest mismatch.")
    if abs(float(master_record.get("duration_seconds", -1)) - master_duration) > 0.001:
        raise ValueError("Narration manifest master duration mismatch.")
    if abs(master_duration - float(contract["runtime_seconds"])) > 0.001:
        raise ValueError("Narration master duration is not exactly the locked runtime.")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--narration-dir", type=Path, default=PACKAGE / "narration")
    args = parser.parse_args()
    validate(args.narration_dir)
    print(f"authorized narration provenance: PASS ({args.narration_dir})")


if __name__ == "__main__":
    main()
