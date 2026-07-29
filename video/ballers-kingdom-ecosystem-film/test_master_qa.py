#!/usr/bin/env python3
"""Verify the local-only Ballers Kingdom ecosystem review master."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path


PACKAGE = Path(__file__).resolve().parent
CONTRACT = PACKAGE / "narration_contract.json"
R3_NARRATION = PACKAGE / "narration" / "r3-authorized"
MANIFEST = R3_NARRATION / "authorized-clone-manifest.json"
PHRASE_ALIGNMENT = R3_NARRATION / "phrase-alignment.json"
CAPTION_CUES = R3_NARRATION / "caption-cues.json"
SOURCE_ANIMATIC = PACKAGE / "ecosystem-animatic.mp4"
SOURCE_ATTESTATION = PACKAGE / "r3-animatic-attestation.json"
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
        "duration_seconds": float(payload["format"]["duration"]),
        "video_duration_seconds": float(video["duration"]),
        "audio_duration_seconds": float(audio["duration"]),
        "codecs": {video["codec_name"], audio["codec_name"]},
        "sample_rate": int(audio["sample_rate"]),
        "channels": audio["channels"],
        "channel_layout": audio.get("channel_layout"),
    }


def assert_duration_within_frame(metadata: dict[str, object], label: str) -> None:
    frame_tolerance = (1 / 24) + 0.001
    for key in ("duration_seconds", "video_duration_seconds", "audio_duration_seconds"):
        assert abs(float(metadata[key]) - 70) <= frame_tolerance, (
            f"{label} {key} is outside the 70-second one-frame tolerance: {metadata[key]}"
        )


def validate_source_attestation(
    source_animatic: Path = SOURCE_ANIMATIC,
    attestation_path: Path = SOURCE_ATTESTATION,
    r3_narration: Path = R3_NARRATION,
) -> dict[str, object]:
    assert attestation_path.is_file(), "Missing r3 animatic source attestation."
    attestation = json.loads(attestation_path.read_text(encoding="utf-8"))
    assert attestation.get("schema_version") == 1, "Unsupported r3 animatic attestation schema."
    source = attestation.get("source_animatic", {})
    r3 = attestation.get("r3_provenance", {})
    assert source.get("path") == "ecosystem-animatic.mp4", "Attestation source path is not locked."
    assert source.get("sha256") == sha256(source_animatic), "Approved r3 animatic digest mismatch."
    source_probe = probe(source_animatic)
    assert {
        "width": source_probe["width"], "height": source_probe["height"], "fps": source_probe["fps"],
        "video_codec": next(iter(source_probe["codecs"] - {"aac"})),
        "audio_codec": next(iter(source_probe["codecs"] - {"h264"})),
    } == {
        "width": source.get("width"), "height": source.get("height"), "fps": source.get("fps"),
        "video_codec": source.get("video_codec"), "audio_codec": source.get("audio_codec"),
    }, "Approved r3 animatic stream identity mismatch."
    assert_duration_within_frame(source_probe, "approved r3 animatic")
    assert abs(float(source.get("duration_seconds", -1)) - 70) <= (1 / 24) + 0.001
    assert r3.get("manifest_sha256") == sha256(r3_narration / "authorized-clone-manifest.json"), "r3 manifest_sha256 is stale."
    assert r3.get("narration_master_sha256") == sha256(r3_narration / "narration.wav"), "r3 narration_master_sha256 is stale."
    assert r3.get("phrase_alignment_sha256") == sha256(r3_narration / "phrase-alignment.json"), "r3 phrase_alignment_sha256 is stale."
    assert r3.get("caption_cues_sha256") == sha256(r3_narration / "caption-cues.json"), "r3 caption_cues_sha256 is stale."
    assert r3.get("contract_sha256") == sha256(CONTRACT), "r3 contract_sha256 is stale."
    manifest = json.loads((r3_narration / "authorized-clone-manifest.json").read_text(encoding="utf-8"))
    assert manifest["master"]["sha256"] == r3["narration_master_sha256"]
    assert manifest["phrase_alignment"]["artifact_sha256"] == r3["phrase_alignment_sha256"]
    return attestation


def assert_regression_fails(callback, expected_message: str) -> None:
    try:
        callback()
    except AssertionError as error:
        assert expected_message in str(error), str(error)
    else:
        raise AssertionError(f"Regression case unexpectedly passed: {expected_message}")


def run_regression_tests() -> None:
    attestation = json.loads(SOURCE_ATTESTATION.read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory() as temporary:
        temporary_path = Path(temporary)
        substituted_source = temporary_path / "substituted-animatic.mp4"
        substituted_source.write_bytes(b"not the approved r3 animatic")
        assert_regression_fails(
            lambda: validate_source_attestation(source_animatic=substituted_source),
            "Approved r3 animatic digest mismatch.",
        )
        stale = json.loads(json.dumps(attestation))
        stale["r3_provenance"]["phrase_alignment_sha256"] = "0" * 64
        stale_path = temporary_path / "stale-r3.json"
        stale_path.write_text(json.dumps(stale), encoding="utf-8")
        assert_regression_fails(
            lambda: validate_source_attestation(attestation_path=stale_path),
            "phrase_alignment_sha256",
        )

    valid = {"duration_seconds": 70.0, "video_duration_seconds": 70.0, "audio_duration_seconds": 70.0}
    assert_duration_within_frame(valid, "regression fixture")
    for duration_key in valid:
        malformed = dict(valid)
        malformed[duration_key] = 70 + (1 / 24) + 0.0011
        assert_regression_fails(
            lambda malformed=malformed: assert_duration_within_frame(malformed, "near-70 regression fixture"),
            duration_key,
        )


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
    validate_source_attestation()
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
    assert {key: metadata[key] for key in ("width", "height", "fps")} == {
        "width": 1920, "height": 1080, "fps": 24,
    }
    assert {"h264", "aac"} <= metadata["codecs"]
    assert metadata["sample_rate"] == 48000
    assert metadata["channels"] == 2 and metadata["channel_layout"] == "stereo"
    assert_duration_within_frame(metadata, "review master")
    final_ten_seconds_mean_db = tail_mean_db(MASTER)
    assert final_ten_seconds_mean_db > -42
    no_black_or_frozen_frames(MASTER)
    print(f"master QA: PASS (tail mean {final_ten_seconds_mean_db:.1f} dB)")


if __name__ == "__main__":
    if sys.argv[1:] == ["--validate-source"]:
        validate_source_attestation()
        print("r3 animatic attestation: PASS")
    else:
        assert not sys.argv[1:], "Only --validate-source is supported."
        run_regression_tests()
        main()
