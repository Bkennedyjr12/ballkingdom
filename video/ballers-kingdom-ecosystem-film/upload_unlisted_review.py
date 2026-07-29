#!/usr/bin/env python3
"""Upload the QA-passed Ballers Kingdom review master as unlisted only."""

from __future__ import annotations

import hashlib
import json
import os
import stat
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path


PACKAGE = Path(__file__).resolve().parent
ROOT = PACKAGE.parents[1]
HOME = Path.home()
MASTER = PACKAGE / "final-review/ballers-kingdom-ecosystem-review.mp4"
THUMBNAIL = PACKAGE / "final-review/ballers-kingdom-ecosystem-review-thumb.png"
RECEIPT = PACKAGE / "final-review/youtube-receipt.json"
PROTECTED_TOKEN = HOME / ".local/share/ballers-kingdom-youtube-oauth/token.json"
TITLE = "Ballers Kingdom | The Ecosystem Film — Review Cut"
DESCRIPTION = (
    "Private review cut for Ballers Kingdom.\n\n"
    "Choose your path at ballkingdom.com."
)
PROCESSING_TIMEOUT_SECONDS = 300
PROCESSING_POLL_SECONDS = 5


class UploadIncompleteError(RuntimeError):
    """An external upload exists but post-upload verification did not finish."""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def utc_timestamp() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def require_file(path: Path, label: str) -> None:
    if not path.is_file() or path.stat().st_size == 0:
        raise RuntimeError(f"Required {label} is missing or empty: {path}")


