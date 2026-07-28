# Ballers Kingdom Ecosystem Film Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 70-second, 1080p, founder-manifesto-to-product-proof Ballers Kingdom master with synchronized authorized voiceover, captions, verified product claims, and an unlisted-review upload gate.

**Architecture:** A new `video/ballers-kingdom-ecosystem-film/` package keeps source contracts, claim evidence, deterministic graphics, narration generation, assembly, and QA separate. The film is assembled only from the approved Brian reference, independently verified live Ballers captures, licensed soccer/community assets, and post-composited typography; generated media is optional and fails closed on visual defects.

**Tech Stack:** Bash, Python 3, Node.js with Sharp, FFmpeg/ffprobe, Playwright capture tooling, Google Cloud Text-to-Speech or the existing authorized Brian voice lane, YouTube Data API.

## Global Constraints

- Master runtime is 70 seconds ±1 second, 1920×1080, 24 fps, H.264/AAC.
- Use Brian’s already authorized professional cloned voice only for local/unlisted review.
- The final narration contract is the single source of truth for both voice and captions.
- Every product/service claim must have current public-surface evidence recorded before it is scripted.
- Do not reuse Manus-provided footage, narration, captions, scripts, avatars, or unverified claims.
- Use real Ballers captures rather than invented UI; state unfinished paths as being built.
- Reject any footage with American football, readable third-party branding, malformed anatomy, fake text, or misleading context.
- Upload only to The Ballers Kingdom as unlisted after QA. Delete no existing YouTube video without an explicitly confirmed replacement and user authorization.

---

### Task 1: Establish the verified claim and asset register

**Files:**
- Create: `video/ballers-kingdom-ecosystem-film/claim_register.json`
- Create: `video/ballers-kingdom-ecosystem-film/claim_evidence.md`
- Create: `video/ballers-kingdom-ecosystem-film/asset_register.md`
- Test: `video/ballers-kingdom-ecosystem-film/validate_claim_register.py`

**Interfaces:**
- Consumes: current public Ballers Kingdom pages and existing authorized Brian reference assets.
- Produces: `claim_register.json` with `{id, approved_copy, source_url, evidence_capture, availability}` records; later tasks may use only `availability: "verified-live"` claims or explicitly word `availability: "being-built"` claims.

- [ ] **Step 1: Write the failing register validator**

```python
required = {"id", "approved_copy", "source_url", "evidence_capture", "availability"}
for claim in claims:
    assert required <= claim.keys()
    assert claim["availability"] in {"verified-live", "being-built"}
    assert claim["approved_copy"].strip()
    assert claim["source_url"].startswith("https://ballkingdom.com")
```

- [ ] **Step 2: Run the validator before a register exists**

Run: `python3 video/ballers-kingdom-ecosystem-film/validate_claim_register.py`

Expected: FAIL because `claim_register.json` is missing.

- [ ] **Step 3: Capture and record current Ballers evidence**

Use authenticated-free, read-only public captures only. Add one evidence row per supported path; record exact page URL, capture filename, date, visible copy, and availability. Do not infer support from Manus documentation.

```json
{
  "id": "training",
  "approved_copy": "Soccer training built around disciplined development.",
  "source_url": "https://ballkingdom.com/<verified-path>",
  "evidence_capture": "captures/training.png",
  "availability": "verified-live"
}
```

- [ ] **Step 4: Add the asset register**

For each asset write its source, license/authorization, intended beat, and rejection condition. Brian’s reference is `assets/img/brian_coach_clean_anchor_v2.png`; only use previously approved licensed soccer footage or newly documented licensed footage.

- [ ] **Step 5: Run the validator and inspect evidence links**

Run: `python3 video/ballers-kingdom-ecosystem-film/validate_claim_register.py`

Expected: PASS and every claim has a public Ballers URL, current capture, and allowed availability value.

- [ ] **Step 6: Commit**

```bash
git add video/ballers-kingdom-ecosystem-film/claim_register.json \
  video/ballers-kingdom-ecosystem-film/claim_evidence.md \
  video/ballers-kingdom-ecosystem-film/asset_register.md \
  video/ballers-kingdom-ecosystem-film/validate_claim_register.py
git commit -m "Verify Ballers ecosystem film claims"
```

### Task 2: Lock the 70-second script, voice, and caption contract

**Files:**
- Create: `video/ballers-kingdom-ecosystem-film/narration_contract.json`
- Create: `video/ballers-kingdom-ecosystem-film/script.md`
- Create: `video/ballers-kingdom-ecosystem-film/generate_narration.py`
- Create: `video/ballers-kingdom-ecosystem-film/generate_captions.py`
- Test: `video/ballers-kingdom-ecosystem-film/test_narration_contract.py`

**Interfaces:**
- Consumes: Task 1’s verified `approved_copy` fields.
- Produces: `narration_contract.json` with `{id, start_seconds, duration_seconds, text, visual_claim_ids}` beats totaling 70 seconds; local ignored `narration/narration.wav`, `.srt`, and `.vtt` outputs.

