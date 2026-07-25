# The Ballers Kingdom Flagship Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce, QA, and publicly publish a 42-second cinematic flagship video, “Building Ballers. Advancing Kingdoms.”, for The Ballers Kingdom YouTube channel.

**Architecture:** `video-engine` produces the durable creative/production package from a versioned JSON brief. A local review master is assembled from authorized Ballers Kingdom assets and generated or licensed scene media, then validated mechanically and perceptually before a single public upload through the owner-authorized YouTube OAuth account.

**Tech Stack:** `video-engine`, FFmpeg/ffprobe, local image/video assets, post-composited graphics, YouTube Data API OAuth uploader.

## Global Constraints

- Publish a public, landscape 16:9 film of 42 seconds to the Ballers Kingdom channel authorized as `lilpelejr12@gmail.com`.
- Use the title **Building Ballers. Advancing Kingdoms.** and the CTA `ballkingdom.com` / **Build Your Kingdom.**
- Use no unlicensed footage, music, unsupported claims, false Brian likeness, or cloned Brian voice.
- Generate all readable text and logo treatment in post; no video-model text.
- Preserve dirty user files: `docs/superpowers/plans/2026-07-25-unified-firebase-foundation.md` and `firebase-debug.log` are out of scope.
- Do not commit rendered media, OAuth credentials, or tokens.
- Pass H.264/AAC, 1280×720-or-higher, 24fps, audibility, spelling, end-card, and seekability QA before uploading.

---

## File Structure

- Create: `video/ballers-kingdom-flagship.json` — source brief for `video-engine`.
- Create: `video/ballers-kingdom-flagship/` — generated production package; keep local and ignore generated media.
- Create: `video/ballers-kingdom-flagship/qa-report.md` — local technical/perceptual QA record and upload receipt.
- Create: `docs/video/ballers-kingdom-flagship-metadata.md` — human-readable public title, description, tags, and thumbnail copy.
- Use: `assets/img/*` — supplied, authorized Ballers Kingdom photography and owned field video.

### Task 1: Create the locked production brief and package

**Files:**
- Create: `video/ballers-kingdom-flagship.json`
- Create: `video/ballers-kingdom-flagship/`
- Test: `video-engine validate --config video/ballers-kingdom-flagship.json --out video/ballers-kingdom-flagship`

**Consumes:** The approved design at `docs/superpowers/specs/2026-07-25-ballers-kingdom-flagship-video-design.md`.

**Produces:** A validated package containing a script, storyboard, character/continuity guidance, five scene prompts, audio plan, edit plan, and render plan.

- [ ] **Step 1: Create the source brief**

```json
{
  "topic": "The Ballers Kingdom flagship brand film",
  "goal": "Show young athletes and families that The Ballers Kingdom develops skill, discipline, character, and opportunity beyond sport",
  "audience": "Young athletes, parents, coaches, schools, and community partners in the Inland Empire",
  "length_seconds": 42,
  "visual_style": "grounded cinematic sports-development film with sunrise field light, authentic training, family/community warmth, and premium navy/cream/green post graphics",
  "animation_style": "photoreal directed scenes; no generated readable text",
  "characters": ["youth soccer athlete", "coach", "teammates", "family/community"],
  "tone": "confident, disciplined, warm, specific, never hypey",
  "platform": "YouTube",
  "aspect_ratio": "16:9",
  "language": "en",
  "music_style": "licensed original percussion and warm cinematic pulse, no vocals",
  "output_format": "production-package"
}
```

- [ ] **Step 2: Validate that the brief produces no schema errors**

Run: `video-engine validate --config video/ballers-kingdom-flagship.json --out video/ballers-kingdom-flagship`

Expected: Exit code 0 and generated validation output with every required production section present.

- [ ] **Step 3: Build the production package**

Run: `video-engine build --config video/ballers-kingdom-flagship.json --out video/ballers-kingdom-flagship`

Expected: Script, storyboard, character, prompt, audio, music, shots, edit, validation, render-plan, and export artifacts exist.

- [ ] **Step 4: Review the generated shots against the locked five beats**

Check that the sequence is: first touch; coach correction; sport-plus-life development; athlete leadership; lasting CTA. Reject generated text, false claims, visual drift, empty staged scenes, or an accidental Brian likeness.

- [ ] **Step 5: Commit source-only planning artifacts**

```bash
git add video/ballers-kingdom-flagship.json docs/video/ballers-kingdom-flagship-metadata.md
git commit -m "Add Ballers Kingdom flagship video package"
```

### Task 2: Produce the review master and public metadata

