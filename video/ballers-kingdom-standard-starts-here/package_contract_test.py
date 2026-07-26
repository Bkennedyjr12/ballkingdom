#!/usr/bin/env python3
"""Validate the locked source-only production contract."""

import json
from pathlib import Path


package_dir = Path(__file__).resolve().parent
contract = json.loads((package_dir / "locked_scene_contract.json").read_text(encoding="utf-8"))

expected_order = ["arrival", "correction", "pressure", "connection", "invitation"]
assert [scene["id"] for scene in contract["scenes"]] == expected_order
assert sum(scene["duration_seconds"] for scene in contract["scenes"]) == 45
assert contract["text_policy"] == "post-composite-only"
assert contract["generation_policy"]["text_free_generation"] is True
assert contract["generation_policy"]["voice_clone"] == "prohibited"
assert contract["generation_policy"]["paid_generation_gate"] == "approved animatic required"

for path in package_dir.rglob("*"):
    if path.is_file() and path.suffix in {".md", ".json", ".py"}:
        text = path.read_text(encoding="utf-8").lower()
        for forbidden in ("am" + "pac", "executive " + "incubator", "local-" + "cartoon", "of" + "fice"):
            assert forbidden not in text, f"Forbidden language '{forbidden}' in {path.name}"