- [ ] **Step 1: Write the failing timing and claim-link test**

```python
assert contract["runtime_seconds"] == 70
assert sum(beat["duration_seconds"] for beat in contract["beats"]) == 70
assert all(beat["text"] for beat in contract["beats"])
assert all(claim_id in approved_claim_ids for beat in contract["beats"] for claim_id in beat["visual_claim_ids"])
```

- [ ] **Step 2: Run it before contracts exist**

Run: `python3 video/ballers-kingdom-ecosystem-film/test_narration_contract.py`

Expected: FAIL because the narration contract is missing.

- [ ] **Step 3: Author the exact founder-manifesto-to-product-proof script**

Use these fixed beat boundaries: 00–16 foundation, 16–34 whole-person promise, 34–56 verified paths, 56–70 community/CTA. Every spoken product statement must map to a Task 1 claim ID. The last beat must say exactly `Choose your path at ballkingdom.com.`

- [ ] **Step 4: Implement narration and caption generation from one contract**

`generate_narration.py` must refuse non-authorized voice references and write only to ignored local media. `generate_captions.py` must create captions directly from `beat["text"]`, using the beat start/duration values; it must not contain duplicated caption copy.

- [ ] **Step 5: Generate a local voice sample and compare text**

Run: `python3 video/ballers-kingdom-ecosystem-film/generate_narration.py --sample foundation`

Expected: one local review sample using the authorized Brian lane, with no provider credential output.

- [ ] **Step 6: Run timing/caption contract tests**

Run: `python3 video/ballers-kingdom-ecosystem-film/test_narration_contract.py`

Expected: PASS; exact 70-second schedule and caption strings match narration strings.

- [ ] **Step 7: Commit**

```bash
git add video/ballers-kingdom-ecosystem-film/narration_contract.json \
  video/ballers-kingdom-ecosystem-film/script.md \
  video/ballers-kingdom-ecosystem-film/generate_narration.py \
  video/ballers-kingdom-ecosystem-film/generate_captions.py \
  video/ballers-kingdom-ecosystem-film/test_narration_contract.py
git commit -m "Lock Ballers ecosystem narration contract"
```

### Task 3: Build the approved visual package and animatic

**Files:**
- Create: `video/ballers-kingdom-ecosystem-film/render_graphics.mjs`
- Create: `video/ballers-kingdom-ecosystem-film/render_animatic.sh`
- Create: `video/ballers-kingdom-ecosystem-film/shotlist.json`
- Create: `video/ballers-kingdom-ecosystem-film/visual_audit.md`
- Test: `video/ballers-kingdom-ecosystem-film/test_animatic_schedule.py`

**Interfaces:**
- Consumes: Tasks 1–2 registers, captures, assets, and beat schedule.
- Produces: local ignored `ecosystem-animatic.mp4`, review frames, and a shotlist tied to each beat ID.

- [ ] **Step 1: Write the failing animatic schedule test**

```python
assert probe["duration_seconds"] == 70
assert probe["width"] == 1920 and probe["height"] == 1080
assert probe["fps"] == 24
assert [shot["beat_id"] for shot in shotlist] == [beat["id"] for beat in contract["beats"]]
```

- [ ] **Step 2: Run it before renderer assets exist**

Run: `python3 video/ballers-kingdom-ecosystem-film/test_animatic_schedule.py`

Expected: FAIL because the animatic does not exist.

- [ ] **Step 3: Create the shotlist and graphics renderer**

Specify lens/motion, visual source, claim IDs, caption treatment, and rejection condition per shot. `render_graphics.mjs` must create only post-production typography and CTA graphics. It must read the narration contract rather than duplicating lines.

- [ ] **Step 4: Assemble the local animatic**

`render_animatic.sh` must concatenate the approved source stills/captures/footage at the contract timings, place captions from generated `.srt`, and include the actual authorized voice sample and a low music bed. It must never call a video-generation or upload provider.

- [ ] **Step 5: Run schedule and technical tests**

Run: `bash video/ballers-kingdom-ecosystem-film/render_animatic.sh && python3 video/ballers-kingdom-ecosystem-film/test_animatic_schedule.py`

Expected: PASS; 70 seconds, 1080p/24fps, AAC audio, readable post-composited text, and aligned narration.

- [ ] **Step 6: Frame-audit the animatic**

Extract opening, middle, and ending frames for every chapter. Record rejected assets in `visual_audit.md`; replace them before review. The record must explicitly check for non-soccer sport footage, third-party brands, fake text, and excessive caption scale.

- [ ] **Step 7: Commit**

