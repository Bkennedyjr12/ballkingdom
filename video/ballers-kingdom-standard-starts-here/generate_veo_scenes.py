#!/usr/bin/env python3
"""Submit the five approved Ballers scenes to Vertex Veo exactly once."""
from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import subprocess
import time
import urllib.error
import urllib.request
from collections import OrderedDict
from pathlib import Path
from typing import Any


PROJECT_ID = "the-ballers-kingdom"
LOCATION = "us-central1"
MODEL_ID = "veo-3.1-generate-001"
APPROVED_REFERENCE_RELPATH = Path("assets/img/brian_coach_clean_anchor_v2.png")
NEGATIVE_PROMPT = (
    "readable text, letters, words, numbers, generated logo, watermark, badge, "
    "jersey lettering, branded clothing, wrong age, childlike proportions, adult athlete, "
    "identity drift, wardrobe change, extra fingers, malformed hands, fused limbs, "
    "broken anatomy, malformed soccer ball, changing ball size, dead eyes, waxy skin, "
    "frozen background, empty field, staged posing, direct-to-camera dialogue"
)


def scene_prompts() -> OrderedDict[str, str]:
    continuity = (
        "Use the provided starting image only as the authorized identity anchor for Brian, "
        "the consistent adult Black male coach in his 30s. Preserve Brian's current facial "
        "proportions, short natural hair, trimmed beard, warm brown skin, and calm attentive "
        "presence. From the opening frame establish him naturally in the same plain black "
        "unmarked training jacket and plain black athletic pants. Do not reproduce clothing, "
        "jewelry, eyewear, text, marks, or logos from the source image. Keep the same warm "
        "late-afternoon Southern California community soccer field, golden natural light, "
        "realistic skin texture, coherent field geography, regulation soccer-ball scale, and "
        "documentary cinema look. The recurring original male athlete is age 17, with an "
        "age-appropriate athletic build and the same plain dark unmarked training kit. "
        "The recurring teammate is also 17. Every visible shirt, shorts, socks, shoes, jacket, "
        "and training cone is entirely plain and unbranded: no swoosh-like symbols, stripes, "
        "manufacturer marks, badges, numbers, lettering, or sportswear designs. Natural eye lines, physically credible motion, "
        "alive background training, no speech, no captions, no readable language, no logos. "
    )
    return OrderedDict(
        [
            (
                "scene-01",
                continuity
                + "Arrival beat, eight seconds. Flow from Brian's identity-anchored opening "
                "into a low 35mm gimbal follow at the field gate as Brian welcomes the athlete. "
                "The teammate rolls a clean soccer ball into frame; the athlete controls it "
                "with one believable touch and turns toward the active field. Rise from ball "
                "height to the athlete's listening face while warm-ups continue naturally.",
            ),
            (
                "scene-02",
                continuity
                + "Correction beat, eight seconds. On the same field Brian demonstrates one "
                "open-body first touch beside the athlete. The athlete watches closely, repeats "
                "the detail with balanced footwork, and earns Brian's restrained nod. Use a "
                "50mm handheld medium two-shot that moves only with the demonstration. A "
                "teammate pauses to observe and then resumes a nearby repetition.",
            ),
            (
                "scene-03",
                continuity
                + "Pressure beat, eight seconds. Begin anchored on Brian observing the active "
                "small-sided drill, then rack focus and track to the athlete receiving a pass "
                "under pressure. The athlete protects the correctly shaped ball, makes one "
                "clear decision, releases into open space, and accelerates as the teammate "
                "reacts and chases. Handheld 50mm tracking follows pressure to release; other "
                "players continue credible drills in the background.",
            ),
            (
                "scene-04",
                continuity
                + "Connection beat, eight seconds. At the same sideline Brian gives an original "
                "adult guardian a concise attentive update while the athlete listens nearby. "
                "The guardian acknowledges with a genuine restrained response; the athlete's "
                "posture gains confidence and he returns toward the drill. A 50mm gimbal starts "
                "on the understated three-person exchange and follows the athlete back to play.",
            ),
            (
                "scene-05",
                continuity
                + "Invitation beat, eight seconds. Brian watches the athlete complete a final "
                "technically clean repetition while the teammate and background players keep "
                "training naturally. Use a slow 35mm gimbal pullback that settles into a stable "
                "wide golden-hour field composition. End with clean negative space at frame "
                "left for a separate verified post-production end card; generate no text.",
            ),
        ]
    )


