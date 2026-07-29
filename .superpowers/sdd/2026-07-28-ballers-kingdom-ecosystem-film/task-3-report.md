# Task 3 — Ballers Kingdom ecosystem film visual package and animatic

## Status

Round-1 source integrity fixes are complete and tested. A fresh local,
manifest-attested authorized-clone master has been rendered into the ignored
review MP4. No upload, cloud generation, credential use, or YouTube action
occurred.

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
  by 4 seconds without looping a seeked H.264 stream, renders the local 70-second
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

The fresh r3 generation, provenance validation, render, and QA evidence below
close the local-review gate. No fallback runtime, cloud provider, substitute
voice, recovered clip, fabricated manifest, upload, or external distribution
was used.

## Fresh r3 render evidence — 2026-07-29

- Authorized local narration directory:
  video/ballers-kingdom-ecosystem-film/narration/r3-authorized/
- validate_authorized_narration.py passed against its
  authorized-clone-manifest.json. The manifest attests the locked contract,
  authorized Brian reference, pinned runtime, synthesis script, all five beat
  WAV hashes/durations, and assembled master hash.
- Master SHA-256:
  c274b08f42c093300b1ed6a50354463567e650139fef9d89fdb0319d8b5c083c;
  master duration: 70.000s.
- Beat durations (all inside their locked windows): foundation 10.840s,
  whole-person-promise 14.560s, verified-paths 21.080s, community 5.800s,
  CTA 2.560s.
- Render output:
  video/ballers-kingdom-ecosystem-film/ecosystem-animatic.mp4 is H.264/AAC,
  1920×1080, 24fps; container, video stream, and audio stream each probe at
  70.000s. test_animatic_schedule.py passed.
- Caption QA: 17 phrase cues exactly reconstruct the locked caption_phrases;
  every cue is ordered and contained inside its measured spoken window.
  Opening, verified-paths, and CTA review frames were inspected; the CTA card
  is visible at 65s, soccer-only imagery is retained, and no third-party brand
  or fabricated UI/copy was observed.
- Tail QA (64–70s): -22.9 dB mean / -3.0 dB peak, confirming audible CTA
  resolution without dead air.
- Renderer regression fix: a -ss 12 plus -stream_loop -1 community input
  produced non-monotonic H.264 DTS and failed full compositing. The renderer
  now takes a non-looped 8s segment at 4s; test_stock_offset_regression.py
  reproduces the unsafe timestamp warning and guards the safe replacement.

## Audible phrase-boundary evidence — 2026-07-29

- The former word-count cue estimates are no longer used for manifest-backed
  captions. align_phrase_cues.py validates the r3 WAVs with the local
  silencedetect method at -35 dB for at least 0.12s, and fails closed unless
  every retained phrase start/end anchor is an observed silence boundary.
- The resulting ignored phrase-alignment.json is bound to the r3 master and
  contract hash, then its SHA-256 is written into authorized-clone-manifest.json.
  Artifact SHA-256: 5c7b8a427c885a370342547f335e23bcde28990def3bdf15a1d4f53fcb6afec2.
- generate_captions.py refuses a manifest-backed render if that artifact or
  its digest/master/contract binding is unavailable. The aligned-caption
  rerender passed test_animatic_schedule.py with exact 70.000s streams.