**Files:**
- Create: `docs/video/ballers-kingdom-flagship-metadata.md`
- Create: local rendered `video/ballers-kingdom-flagship/ballers-kingdom-flagship-review.mp4`
- Create: local rendered `video/ballers-kingdom-flagship/ballers-kingdom-flagship-thumb.png`
- Test: `ffprobe` media inspection and representative-frame inspection.

**Consumes:** The package shot list and prompts from Task 1 plus only authorized site assets in `assets/img/`.

**Produces:** A complete 42-second review master, a thumbnail, and copy ready for YouTube.

- [ ] **Step 1: Create the metadata file**

```markdown
# Building Ballers. Advancing Kingdoms.

**Title:** Building Ballers. Advancing Kingdoms. | The Ballers Kingdom

**Description:**
The Ballers Kingdom develops the whole athlete — skill, discipline, character, and opportunity beyond the field.

From personal soccer training to mentorship, community, and a path built for what comes next, we help young people build more than a game.

Build your kingdom: https://ballkingdom.com

#TheBallersKingdom #SoccerTraining #YouthDevelopment #InlandEmpire
```

- [ ] **Step 2: Assemble the five visual beats at 24fps**

Use supplied or generated-on-purpose scene media with 8s, 8s, 11s, 8s, and 7s durations. Composite only verified lines of the locked script and the Ballers Kingdom end card. Add 0.3–0.5s motivated dissolves or cuts that preserve athletic momentum.

- [ ] **Step 3: Add an owned/licensed instrumental bed and narration treatment**

Mix a non-vocal pulse under either an original neutral narration or an intentional text-led presentation. Maintain audible but restrained room tone, retain audio under the last seven-second CTA, and target no sudden silent tail.

- [ ] **Step 4: Export the review master and thumbnail**

Run: `ffmpeg -i <assembled-input> -c:v libx264 -pix_fmt yuv420p -r 24 -c:a aac -b:a 192k video/ballers-kingdom-flagship/ballers-kingdom-flagship-review.mp4`

Expected: a playable 16:9 H.264/AAC MP4 and 1280×720-or-higher PNG thumbnail with readable post-composited title treatment.

- [ ] **Step 5: Inspect five representative frames**

Extract frames near 00:02, 00:10, 00:20, 00:30, and 00:38. Confirm the athlete and coach have believable anatomy, no deceptive logos/text, suitable inclusion, and a clear final website/CTA.

### Task 3: QA, upload, and verify the public release

**Files:**
- Create: `video/ballers-kingdom-flagship/qa-report.md`
- Create: `video/ballers-kingdom-flagship/youtube-receipt.json`
- Test: FFmpeg/ffprobe checks, local open-and-seek check, and YouTube API processing/metadata verification.

**Consumes:** The review master, thumbnail, public metadata, and the explicitly authorized Ballers Kingdom YouTube OAuth session.

**Produces:** A public YouTube video URL and a non-secret receipt with its video ID, URL, title, privacy, processing state, and upload timestamp.

- [ ] **Step 1: Run technical checks**

Run: `ffprobe -v error -show_entries format=duration:stream=codec_name,codec_type,width,height,r_frame_rate -of json video/ballers-kingdom-flagship/ballers-kingdom-flagship-review.mp4`

Expected: one H.264 video stream at 24fps and at least 1280×720, one AAC audio stream, and duration from 41 to 43 seconds.

- [ ] **Step 2: Run final perceptual checks and write the QA report**

Record: representative frame result, spelling result, scene continuity result, audio/no-dead-air result, local player open-and-seek result, and any known limitations. A failure blocks upload until corrected.

- [ ] **Step 3: Upload exactly one public master through the authorized channel OAuth flow**

Invoke the existing uploader with: the review-master path, public privacy, approved title/description/tags, and thumbnail. Do not print, copy, or modify OAuth token material. Confirm the authenticated channel identity is The Ballers Kingdom before creating the upload.

- [ ] **Step 4: Verify the YouTube receipt and processing state**

Record the uploaded video ID and URL, confirm the metadata and thumbnail are correct, verify `privacyStatus=public`, and poll only until `processingDetails.processingStatus=succeeded`.

- [ ] **Step 5: Commit only durable source documents**

```bash
git add docs/video/ballers-kingdom-flagship-metadata.md
git commit -m "Document Ballers Kingdom flagship video release"
```

Do not stage rendered MP4/PNG files, QA receipts containing account internals, OAuth material, or unrelated dirty files.

## Plan self-review

- Spec coverage: Task 1 implements the production-package requirement; Task 2 implements the approved narrative, post-composited brand treatment, owned/authorized-media boundary, audio bed, and review master; Task 3 covers all technical/perceptual QA and the approved public YouTube release.
- Placeholder scan: no `TBD`, `TODO`, or deferred implementation language remains.
- Consistency: every task consumes a named artifact from the preceding task and produces named artifacts used by the next task.