```bash
git add video/ballers-kingdom-ecosystem-film/render_graphics.mjs \
  video/ballers-kingdom-ecosystem-film/render_animatic.sh \
  video/ballers-kingdom-ecosystem-film/shotlist.json \
  video/ballers-kingdom-ecosystem-film/visual_audit.md \
  video/ballers-kingdom-ecosystem-film/test_animatic_schedule.py
git commit -m "Build Ballers ecosystem film animatic"
```

### Task 4: Create the polished review master and quality report

**Files:**
- Create: `video/ballers-kingdom-ecosystem-film/render_review_master.sh`
- Create: `video/ballers-kingdom-ecosystem-film/quality_report.md`
- Create: `video/ballers-kingdom-ecosystem-film/test_master_qa.py`

**Interfaces:**
- Consumes: approved Task 3 animatic structure, Task 2 full narration/captions, and Task 1 asset register.
- Produces: local ignored `final-review/ballers-kingdom-ecosystem-review.mp4` and thumbnail.

- [ ] **Step 1: Write the failing master QA test**

```python
assert metadata == {"width": 1920, "height": 1080, "fps": 24, "duration_seconds": 70}
assert {"h264", "aac"} <= codecs
assert caption_text == narration_text
assert final_ten_seconds_mean_db > -42
```

- [ ] **Step 2: Run it before a master exists**

Run: `python3 video/ballers-kingdom-ecosystem-film/test_master_qa.py`

Expected: FAIL because the review master is missing.

- [ ] **Step 3: Implement deterministic final assembly**

`render_review_master.sh` must use the approved asset register only, normalize sources to 1080p/24fps, mix narration above music, render caption graphics from the same contract, create an intentional 56–70 CTA resolution, and place all local outputs in ignored directories.

- [ ] **Step 4: Run full master QA**

Run: `bash video/ballers-kingdom-ecosystem-film/render_review_master.sh && python3 video/ballers-kingdom-ecosystem-film/test_master_qa.py`

Expected: PASS; all technical and copy-alignment assertions pass.

- [ ] **Step 5: Complete perceptual review evidence**

Record runtime, codecs, loudness windows, caption/narration alignment, frame contact sheet results, claim evidence references, and final CTA readability in `quality_report.md`. Any failed source must be excluded rather than hidden.

- [ ] **Step 6: Commit**

```bash
git add video/ballers-kingdom-ecosystem-film/render_review_master.sh \
  video/ballers-kingdom-ecosystem-film/quality_report.md \
  video/ballers-kingdom-ecosystem-film/test_master_qa.py
git commit -m "Add Ballers ecosystem review master QA"
```

### Task 5: Guarded unlisted publication and receipt

**Files:**
- Create: `video/ballers-kingdom-ecosystem-film/upload_unlisted_review.py`
- Create: `video/ballers-kingdom-ecosystem-film/test_upload_guard.py`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Task 4 QA-passed master and thumbnail plus the existing Ballers-only OAuth token outside the repository.
- Produces: ignored `final-review/youtube-receipt.json` only after verified unlisted upload.

- [ ] **Step 1: Write the failing upload-guard test**

```python
assert "privacyStatus\": \"unlisted\"" in source
assert "ballers" in source.lower()
assert "youtube" not in narration_source.lower()
assert "delete" not in source.lower()
```

- [ ] **Step 2: Run it before uploader exists**

Run: `python3 video/ballers-kingdom-ecosystem-film/test_upload_guard.py`

Expected: FAIL because the upload script is missing.

- [ ] **Step 3: Implement the guarded uploader**

Require the QA master and thumbnail, load only the existing Ballers OAuth token from the user’s protected local directory, verify the authenticated channel title contains `Ballers`, set `privacyStatus` to `unlisted`, set the thumbnail, then query title/privacy/processing status and write an ignored receipt. Do not include deletion capability.

- [ ] **Step 4: Run local guard tests**

Run: `python3 video/ballers-kingdom-ecosystem-film/test_upload_guard.py`

Expected: PASS; no token or credential is stored in the repository and upload is unlisted-only.

- [ ] **Step 5: Commit before external upload**

```bash
git add .gitignore video/ballers-kingdom-ecosystem-film/upload_unlisted_review.py \
  video/ballers-kingdom-ecosystem-film/test_upload_guard.py
git commit -m "Add guarded Ballers ecosystem review upload"
```

- [ ] **Step 6: Upload only after Brian confirms the QA master**

Run the uploader with the protected Ballers OAuth session. Confirm the returned channel, title, unlisted privacy, thumbnail, and processed status. If the new master replaces an existing video, stop and ask Brian to identify the exact older video for deletion.

## Plan Self-Review

- Spec coverage: Tasks 1–5 cover verified claims/assets, exact voice/caption contract, founder-manifesto visual package, 70-second QA master, and unlisted publication safeguards.
- Placeholder scan: no implementation placeholders, generic error-handling instructions, or unresolved requirements remain.
- Interface consistency: all assembly and caption tasks consume `narration_contract.json`; all product language is gated by `claim_register.json`; all upload work consumes only Task 4 outputs.
