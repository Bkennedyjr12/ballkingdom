# Ballers Kingdom ecosystem film — review-master QA

**Master:** `final-review/ballers-kingdom-ecosystem-review.mp4` (ignored local
review media; not public or final-release media)

**Source lock:** `ecosystem-animatic.mp4`, the approved fresh r3
manifest-backed animatic only. `render_review_master.sh` has no narration or
visual generation path and no provider, browser, credential, web, or upload
operation. Before assembly it hard-gates
`narration/r3-authorized/authorized-clone-manifest.json` through
`validate_authorized_narration.py`; r1/r2/default narration cannot be selected.

## Technical result

| Check | Result |
| --- | --- |
| Container/runtime | MP4; 70.000 s container, video, and audio streams |
| Video | H.264, 1920×1080, 24/1 fps, yuv420p |
| Audio | AAC LC, 48 kHz, stereo; full decode completed without FFmpeg errors |
| Local master SHA-256 | `cb8e50f3d2572062966aaf28bd3a3b74396035fd6c738db6ea57edba6420291b` |
| r3 narration master SHA-256 | `c274b08f42c093300b1ed6a50354463567e650139fef9d89fdb0319d8b5c083c` (matches r3 manifest) |
| Final 60–70 s audio | mean −21.8 dB; peak −0.7 dB; exceeds the QA floor of −42 dB |
| Black/frozen-frame scan | PASS: no `blackdetect` segment at or above 0.25 s; 70 one-second video samples had no adjacent identical frame hashes |

The scripted source gate also passed the stock-binary identity validator. The
only stock source in the approved animatic is the registered `pexels-6084027`
generic soccer-training cutaway; the register excludes American-football
footage and the other rejected stock clips.

## Narration, captions, and claims

- `test_master_qa.py` checks all 17 r3 manifest-bound phrase cues against
  `narration_contract.json` and the r3 SRT: caption text exactly equals the
  locked narration phrase list, in order.
- The r3 manifest, phrase-alignment artifact, and narration master all passed
  provenance validation. Phrase timing is the retained r3
  `ffmpeg-silencedetect` alignment, not word-count estimates.
- `validate_claim_register.py` passed. The only factual product copy is
  limited to `consulting-framework`, `brand-positioning`, and
  `training-offer`, with source captures and exact approved text in
  `claim_evidence.md` / `claim_register.json`.
- Contact-sheet frames at 1, 17, 35, 45, 57, 65, and 68 seconds were reviewed.
  They show the authorized coach anchor or generic soccer cones/practice only;
  no American-football footage, third-party brand close-up, fabricated UI, or
  unsupported on-screen claim was observed. Captions are high-contrast,
  post-composited, within the lower safe area, and do not cover the coach's
  face.

## CTA resolution

At 65 seconds the exact on-screen and spoken CTA is readable:
`Choose your path at ballkingdom.com.` The phrase cue runs 64.177–66.560 s,
then the 48 kHz stereo music/room-tone bed persists through the 70-second
visual hold and fade. The measured final-ten-second level and no-black/no-freeze
scan confirm an intentional audible ending rather than dead air or a cut-to-
black tail.

## Commands run

```bash
bash video/ballers-kingdom-ecosystem-film/render_review_master.sh
python3 video/ballers-kingdom-ecosystem-film/test_master_qa.py
python3 video/ballers-kingdom-ecosystem-film/validate_claim_register.py
python3 video/ballers-kingdom-ecosystem-film/test_animatic_schedule.py
ffmpeg -v error -i final-review/ballers-kingdom-ecosystem-review.mp4 -map 0 -f null -
```

All commands above completed successfully. No upload or external distribution
occurred.
