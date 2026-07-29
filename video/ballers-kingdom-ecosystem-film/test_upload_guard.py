#!/usr/bin/env python3
"""Static safety checks for the Ballers Kingdom unlisted-review uploader."""

from __future__ import annotations

from pathlib import Path


PACKAGE = Path(__file__).resolve().parent
SOURCE = PACKAGE / "upload_unlisted_review.py"
NARRATION_SOURCE = PACKAGE / "generate_narration.py"


def main() -> None:
    assert SOURCE.is_file(), "Guarded uploader is missing."
    source = SOURCE.read_text(encoding="utf-8")
    narration_source = NARRATION_SOURCE.read_text(encoding="utf-8")

    assert '"privacyStatus": "unlisted"' in source
    assert "ballers" in source.lower()
    assert "youtube" not in narration_source.lower()
    assert "delete" not in source.lower()
    assert "channels().list" in source
    assert "thumbnails().set" in source
    assert "sha256" in source.lower()
    assert "youtube-receipt.json" in source
    assert ".local/share/ballers-kingdom-youtube-oauth/token.json" in source
    print("upload guard: PASS")


if __name__ == "__main__":
    main()
