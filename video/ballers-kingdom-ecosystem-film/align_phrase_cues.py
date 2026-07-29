#!/usr/bin/env python3
"""Create fail-closed phrase cue timing from audible silence anchors."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

PACKAGE = Path(__file__).resolve().parent
CONTRACT = PACKAGE / "narration_contract.json"
SPEC = PACKAGE / "phrase_alignment_spec.json"
TOLERANCE = 0.035


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def silences(wav: Path) -> tuple[list[float], list[float]]:
    run = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(wav), "-af",
         "silencedetect=noise=-35dB:d=0.12", "-f", "null", "-"],
        check=True, capture_output=True, text=True,
    )
    starts = [float(x) for x in re.findall(r"silence_start: ([0-9.]+)", run.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", run.stderr)]
    return starts, ends


def near(value: float, candidates: list[float]) -> bool:
    return any(abs(value - candidate) <= TOLERANCE for candidate in candidates)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--narration-dir", type=Path, required=True)
    args = parser.parse_args()
    output = args.narration_dir.resolve()
    manifest_path = output / "authorized-clone-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    if manifest["contract_sha256"] != digest(CONTRACT):
        raise SystemExit("Refusing alignment for a narration manifest with a different contract.")
    cues = []
    for beat in contract["beats"]:
        anchors = spec["beats"].get(beat["id"])
        if not anchors or len(anchors) != len(beat["caption_phrases"]):
            raise SystemExit(f"Missing exact phrase anchors for {beat['id']}.")
        starts, ends = silences(output / f"{beat['id']}.wav")
        for index, ((start, end), text) in enumerate(zip(anchors, beat["caption_phrases"], strict=True)):
            if not near(start, ends):
                raise SystemExit(f"Speech start anchor is not audible silence-end evidence: {beat['id']}:{index}.")
            if end < float(manifest["beats"][contract["beats"].index(beat)]["duration_seconds"]) - TOLERANCE and not near(end, starts):
                raise SystemExit(f"Speech end anchor is not audible silence-start evidence: {beat['id']}:{index}.")
            cues.append({"beat_id": beat["id"], "text": text,
                         "start_seconds": round(float(beat["start_seconds"]) + start, 3),
                         "end_seconds": round(float(beat["start_seconds"]) + end, 3)})
    artifact = {
        "schema_version": 1, "method": spec["method"], "contract_sha256": digest(CONTRACT),
        "master_sha256": manifest["master"]["sha256"], "spec_sha256": digest(SPEC), "cues": cues,
    }
    artifact_path = output / "phrase-alignment.json"
    artifact_path.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    manifest["phrase_alignment"] = {
        "artifact_filename": artifact_path.name, "artifact_sha256": digest(artifact_path),
        "spec_sha256": digest(SPEC), "master_sha256": manifest["master"]["sha256"],
        "method": spec["method"],
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"phrase alignment: PASS ({artifact_path})")


if __name__ == "__main__":
    main()
