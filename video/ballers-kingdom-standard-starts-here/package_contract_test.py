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
    ("correction", 8, 9),
    ("pressure", 17, 9),
    ("connection", 26, 10),
    ("invitation", 36, 9),
]
assert len(contract["scenes"]) == len(expected_schedule)
assert [
    (scene["id"], scene["start_seconds"], scene["duration_seconds"])
    for scene in contract["scenes"]
] == expected_schedule
assert contract["scenes"][-1]["start_seconds"] + contract["scenes"][-1]["duration_seconds"] == 45
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
    "final_end_seconds": 45,
    "schedule": [
        {"id": scene_id, "start_seconds": start, "duration_seconds": duration}
        for scene_id, start, duration in expected_schedule
    ],
}
renderer_source = renderer.read_text(encoding="utf-8")
assert '"${ffmpeg_inputs[@]}"' in renderer_source
assert 'trim=duration=$duration_seconds' in renderer_source
assert 'scene_rows=()' in renderer_source

for path in package_dir.rglob("*"):
    if path.is_file() and path.suffix in {".md", ".json", ".py"}:
        text = path.read_text(encoding="utf-8").lower()
        for forbidden in ("am" + "pac", "executive " + "incubator", "local-" + "cartoon", "of" + "fice"):
            assert forbidden not in text, f"Forbidden language '{forbidden}' in {path.name}"
