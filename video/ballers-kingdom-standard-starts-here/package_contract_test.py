#!/usr/bin/env python3
"""Validate the locked source-only production contract."""

import json
import subprocess
from pathlib import Path


package_dir = Path(__file__).resolve().parent
contract = json.loads((package_dir / "locked_scene_contract.json").read_text(encoding="utf-8"))

expected_order = ["arrival", "correction", "pressure", "connection", "invitation"]
assert [scene["id"] for scene in contract["scenes"]] == expected_order
expected_schedule = [
    ("arrival", 0, 8),
    ("correction", 8, 8),
    ("pressure", 16, 8),
    ("connection", 24, 8),
    ("invitation", 32, 8),
]
assert len(contract["scenes"]) == len(expected_schedule)
assert [
    (scene["id"], scene["start_seconds"], scene["duration_seconds"])
    for scene in contract["scenes"]
] == expected_schedule
assert contract["scenes"][-1]["start_seconds"] + contract["scenes"][-1]["duration_seconds"] == 40
assert contract["post_composite_cta"] == {
    "id": "cta",
    "start_seconds": 40,
    "duration_seconds": 5,
    "generated": False,
    "copy": ["BUILD YOUR KINGDOM", "ballkingdom.com"],
}
assert contract["post_composite_cta"]["start_seconds"] + contract["post_composite_cta"]["duration_seconds"] == 45
assert contract["runtime_seconds"] == 45
assert contract["text_policy"] == "post-composite-only"
assert contract["generation_policy"]["text_free_generation"] is True
assert contract["generation_policy"]["voice_clone"] == "prohibited"
assert contract["generation_policy"]["paid_generation_gate"] == "approved animatic required"

renderer = package_dir / "render_animatic.sh"
timing = json.loads(subprocess.run(
    ["bash", str(renderer), "--print-timing"], check=True, text=True, capture_output=True
).stdout)
assert timing == {
    "runtime_seconds": 45,
    "provider_end_seconds": 40,
    "final_end_seconds": 45,
    "schedule": [
        {"id": scene_id, "start_seconds": start, "duration_seconds": duration}
        for scene_id, start, duration in expected_schedule
    ],
    "post_composite_cta": contract["post_composite_cta"],
}
renderer_source = renderer.read_text(encoding="utf-8")
assert '"${ffmpeg_inputs[@]}"' in renderer_source
assert 'trim=duration=$duration_seconds' in renderer_source
assert 'scene_rows=()' in renderer_source

generator = package_dir / "generate_veo_scenes.py"
assert generator.is_file(), "Missing Ballers-only Veo generator"
generation_contract = json.loads(subprocess.run(
    ["python3", str(generator), "--print-contract"], check=True, text=True, capture_output=True
).stdout)
assert generation_contract == {
    "project_id": "the-ballers-kingdom",
    "location": "us-central1",
    "model_id": "veo-3.1-generate-001",
    "scene_ids": expected_order,
    "request_count": 5,
    "sample_count": 1,
    "duration_seconds": 8,
    "aspect_ratio": "16:9",
    "resolution": "720p",
    "generate_audio": False,
    "person_generation": "allow_all",
    "input_mode": "image-to-video-starting-frame",
    "reference_images_field": False,
    "approved_reference_relpath": "assets/img/brian_smile.jpg",
    "regeneration": "refused",
}
generator_source = generator.read_text(encoding="utf-8")
assert "referenceImages" not in generator_source
assert "youtube" not in generator_source.lower()

for path in package_dir.rglob("*"):
    if path.is_file() and path.suffix in {".md", ".json", ".py"}:
        text = path.read_text(encoding="utf-8").lower()
        for forbidden in ("am" + "pac", "executive " + "incubator", "local-" + "cartoon", "of" + "fice"):
            assert forbidden not in text, f"Forbidden language '{forbidden}' in {path.name}"