def run_master_qa() -> None:
    result = subprocess.run(
        [sys.executable, str(PACKAGE / "test_master_qa.py")],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(f"QA master guard failed: {detail}")


def token_path() -> Path:
    if PROTECTED_TOKEN.is_symlink():
        raise RuntimeError("The protected token path must not be a symlink.")
    resolved = PROTECTED_TOKEN.resolve()
    try:
        resolved.relative_to(ROOT)
    except ValueError:
        pass
    else:
        raise RuntimeError("The protected token must be outside this repository.")
    require_file(resolved, "protected OAuth token")
    metadata = resolved.stat()
    if metadata.st_uid != os.getuid() or stat.S_IMODE(metadata.st_mode) & 0o077:
        raise RuntimeError("The protected OAuth token must be user-owned and not group/world accessible.")
    return resolved


def build_client(protected_token: Path):
    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build
    except ImportError as error:
        raise RuntimeError("Google API client dependencies are unavailable in this Python environment.") from error

    credentials = Credentials.from_authorized_user_file(str(protected_token))
    if not credentials.token:
        raise RuntimeError("The protected Ballers OAuth token is absent.")
    if credentials.expired:
        if not credentials.refresh_token:
            raise RuntimeError("The protected Ballers OAuth token is expired and cannot be refreshed.")
        credentials.refresh(Request())
    if not credentials.valid:
        raise RuntimeError("The protected Ballers OAuth session is not valid after refresh.")
    return build("youtube", "v3", credentials=credentials, cache_discovery=False)


def verified_channel(client) -> dict[str, str]:
    response = client.channels().list(part="snippet", mine=True).execute()
    channels = response.get("items", [])
    if len(channels) != 1:
        raise RuntimeError("Expected exactly one authenticated channel for the protected Ballers token.")
    channel = channels[0]
    channel_id = str(channel.get("id", ""))
    channel_title = str(channel.get("snippet", {}).get("title", ""))
    if not channel_id or "ballers" not in channel_title.casefold():
        raise RuntimeError("Authenticated account is not an authorized Ballers channel.")
    return {"id": channel_id, "title": channel_title}


def video_state(client, video_id: str) -> dict[str, object]:
    response = client.videos().list(part="snippet,status,processingDetails", id=video_id).execute()
    videos = response.get("items", [])
    if len(videos) != 1:
        raise UploadIncompleteError(f"Uploaded video {video_id} could not be read back for verification.")
    return videos[0]


def verify_metadata(video: dict[str, object]) -> str:
    snippet = video.get("snippet", {})
    status = video.get("status", {})
    if snippet.get("title") != TITLE or not str(snippet.get("title", "")).startswith("Ballers Kingdom"):
        raise UploadIncompleteError("Uploaded video title verification failed.")
    if status.get("privacyStatus") != "unlisted":
        raise UploadIncompleteError("Uploaded video privacy verification failed; it is not unlisted.")
    if not snippet.get("thumbnails"):
        raise UploadIncompleteError("Uploaded thumbnail verification failed.")
    return str(video.get("processingDetails", {}).get("processingStatus", "unknown"))


def wait_for_processed(client, video_id: str) -> dict[str, object]:
    deadline = time.monotonic() + PROCESSING_TIMEOUT_SECONDS
    while True:
        video = video_state(client, video_id)
        processing_status = verify_metadata(video)
        if processing_status == "succeeded":
            return video
        if processing_status in {"failed", "terminated"}:
            raise UploadIncompleteError(f"Uploaded video {video_id} processing ended with status: {processing_status}.")
        if time.monotonic() >= deadline:
            raise UploadIncompleteError(f"Uploaded video {video_id} did not finish processing within {PROCESSING_TIMEOUT_SECONDS} seconds.")
        time.sleep(PROCESSING_POLL_SECONDS)


def write_receipt(receipt: dict[str, object]) -> None:
    temporary = RECEIPT.with_suffix(".tmp")
    temporary.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(RECEIPT)


def main() -> None:
    if RECEIPT.exists():
        raise RuntimeError("A prior review receipt exists; refusing another upload to avoid a duplicate review video.")
    require_file(MASTER, "QA review master")
    require_file(THUMBNAIL, "QA thumbnail")
    run_master_qa()
    master_hash = sha256_file(MASTER)
    thumbnail_hash = sha256_file(THUMBNAIL)

    protected_token = token_path()
    client = build_client(protected_token)
    channel = verified_channel(client)

    try:
        from googleapiclient.http import MediaFileUpload
    except ImportError as error:
        raise RuntimeError("Google API media upload support is unavailable in this Python environment.") from error

    response = client.videos().insert(
        part="snippet,status",
        body={
            "snippet": {"title": TITLE, "description": DESCRIPTION},
            "status": {"privacyStatus": "unlisted", "selfDeclaredMadeForKids": False},
        },
        media_body=MediaFileUpload(str(MASTER), mimetype="video/mp4", resumable=False),
    ).execute()
    video_id = str(response.get("id", ""))
    if not video_id:
        raise RuntimeError("Upload response did not include a video ID.")

    try:
        client.thumbnails().set(
            videoId=video_id,
            media_body=MediaFileUpload(str(THUMBNAIL), mimetype="image/png", resumable=False),
        ).execute()
        video = wait_for_processed(client, video_id)
    except UploadIncompleteError:
        raise
    except Exception as error:
        raise UploadIncompleteError(f"Uploaded video {video_id} requires manual verification: {error}") from error

    receipt = {
        "schema_version": 1,
        "video_id": video_id,
        "url": f"https://www.youtube.com/watch?v={video_id}",
        "title": TITLE,
        "privacy_status": video["status"]["privacyStatus"],
        "processing_status": video["processingDetails"]["processingStatus"],
        "channel_verification": {"verified": True, **channel},
        "master": {"path": str(MASTER.relative_to(PACKAGE)), "sha256": master_hash, "bytes": MASTER.stat().st_size},
        "thumbnail": {"path": str(THUMBNAIL.relative_to(PACKAGE)), "sha256": thumbnail_hash, "bytes": THUMBNAIL.stat().st_size},
        "uploaded_at": utc_timestamp(),
    }
    write_receipt(receipt)
    print(json.dumps({"video_id": video_id, "url": receipt["url"], "privacy_status": receipt["privacy_status"]}, sort_keys=True))


if __name__ == "__main__":
    main()
