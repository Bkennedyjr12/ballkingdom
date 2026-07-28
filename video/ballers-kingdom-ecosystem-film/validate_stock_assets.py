#!/usr/bin/env python3
"""Verify ignored local stock media against the committed identity manifest."""

import hashlib
import json
from pathlib import Path


PACKAGE_DIR = Path(__file__).resolve().parent
REPO_ROOT = PACKAGE_DIR.parents[1]
MANIFEST_PATH = PACKAGE_DIR / "stock_asset_evidence.json"


def main() -> None:
    assets = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    assert isinstance(assets, list) and assets
    for asset in assets:
        path = (PACKAGE_DIR / asset["local_path"]).resolve()
        assert path.is_relative_to(REPO_ROOT.resolve())
        assert path.suffix == ".mp4" and path.is_file(), f"Missing approved stock asset: {path}"
        assert hashlib.sha256(path.read_bytes()).hexdigest() == asset["sha256"], (
            f"Stock asset digest mismatch: {asset['id']}"
        )


if __name__ == "__main__":
    main()
