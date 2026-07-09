#!/usr/bin/env python3
"""Optional OpenCV fallback for future high-precision crop detection.

The default pipeline uses Node + sharp so GitHub Pages updates stay simple.
If OpenCV/Pillow/pytesseract are installed locally, this file can be extended
to produce the same image-manifest.json shape as the Node pipeline.
"""

from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    print(f"Python fallback placeholder ready at {root}")
    print("Default production path: npm run hi:ingest")


if __name__ == "__main__":
    main()
