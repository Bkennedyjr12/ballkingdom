#!/usr/bin/env python3
"""Validate public, body-visible evidence for ecosystem-film claims."""

import hashlib
import json
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse


PACKAGE_DIR = Path(__file__).resolve().parent
REGISTER_PATH = PACKAGE_DIR / "claim_register.json"
EVIDENCE_PATH = PACKAGE_DIR / "claim_evidence.json"
CAPTURES_DIR = PACKAGE_DIR / "captures"
REQUIRED = {"id", "approved_copy", "source_url", "evidence_capture", "availability"}
EVIDENCE_REQUIRED = {
    "id",
    "capture_id",
    "capture_path",
    "canonical_url",
    "captured_on",
    "sha256",
    "supporting_copy",
}
ALLOWED_AVAILABILITY = {"verified-live", "being-built"}


class CaptureParser(HTMLParser):
    """Extract canonical links and rendered-body text without trusting metadata."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.canonical_urls = []
        self.body_depth = 0
        self.body_text = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "link" and "canonical" in (attributes.get("rel") or "").split():
            href = attributes.get("href")
            if href:
                self.canonical_urls.append(href)
        if tag == "body":
            self.body_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag == "body" and self.body_depth:
            self.body_depth -= 1

    def handle_data(self, data: str) -> None:
        if self.body_depth:
            self.body_text.append(data)


def load_json(path: Path):
    with path.open(encoding="utf-8") as source_file:
        return json.load(source_file)


def normalize(text: str) -> str:
    return " ".join(text.split())


def validate_canonical_url(url: str) -> None:
    parsed = urlparse(url)
    assert parsed.scheme == "https"
    assert parsed.netloc == "ballkingdom.com"
    assert parsed.path.startswith("/")
    assert not parsed.params and not parsed.query and not parsed.fragment


def capture_path(relative_path: str) -> Path:
    requested_path = Path(relative_path)
    assert not requested_path.is_absolute(), "Evidence capture must be a relative path."
    assert ".." not in requested_path.parts, "Evidence capture must not traverse directories."
    candidate = (PACKAGE_DIR / requested_path).resolve()
    assert candidate.is_relative_to(CAPTURES_DIR.resolve()), "Evidence capture must be inside captures/."
    assert candidate.suffix == ".html", "Evidence capture must be an HTML file."
    assert candidate.is_file(), f"Missing evidence capture: {candidate}"
    return candidate


def main() -> None:
    claims = load_json(REGISTER_PATH)
    evidence_records = load_json(EVIDENCE_PATH)
    assert isinstance(claims, list) and claims, "Register must contain at least one claim."
    assert isinstance(evidence_records, list) and evidence_records

    evidence_by_id = {}
    for evidence in evidence_records:
        assert EVIDENCE_REQUIRED <= evidence.keys(), f"Missing evidence metadata in {evidence!r}"
        assert evidence["id"] not in evidence_by_id, f"Duplicate evidence id: {evidence['id']}"
        assert isinstance(evidence["capture_id"], str) and evidence["capture_id"].strip()
        validate_canonical_url(evidence["canonical_url"])
        date.fromisoformat(evidence["captured_on"])
        assert len(evidence["sha256"]) == 64 and all(
            character in "0123456789abcdef" for character in evidence["sha256"]
        )
        assert evidence["supporting_copy"].strip()
        evidence_by_id[evidence["id"]] = evidence

    seen_ids = set()
    for claim in claims:
        assert REQUIRED <= claim.keys(), f"Missing required fields in {claim!r}"
        assert claim["id"] not in seen_ids, f"Duplicate claim id: {claim['id']}"
        seen_ids.add(claim["id"])
        assert claim["availability"] in ALLOWED_AVAILABILITY
        assert claim["approved_copy"].strip()
        validate_canonical_url(claim["source_url"])
        assert claim["id"] in evidence_by_id, f"Missing evidence metadata for {claim['id']}"

        evidence = evidence_by_id[claim["id"]]
        assert claim["source_url"] == evidence["canonical_url"]
        assert claim["evidence_capture"] == evidence["capture_path"]
        assert normalize(claim["approved_copy"]) == normalize(evidence["supporting_copy"])

        path = capture_path(evidence["capture_path"])
        source_bytes = path.read_bytes()
        assert source_bytes.lstrip().lower().startswith(b"<!doctype html"), "Capture is not HTML."
        assert hashlib.sha256(source_bytes).hexdigest() == evidence["sha256"], "Capture digest mismatch."

        parser = CaptureParser()
        parser.feed(source_bytes.decode("utf-8"))
        parser.close()
        assert parser.canonical_urls == [evidence["canonical_url"]], "Capture canonical URL mismatch."
        assert normalize(evidence["supporting_copy"]) in normalize(" ".join(parser.body_text)), (
            "Approved copy must be visible in the captured document body."
        )

    assert set(evidence_by_id) == seen_ids, "Evidence metadata must map one-to-one to claims."


if __name__ == "__main__":
    main()
