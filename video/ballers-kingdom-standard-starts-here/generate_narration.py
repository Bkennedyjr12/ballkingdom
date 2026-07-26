#!/usr/bin/env python3
"""Create one non-cloned Ballers narration track from the locked copy contract."""
from __future__ import annotations

import base64
import json
import subprocess
import urllib.request
from pathlib import Path


PACKAGE = Path(__file__).resolve().parent
CONTRACT = json.loads((PACKAGE / "narration_contract.json").read_text(encoding="utf-8"))
OUTPUT_DIR = PACKAGE / "narration"
MASTER = OUTPUT_DIR / "narration.wav"
QUOTA_PROJECT = "the-ballers-kingdom"


def token() -> str:
    return subprocess.check_output(
        ["gcloud", "auth", "application-default", "print-access-token"], text=True
    ).strip()


def synthesize(text: str, destination: Path) -> None:
    payload = json.dumps({
        "input": {"text": text},
        "voice": {"languageCode": "en-US", "name": CONTRACT["voice"]},
        "audioConfig": {"audioEncoding": "MP3", "speakingRate": CONTRACT["speaking_rate"]},
    }).encode("utf-8")
    request = urllib.request.Request(
        "https://texttospeech.googleapis.com/v1/text:synthesize",
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {token()}",
            "Content-Type": "application/json",
            "X-Goog-User-Project": QUOTA_PROJECT,
        },
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        encoded = json.load(response)["audioContent"]
    destination.write_bytes(base64.b64decode(encoded))


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if MASTER.exists():
        raise SystemExit("Narration master already exists; refusing an unreviewed overwrite.")
    parts: list[str] = []
    for beat in CONTRACT["beats"]:
        clip = OUTPUT_DIR / f"{beat['id']}.mp3"
        synthesize(beat["text"], clip)
        delay_ms = int(beat["start_seconds"] * 1000)
        parts.append(f"[{len(parts)}:a]adelay={delay_ms}|{delay_ms},aresample=48000[voice{len(parts)}]")
    mix_inputs = "".join(f"[voice{i}]" for i in range(len(parts)))
    command = ["ffmpeg", "-hide_banner", "-y"]
    for beat in CONTRACT["beats"]:
        command += ["-i", str(OUTPUT_DIR / f"{beat['id']}.mp3")]
    command += [
        "-filter_complex", ";".join(parts) + f";{mix_inputs}amix=inputs={len(parts)}:duration=longest:normalize=0,apad=pad_dur=45,atrim=duration=45,alimiter=limit=0.88[a]",
        "-map", "[a]", "-c:a", "pcm_s16le", str(MASTER),
    ]
    subprocess.run(command, check=True)
    print(f"Narration written: {MASTER}")


if __name__ == "__main__":
    main()
