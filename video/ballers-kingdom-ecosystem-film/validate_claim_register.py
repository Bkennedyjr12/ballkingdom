#!/usr/bin/env python3
"""Validate the public-evidence contract for ecosystem-film claims."""

import json
from pathlib import Path


REGISTER_PATH = Path(__file__).with_name("claim_register.json")
REQUIRED = {"id", "approved_copy", "source_url", "evidence_capture", "availability"}
ALLOWED_AVAILABILITY = {"verified-live", "being-built"}
CANONICAL_PREFIX = "https://ballkingdom.com/"


def main() -> None:
    with REGISTER_PATH.open(encoding="utf-8") as register_file:
        claims = json.load(register_file)

    assert isinstance(claims, list) and claims, "Register must contain at least one claim."
    seen_ids = set()
    for claim in claims:
        assert REQUIRED <= claim.keys(), f"Missing required fields in {claim!r}"
        assert claim["id"] not in seen_ids, f"Duplicate claim id: {claim['id']}"
        seen_ids.add(claim["id"])
        assert claim["availability"] in ALLOWED_AVAILABILITY
        assert claim["approved_copy"].strip()
        assert claim["source_url"].startswith(CANONICAL_PREFIX)
        capture_path = REGISTER_PATH.parent / claim["evidence_capture"]
        assert capture_path.is_file(), f"Missing evidence capture: {capture_path}"


if __name__ == "__main__":
    main()
