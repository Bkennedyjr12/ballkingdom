#!/usr/bin/env python3
"""Verify the locked Ballers Kingdom narration and caption contract."""
from __future__ import annotations

import json
import os
import stat
import subprocess
import sys
import tempfile
import wave
import importlib.util
from copy import deepcopy
from pathlib import Path


PACKAGE = Path(__file__).resolve().parent
CONTRACT_PATH = PACKAGE / "narration_contract.json"
CLAIM_REGISTER_PATH = PACKAGE / "claim_register.json"
CAPTION_GENERATOR = PACKAGE / "generate_captions.py"
NARRATION_GENERATOR = PACKAGE / "generate_narration.py"
CAPTIONS_DIR = PACKAGE / "narration"


def narration_module():
    spec = importlib.util.spec_from_file_location("ballers_narration", NARRATION_GENERATOR)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def write_silent_wav(path: Path, seconds: int) -> None:
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(48_000)
        output.writeframes(b"\x00\x00" * 48_000 * seconds)


def validate_spoken_segments(contract: dict[str, object], claims_by_id: dict[str, dict[str, str]]) -> None:
    for beat in contract["beats"]:
        assert "spoken_segments" in beat
        segments = beat["spoken_segments"]
        assert segments
        assert beat["text"] == " ".join(segment["text"] for segment in segments)
        approved_segment_ids = []
        for segment in segments:
            if segment["kind"] == "approved-claim":
                claim_id = segment["claim_id"]
                assert segment["text"] == claims_by_id[claim_id]["approved_copy"]
                approved_segment_ids.append(claim_id)
            else:
                assert segment["kind"] in {"manifesto", "cta"}
                assert "claim_id" not in segment
        assert beat["visual_claim_ids"] == approved_segment_ids


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
    claims_by_id = {claim["id"]: claim for claim in claims}

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
    assert [(beat["id"], beat["chapter"]) for beat in beats] == [
        ("foundation", "foundation"),
        ("whole-person-promise", "whole-person-promise"),
        ("verified-paths", "verified-paths"),
        ("community", "community-and-cta"),
        ("cta", "community-and-cta"),
    ]
    assert beats[-1]["text"] == "Choose your path at ballkingdom.com."
    validate_spoken_segments(contract, claims_by_id)
    unsupported_paraphrase = deepcopy(contract)
    unsupported_beat = unsupported_paraphrase["beats"][2]
    unsupported_beat["spoken_segments"][2]["text"] = "Unsupported product language."
    unsupported_beat["text"] = " ".join(
        segment["text"] for segment in unsupported_beat["spoken_segments"]
    )
    try:
        validate_spoken_segments(unsupported_paraphrase, claims_by_id)
    except AssertionError:
        pass
    else:
        raise AssertionError("Unsupported claim paraphrase must fail narration-contract validation.")

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

    sample_output = CAPTIONS_DIR / "foundation.wav"
    sample_output.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory() as temporary_directory:
        writer = Path(temporary_directory) / "write-invalid-wav"
        writer.write_text(
            "#!/bin/sh\nout=''\nwhile [ \"$#\" -gt 0 ]; do\n"
            "  if [ \"$1\" = '--out' ]; then out=\"$2\"; shift 2; else shift; fi\ndone\n"
            "printf 'not-a-wav' > \"$out\"\n",
            encoding="utf-8",
        )
        writer.chmod(writer.stat().st_mode | stat.S_IXUSR)
        arbitrary_runtime = os.environ | {"CHATTERBOX_PYTHON": str(writer)}
        try:
            bypass = subprocess.run(
                [sys.executable, str(NARRATION_GENERATOR), "--sample", "foundation"],
                env=arbitrary_runtime,
                capture_output=True,
                text=True,
            )
            assert bypass.returncode != 0
            assert not sample_output.exists()
        finally:
            sample_output.unlink(missing_ok=True)

    sample_output.write_bytes(b"stale output")
    try:
        stale_output = subprocess.run(
            [sys.executable, str(NARRATION_GENERATOR), "--sample", "foundation"],
            env=os.environ | {"CHATTERBOX_PYTHON": "/usr/bin/true"},
            capture_output=True,
            text=True,
        )
        assert stale_output.returncode != 0
        assert "Refusing to overwrite existing local narration output." in stale_output.stderr
    finally:
        sample_output.unlink(missing_ok=True)

    narration = narration_module()
    assert hasattr(narration, "validate_wav")
    with tempfile.TemporaryDirectory() as temporary_directory:
        temporary_path = Path(temporary_directory)
        valid_clip = temporary_path / "valid.wav"
        too_long_clip = temporary_path / "too-long.wav"
        invalid_clip = temporary_path / "invalid.wav"
        write_silent_wav(valid_clip, 1)
        write_silent_wav(too_long_clip, 17)
        invalid_clip.write_bytes(b"not-a-wav")
        narration.validate_wav(valid_clip, max_duration_seconds=16)
        try:
            narration.validate_wav(too_long_clip, max_duration_seconds=16)
        except SystemExit as error:
            assert "exceeds its 16-second caption window" in str(error)
        else:
            raise AssertionError("Expected a clip longer than its caption window to be rejected.")
        try:
            narration.validate_wav(invalid_clip, max_duration_seconds=16)
        except SystemExit as error:
            assert "did not create a non-empty WAV" in str(error)
        else:
            raise AssertionError("Expected an invalid WAV output to be rejected.")

        original_output_dir = narration.OUTPUT_DIR
        narration.OUTPUT_DIR = temporary_path / "assembled"
        narration.OUTPUT_DIR.mkdir()
        try:
            for beat in beats:
                write_silent_wav(narration.OUTPUT_DIR / f"{beat['id']}.wav", 1)
            narration.assemble_master(beats)
            assert abs(narration.wav_duration_seconds(narration.OUTPUT_DIR / "narration.wav") - 70) <= 0.01
        finally:
            narration.OUTPUT_DIR = original_output_dir

    print("narration contract: PASS")


if __name__ == "__main__":
    main()
