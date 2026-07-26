#!/usr/bin/env python3
"""Upload the QA-passed Ballers Kingdom review master as unlisted only."""
from __future__ import annotations

import json
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload


HOME = Path.home()
ROOT = Path(__file__).resolve().parent
TOKEN = HOME / ".local/share/ballers-kingdom-youtube-oauth/token.json"
VIDEO = ROOT / "final-review/ballers-kingdom-the-standard-starts-here-review.mp4"
THUMBNAIL = ROOT / "final-review/ballers-kingdom-the-standard-starts-here-thumb.jpg"
RECEIPT = ROOT / "final-review/youtube-receipt.json"
SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.force-ssl",
]
TITLE = "The Standard Starts Here | The Ballers Kingdom"
DESCRIPTION = """The standard starts before game time.

The Ballers Kingdom is about the reps, discipline, and community that help young athletes grow on and off the field.

Build Your Kingdom: https://ballkingdom.com

This unlisted review cut uses licensed stock footage and a post-produced title card. It is not a public release.
"""
TAGS = ["The Ballers Kingdom", "soccer training", "youth soccer", "soccer development", "athlete development", "soccer drills"]


def service():
    if not TOKEN.is_file():
        raise SystemExit("Ballers Kingdom OAuth token is unavailable.")
    creds = Credentials.from_authorized_user_file(str(TOKEN), SCOPES)
    if not creds.valid:
        if not (creds.expired and creds.refresh_token):
            raise SystemExit("Ballers Kingdom OAuth needs re-consent.")
        creds.refresh(Request())
        TOKEN.write_text(creds.to_json(), encoding="utf-8")
        TOKEN.chmod(0o600)
    return build("youtube", "v3", credentials=creds)


def main() -> None:
    if not VIDEO.is_file() or not THUMBNAIL.is_file():
        raise SystemExit("QA-passed review master or thumbnail is missing.")
    yt = service()
    channel = yt.channels().list(part="snippet", mine=True).execute()
    items = channel.get("items", [])
    if len(items) != 1:
        raise SystemExit("Expected exactly one authenticated YouTube channel.")
    channel_title = items[0]["snippet"]["title"]
    if "ballers" not in channel_title.lower():
        raise SystemExit(f"Refusing upload: authenticated channel is {channel_title!r}, not Ballers Kingdom.")

    body = {
        "snippet": {"title": TITLE, "description": DESCRIPTION, "tags": TAGS, "categoryId": "17"},
        "status": {"privacyStatus": "unlisted", "selfDeclaredMadeForKids": False},
    }
    media = MediaFileUpload(str(VIDEO), chunksize=-1, resumable=True, mimetype="video/mp4")
    request = yt.videos().insert(part="snippet,status", body=body, media_body=media)
    response = None
    while response is None:
        status, response = request.next_chunk()
        if status:
            print(f"upload={int(status.progress() * 100)}%", flush=True)
    video_id = response["id"]
    yt.thumbnails().set(videoId=video_id, media_body=MediaFileUpload(str(THUMBNAIL), mimetype="image/jpeg")).execute()
    verify = yt.videos().list(part="snippet,status", id=video_id).execute()["items"][0]
    if verify["status"]["privacyStatus"] != "unlisted":
        raise SystemExit("Upload completed but privacy was not unlisted.")
    receipt = {
        "video_id": video_id,
        "url": f"https://youtu.be/{video_id}",
        "privacy_status": verify["status"]["privacyStatus"],
        "title": verify["snippet"]["title"],
        "channel_title": channel_title,
        "thumbnail_set": True,
    }
    RECEIPT.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt), flush=True)


if __name__ == "__main__":
    main()