def public_contract() -> dict[str, Any]:
    return {
        "project_id": PROJECT_ID,
        "location": LOCATION,
        "model_id": MODEL_ID,
        "scene_ids": ["arrival", "correction", "pressure", "connection", "invitation"],
        "request_count": 5,
        "sample_count": 1,
        "duration_seconds": 8,
        "aspect_ratio": "16:9",
        "resolution": "720p",
        "generate_audio": False,
        "person_generation": "allow_all",
        "input_mode": "image-to-video-starting-frame",
        "reference_images_field": False,
        "approved_reference_relpath": str(APPROVED_REFERENCE_RELPATH),
        "regeneration": "refused",
    }


def build_payload(*, prompt: str, image_bytes: bytes, mime_type: str, seed: int) -> dict[str, Any]:
    return {
        "instances": [
            {
                "prompt": prompt,
                "image": {
                    "bytesBase64Encoded": base64.b64encode(image_bytes).decode("ascii"),
                    "mimeType": mime_type,
                },
            }
        ],
        "parameters": {
            "sampleCount": 1,
            "durationSeconds": 8,
            "aspectRatio": "16:9",
            "resolution": "720p",
            "resizeMode": "crop",
            "personGeneration": "allow_all",
            "generateAudio": False,
            "negativePrompt": NEGATIVE_PROMPT,
            "seed": seed,
        },
    }


def access_token() -> str:
    return subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()


