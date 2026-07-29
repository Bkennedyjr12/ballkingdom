#!/usr/bin/env python3
"""Guard the H.264 seek-plus-loop timestamp regression in the animatic source."""
from __future__ import annotations

import subprocess
from pathlib import Path


PACKAGE = Path(__file__).resolve().parent
RENDERER = PACKAGE / "render_animatic.sh"
STOCK = PACKAGE.parent / "ballers-kingdom-standard-starts-here" / "stock" / "pexels-6084027.mp4"


def probe(arguments: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["ffmpeg", "-hide_banner", "-v", "warning", *arguments, "-map", "0:v", "-f", "null", "-"],
        check=False,
        capture_output=True,
        text=True,
    )


def main() -> None:
    renderer = RENDERER.read_text(encoding="utf-8")
    assert "-ss 12 -stream_loop -1" not in renderer
    assert '-ss 4 -t 8 -i "$stock"' in renderer

    baseline = probe(["-stream_loop", "-1", "-t", "22", "-i", str(STOCK)])
    assert baseline.returncode == 0
    assert "non monotonically increasing dts" not in baseline.stderr

    unsafe = probe(["-ss", "12", "-stream_loop", "-1", "-t", "8", "-i", str(STOCK)])
    assert unsafe.returncode == 0
    assert "non monotonically increasing dts" in unsafe.stderr

    safe = probe(["-ss", "4", "-t", "8", "-i", str(STOCK)])
    assert safe.returncode == 0
    assert "non monotonically increasing dts" not in safe.stderr
    print("stock offset regression: PASS")


if __name__ == "__main__":
    main()
