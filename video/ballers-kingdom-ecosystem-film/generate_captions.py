#!/usr/bin/env python3
"""Generate phrase-timed local-review captions from the locked contract."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


PACKAGE = Path(__file__).resolve().parent
CONTRACT_PATH = PACKAGE / "narration_contract.json"
OUTPUT_DIR = PACKAGE / "narration"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def timestamp(seconds: float, separator: str) -> str:
    milliseconds = round(seconds * 1000)
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    whole_seconds, milliseconds = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{whole_seconds:02d}{separator}{milliseconds:03d}"


def fallback_cues(beat: dict[str, object]) -> list[dict[str, object]]:
    """Contract-only cue schedule for isolated validation; render uses provenance cues."""
    phrases = beat["caption_phrases"]
    weights = [max(1, len(phrase.split())) for phrase in phrases]
    total_weight = sum(weights)
    elapsed = 0.0
    cues = []
    for index, (phrase, weight) in enumerate(zip(phrases, weights, strict=True)):
        start = float(beat["start_seconds"]) + elapsed
        elapsed += float(beat["duration_seconds"]) * weight / total_weight
        end = float(beat["start_seconds"] + beat["duration_seconds"]) if index == len(phrases) - 1 else float(beat["start_seconds"]) + elapsed
        cues.append({"text": phrase, "start_seconds": round(start, 3), "end_seconds": round(end, 3)})
    return cues


def load_cues(contract: dict[str, object], manifest_path: Path | None) -> list[dict[str, object]]:
    beats = contract["beats"]
    if manifest_path is None:
        return [cue | {"beat_id": beat["id"]} for beat in beats for cue in fallback_cues(beat)]
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("contract_sha256") != sha256_file(CONTRACT_PATH):
        raise SystemExit("Caption manifest does not match the locked narration contract.")
    records = manifest.get("beats", [])
    if [record.get("id") for record in records] != [beat["id"] for beat in beats]:
        raise SystemExit("Caption manifest beat order does not match the locked contract.")
    cues = []
    for beat, record in zip(beats, records, strict=True):
        record_cues = record.get("caption_cues")
        if not isinstance(record_cues, list) or [cue.get("text") for cue in record_cues] != beat["caption_phrases"]:
            raise SystemExit(f"Caption cues do not match locked phrase copy for {beat['id']}.")
        previous_end = float(beat["start_seconds"])
        speech_end = float(beat["start_seconds"]) + float(record["duration_seconds"])
        for cue in record_cues:
            start, end = float(cue["start_seconds"]), float(cue["end_seconds"])
            if start < previous_end - 0.001 or end <= start or end > speech_end + 0.001:
                raise SystemExit(f"Caption timing is outside the authorized spoken window for {beat['id']}.")
            cues.append({"beat_id": beat["id"], "text": cue["text"], "start_seconds": start, "end_seconds": end})
            previous_end = end
    return cues


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--manifest", type=Path, help="Authorized narration provenance manifest for voiced timing.")
    args = parser.parse_args()
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    cues = load_cues(contract, args.manifest)
    output_dir = args.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    srt_blocks = []
    vtt_blocks = []
    for index, cue in enumerate(cues, start=1):
        start, end, text = cue["start_seconds"], cue["end_seconds"], cue["text"]
        srt_blocks.append(f"{index}\n{timestamp(start, ',')} --> {timestamp(end, ',')}\n{text}")
        vtt_blocks.append(f"{timestamp(start, '.')} --> {timestamp(end, '.')}\n{text}")
    (output_dir / "narration.srt").write_text("\n\n".join(srt_blocks) + "\n", encoding="utf-8")
    (output_dir / "narration.vtt").write_text("WEBVTT\n\n" + "\n\n".join(vtt_blocks) + "\n", encoding="utf-8")
    (output_dir / "caption-cues.json").write_text(json.dumps(cues, indent=2) + "\n", encoding="utf-8")
    print(f"Phrase captions written: {output_dir / 'narration.srt'} and {output_dir / 'narration.vtt'}")


if __name__ == "__main__":
    main()