def post_json(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {access_token()}",
            "Content-Type": "application/json; charset=utf-8",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        body = error.read()
        try:
            parsed = json.loads(body)
            provider_error = parsed.get("error", {})
            status = provider_error.get("status", "HTTP_ERROR")
            message = provider_error.get("message", f"HTTP {error.code}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            status = "HTTP_ERROR"
            message = f"HTTP {error.code}"
        raise RuntimeError(f"{status}: {message}") from None


def write_ledger(path: Path, ledger: dict[str, Any]) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(ledger, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def output_video(result: dict[str, Any], output_path: Path) -> None:
    generated = result["response"]["videos"][0]
    encoded = generated.get("bytesBase64Encoded") or generated.get("video", {}).get("bytesBase64Encoded")
    uri = generated.get("gcsUri") or generated.get("video", {}).get("uri")
    if encoded:
        output_path.write_bytes(base64.b64decode(encoded))
        return
    if uri:
        subprocess.run(["gcloud", "storage", "cp", uri, str(output_path)], check=True)
        return
    raise RuntimeError("Provider response did not contain video bytes or a storage URI")


def validate_reference(reference: Path, project_root: Path) -> None:
    approved = (project_root / APPROVED_REFERENCE_RELPATH).resolve()
    if reference.resolve() != approved:
        raise SystemExit("Refusing an image other than the approved Brian continuity source")
    if not reference.is_file():
        raise SystemExit("Approved Brian continuity source is missing")


def submit_all(reference: Path, output_dir: Path, project_root: Path) -> int:
    validate_reference(reference, project_root)
    output_dir.mkdir(parents=True, exist_ok=True)
    ledger_path = output_dir / "generation-ledger.json"
    if ledger_path.exists():
        raise SystemExit(
            "Generation ledger already exists; refusing any regeneration. "
            "Use --poll-existing only to resume polling submitted operations."
        )

    ledger: dict[str, Any] = {"schema_version": 1, "model": MODEL_ID, "scenes": {}}
    mime_type = mimetypes.guess_type(reference.name)[0] or "image/jpeg"
    image_bytes = reference.read_bytes()
    model_url = (
        f"https://{LOCATION}-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/{LOCATION}"
        f"/publishers/google/models/{MODEL_ID}"
    )
    operations: dict[str, str] = {}
    failures = 0

    for index, (name, prompt) in enumerate(scene_prompts().items(), start=1):
        ledger["scenes"][name] = {"request_count": 1, "status": "request_started"}
        write_ledger(ledger_path, ledger)
        try:
            operation = post_json(
                model_url + ":predictLongRunning",
                build_payload(
                    prompt=prompt,
                    image_bytes=image_bytes,
                    mime_type=mime_type,
                    seed=20260726 + index,
                ),
            )
            operation_name = operation["name"]
            operations[name] = operation_name
            ledger["scenes"][name].update({"status": "submitted", "operation_name": operation_name})
            print(f"{name}: submitted", flush=True)
        except Exception as error:
            ledger["scenes"][name].update({"status": "submission_failed", "error": str(error)})
            failures += 1
            print(f"{name}: submission failed", flush=True)
        write_ledger(ledger_path, ledger)

    while operations:
        time.sleep(15)
        for name, operation_name in list(operations.items()):
            try:
                result = post_json(
                    model_url + ":fetchPredictOperation",
                    {"operationName": operation_name},
                )
                if not result.get("done"):
                    print(f"{name}: processing", flush=True)
                    continue
                if "error" in result:
                    status = result["error"].get("status", "PROVIDER_ERROR")
                    message = result["error"].get("message", "Generation failed")
                    ledger["scenes"][name].update(
                        {"status": "generation_failed", "error": f"{status}: {message}"}
                    )
                    failures += 1
                else:
                    output_path = output_dir / f"{name}.mp4"
                    output_video(result, output_path)
                    ledger["scenes"][name].update(
                        {"status": "completed", "output": output_path.name}
                    )
                    print(f"{name}: completed", flush=True)
                operations.pop(name)
                write_ledger(ledger_path, ledger)
            except Exception as error:
                ledger["scenes"][name].update({"status": "poll_failed", "error": str(error)})
                failures += 1
                operations.pop(name)
                write_ledger(ledger_path, ledger)
                print(f"{name}: polling failed", flush=True)
    return 1 if failures else 0


def poll_existing(output_dir: Path) -> int:
    ledger_path = output_dir / "generation-ledger.json"
    if not ledger_path.is_file():
        raise SystemExit("No generation ledger exists")
    ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
    pending = {
        name: scene["operation_name"]
        for name, scene in ledger["scenes"].items()
        if scene.get("status") in {"submitted", "poll_failed"} and scene.get("operation_name")
    }
    if not pending:
        print("No submitted operations remain to poll.")
        return 0
    model_url = (
        f"https://{LOCATION}-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/{LOCATION}"
        f"/publishers/google/models/{MODEL_ID}"
    )
    failures = 0
    while pending:
        time.sleep(15)
        for name, operation_name in list(pending.items()):
            try:
                result = post_json(
                    model_url + ":fetchPredictOperation",
                    {"operationName": operation_name},
                )
                if not result.get("done"):
                    print(f"{name}: processing", flush=True)
                    continue
                if "error" in result:
                    status = result["error"].get("status", "PROVIDER_ERROR")
                    message = result["error"].get("message", "Generation failed")
                    ledger["scenes"][name].update(
                        {"status": "generation_failed", "error": f"{status}: {message}"}
                    )
                    failures += 1
                else:
                    output_path = output_dir / f"{name}.mp4"
                    output_video(result, output_path)
                    ledger["scenes"][name].update(
                        {"status": "completed", "output": output_path.name}
                    )
                    print(f"{name}: completed", flush=True)
                pending.pop(name)
                write_ledger(ledger_path, ledger)
            except Exception as error:
                ledger["scenes"][name].update({"status": "poll_failed", "error": str(error)})
                write_ledger(ledger_path, ledger)
                print(f"{name}: polling failed", flush=True)
                return 1
    return 1 if failures else 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--print-contract", action="store_true")
    parser.add_argument("--reference", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--poll-existing", action="store_true")
    args = parser.parse_args()
    if args.print_contract:
        print(json.dumps(public_contract(), sort_keys=True))
        return
    if not args.output_dir:
        parser.error("--output-dir is required")
    if args.poll_existing:
        raise SystemExit(poll_existing(args.output_dir))
    if not args.reference:
        parser.error("--reference is required")
    project_root = Path(__file__).resolve().parents[2]
    raise SystemExit(submit_all(args.reference, args.output_dir, project_root))


if __name__ == "__main__":
    main()
