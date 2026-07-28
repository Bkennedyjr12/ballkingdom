# Task 3 — Ballers Kingdom ecosystem film visual package and animatic

## Status

Source package complete and locally verified. `ecosystem-animatic.mp4`, graphics, thumbnails, and frame-extraction media are ignored local review outputs; no upload, cloud generation, credential use, or YouTube action occurred.

## Commits

- `f2c50c6` — pins the already-authorized Task 2 narration generator to `/Users/briankennedyjrm.ed/ai-toolkit/vendor/chatterbox-env/bin/python`, with a regression assertion for that exact runtime.
- Task 3 source/docs commit — visual package, local animatic renderer, schedule test, audit, and this report.

## Delivered source

- `video/ballers-kingdom-ecosystem-film/render_graphics.mjs` validates the generated SRT against `narration_contract.json` and rasterizes only post-production typography/CTA graphics.
- `video/ballers-kingdom-ecosystem-film/render_animatic.sh` validates registered stock, regenerates locked captions, renders the local 70-second animatic, and extracts chapter review frames. It has no provider, browser, credential, or upload call.
- `video/ballers-kingdom-ecosystem-film/shotlist.json` maps every locked beat to source, motion/lens, claim IDs, caption treatment, and rejection conditions.
- `video/ballers-kingdom-ecosystem-film/visual_audit.md` records visual provenance, stock exclusions, chapter-frame checks, and the audio limitation.
- `video/ballers-kingdom-ecosystem-film/test_animatic_schedule.py` asserts duration, 1080p, 24fps, H.264/AAC, and exact beat alignment.

## Verification

- RED: `python3 video/ballers-kingdom-ecosystem-film/test_animatic_schedule.py` failed before any animatic existed.
- GREEN: `bash video/ballers-kingdom-ecosystem-film/render_animatic.sh && python3 video/ballers-kingdom-ecosystem-film/test_animatic_schedule.py` produced a 70.000-second, 1920×1080, 24fps H.264/AAC MP4 with exact contract beat order.
- `python3 video/ballers-kingdom-ecosystem-film/test_narration_contract.py` passes, including the pinned-runtime regression.
- `bash -n`, `node --check`, JSON parsing, and `git diff --check` pass.
- Opening/middle/ending review frames for every chapter were extracted and inspected. Captions are contract-derived, within the safe area, and no generated people, fake UI, fake claims, American-football content, or third-party brand closeups remain in the selected frames.

## Concerns / review gate

The attempted local Brian narration generation used only the now-pinned, authorized Chatterbox runtime and authorized reference. Root cause: resolving the approved venv symlink escaped the venv and lost its `perth` dependency; the launcher now preserves the exact approved executable path and regression-tests both that command and override resistance. Per the no-fallback rule, the animatic has an intentional original low music/room-tone bed but **no substitute narration**; a controlled later pass must generate/validate the authorized master, then rerun `render_animatic.sh` before external or paid-scene review.
