# Task 3 — Ballers Kingdom ecosystem film visual package and animatic

## Status

Round-1 source integrity fixes are complete and tested. Existing local media is
ignored and the prior voiced MP4 is superseded pending a fresh authorized-clone
generation and rerender; no upload, cloud generation, credential use, or
YouTube action occurred.

## Commits

- `f2c50c6` — pins the already-authorized Task 2 narration generator to `/Users/briankennedyjrm.ed/ai-toolkit/vendor/chatterbox-env/bin/python`, with a regression assertion for that exact runtime.
- Task 3 source/docs commit — visual package, local animatic renderer, schedule test, audit, and this report.

## Delivered source

- `video/ballers-kingdom-ecosystem-film/generate_narration.py` writes an
  `authorized-clone-manifest.json` only after successful local synthesis and
  master assembly. The manifest records contract, reference, pinned runtime,
  synthesis-script, per-beat, and master hashes/durations plus phrase timing.
- `video/ballers-kingdom-ecosystem-film/validate_authorized_narration.py`
  verifies that manifest against the current authorized local reference/runtime
  before a master may be mixed.
- `video/ballers-kingdom-ecosystem-film/generate_captions.py` and
  `render_graphics.mjs` validate and render one contract sentence/phrase at a
  time, rather than static beat paragraphs.
- `video/ballers-kingdom-ecosystem-film/render_animatic.sh` validates
  registered stock and narration provenance, offsets the community stock source
  by 12 seconds to prevent a repeated opening, renders the local 70-second
  animatic, and extracts chapter review frames. It has no provider, browser,
  credential, or upload call.
- `video/ballers-kingdom-ecosystem-film/shotlist.json` maps every locked beat to source, motion/lens, claim IDs, caption treatment, and rejection conditions.
- `video/ballers-kingdom-ecosystem-film/visual_audit.md` records visual
  provenance, stock exclusions, manifest/voice gate, phrase-caption review,
  and required post-render perceptual checks.
- `video/ballers-kingdom-ecosystem-film/test_animatic_schedule.py` asserts
  raw container and both stream durations within one 24fps frame, 1080p, 24fps,
  H.264/AAC, and exact beat alignment.

## Verification

- RED: `python3 video/ballers-kingdom-ecosystem-film/test_animatic_schedule.py` failed before any animatic existed.
- GREEN: `python3 video/ballers-kingdom-ecosystem-film/test_narration_contract.py`
  passes without touching the production `narration/` directory. It creates
  caption fixtures, stale-output checks, generated WAVs, manifest, and
  validation only in temporary directories.
- `bash -n`, `node --check`, and Python compilation pass for the updated
  renderer, captions, manifest validator, narration generator, and tests.
- `bash -n`, `node --check`, JSON parsing, and `git diff --check` pass.
- Opening/middle/ending review frames for every chapter were extracted and inspected. Captions are contract-derived, within the safe area, and no generated people, fake UI, fake claims, American-football content, or third-party brand closeups remain in the selected frames.

## Concerns / review gate

The attempted fresh local Brian narration generation used only the pinned,
authorized Chatterbox runtime and authorized reference. It was stopped before
any WAV completed after a sampling step took 74 seconds; no fallback runtime,
cloud provider, substitute voice, recovered clip, or fabricated manifest was
used. The only remaining Task 3 media work is to complete that authorized
generation, run `BALLERS_NARRATION_DIR=<fresh-output>
bash video/ballers-kingdom-ecosystem-film/render_animatic.sh`, then execute
the stream-duration test and record fresh manifest/master hashes, phrase-sync
perceptual review, representative frames, and final-tail audio QA.
