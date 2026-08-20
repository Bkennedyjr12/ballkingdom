# The Standard Starts Here Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a photoreal 45-second Ballers Kingdom soccer-development film, beginning with a no-cost review animatic and proceeding to one Veo take per approved scene only after animatic approval.

**Architecture:** A versioned `video-engine` source brief produces the durable screenplay, continuity rules, shot list, prompts, and QA plan. A local animatic validates story and timing before paid clips are requested; approved Veo scenes are then frame-audited, assembled with post-composited text, and uploaded as an unlisted review master only.

**Tech Stack:** `video-engine`, Gemini/Veo, FFmpeg/ffprobe, local post-composited graphics, Ballers Kingdom YouTube OAuth client.

## Global Constraints

- Film is 45 seconds, landscape 16:9, 1280×720, 24fps, ending with **Build Your Kingdom · ballkingdom.com**.
- Brian continuity reference is user-authorized only for a consistent adult coach; do not create readable apparel/logos or use a voice clone.
- Athlete, teammate, and guardian are original characters; scenes must show genuine interaction, reaction, purposeful camera movement, and alive background action.
- Generate all readable text, title, CTA, brand, captions, and web address in post.
- Paid Veo generation begins only after user approves a no-cost animatic. Generate each approved scene once unless the user authorizes another take.
- Reject scene drift, broken anatomy, wrong age, false text/logos, empty staging, or inconsistent Brian likeness/wardrobe.
- Keep all credentials, tokens, rendered media, frames, and provider receipts out of Git.
- Final upload is unlisted-review only; public release requires a later explicit user decision.

---

## File Structure

- Create: `video/ballers-kingdom-standard-starts-here.json` — `video-engine` input brief.
- Create: `video/ballers-kingdom-standard-starts-here/` — local package, animatic, scene assets, frame audit, edit sources, QA report, and non-secret receipt.
- Create: `docs/video/ballers-kingdom-standard-starts-here-metadata.md` — title, description, tags, and thumbnail copy.
- Modify: `.gitignore` — exact ignore rules for generated master, frame assets, scene clips, QA receipt, and animatic.

### Task 1: Build and validate the photoreal production package

**Files:**
- Create: `video/ballers-kingdom-standard-starts-here.json`
- Create: `video/ballers-kingdom-standard-starts-here/`
- Test: `video-engine validate --config video/ballers-kingdom-standard-starts-here.json --out video/ballers-kingdom-standard-starts-here`

**Consumes:** `docs/superpowers/specs/2026-07-26-ballers-kingdom-photoreal-film-design.md`.

**Produces:** A validated 45-second five-scene package containing locked script, character bible, continuity reference policy, Veo prompts, shot list, audio plan, edit plan, render plan, and quality checklist.

- [ ] **Step 1: Create the `video-engine` source brief**

```json
{
  "topic": "The Standard Starts Here — The Ballers Kingdom photoreal soccer-development film",
  "goal": "Show an authentic coaching relationship where skill, discipline, confidence, and family support develop the whole athlete",
  "audience": "Young soccer athletes, families, coaches, schools, and community partners in the Inland Empire",
  "length_seconds": 45,
  "visual_style": "photoreal golden-hour Southern California community soccer field; real coaching interaction; cinematic handheld and gimbal camera language; post-composited Ballers Kingdom graphics",
  "animation_style": "photoreal directed scenes, text-free generation only",
  "characters": ["Brian Kennedy Jr as adult coach reference", "original teenage soccer athlete", "original teammate", "original guardian"],
  "tone": "disciplined, warm, specific, grounded, confident",
  "platform": "YouTube",
  "aspect_ratio": "16:9",
  "language": "en",
  "music_style": "original restrained cinematic percussion with warm field ambience, no vocals",
  "output_format": "production-package"
}
```

- [ ] **Step 2: Validate and build the package**

Run:

```bash
video-engine validate --config video/ballers-kingdom-standard-starts-here.json --out video/ballers-kingdom-standard-starts-here
video-engine build --config video/ballers-kingdom-standard-starts-here.json --out video/ballers-kingdom-standard-starts-here
```

Expected: both commands exit 0 and produce source artifacts for the script, storyboard, character/continuity notes, prompts, audio, shots, edit, render plan, export plan, and validation report.

- [ ] **Step 3: Validate locked scene timing and restrictions**

Run Python JSON/script assertions that require five scenes in the approved order—arrival, correction, pressure, connection, invitation—totaling exactly 45 seconds; require post-composite-only text; and reject `AmPac`, `Executive Incubator`, local-cartoon, or unrelated-office language.

- [ ] **Step 4: Commit source-only package assets**

```bash
git add video/ballers-kingdom-standard-starts-here.json video/ballers-kingdom-standard-starts-here .gitignore
git commit -m "Add Ballers Kingdom photoreal film package"
```

### Task 2: Render a no-cost review animatic

**Files:**
- Create: `video/ballers-kingdom-standard-starts-here/render_animatic.sh`
- Create: `video/ballers-kingdom-standard-starts-here/render_animatic_graphics.mjs`
- Create: local-only `video/ballers-kingdom-standard-starts-here/standard-starts-here-animatic.mp4`
- Create: local-only `video/ballers-kingdom-standard-starts-here/standard-starts-here-animatic-thumb.png`
- Test: FFmpeg decode, ffprobe stream/duration inspection, five frame inspections, and end-card audio measurement.

**Consumes:** Task 1 locked copy/timing/prompt package and user-authorized Brian still references only as animatic placeholders.

**Produces:** A review-safe 45-second animatic with post-composited copy, timing, sound design, exact CTA, and a thumbnail; it is not the final photoreal master.

- [ ] **Step 1: Render five timing-accurate animatic scenes**

Use durations 8s, 9s, 9s, 10s, and 9s. Create visual boards that establish shot geography, Brian’s black training-kit silhouette/continuity, athlete/teammate/guardian roles, warm field palette, and camera motion plan. Clearly label the local review file as an animatic outside the public master.

- [ ] **Step 2: Composite exact locked narration lines and end card**

Add only the approved five lines from the design and the end-card line `BUILD YOUR KINGDOM` with `ballkingdom.com`. Do not ask a video model to render text.

- [ ] **Step 3: Add original ambient audio and export review media**

Generate an original non-vocal pulse plus field-air ambience. Mix it audibly through the final nine-second CTA and fade intentionally at the end. Export H.264/AAC 1280×720 at 24fps.

- [ ] **Step 4: Run animatic QA**

Run:

```bash
ffprobe -v error -show_entries format=duration:stream=codec_name,codec_type,width,height,r_frame_rate -of json video/ballers-kingdom-standard-starts-here/standard-starts-here-animatic.mp4
ffmpeg -v error -i video/ballers-kingdom-standard-starts-here/standard-starts-here-animatic.mp4 -f null -
```

Extract frames near 00:02, 00:11, 00:21, 00:32, and 00:41. Verify readable post-composited copy, scene progression, final CTA, audio stream, 45±1s duration, 1280×720, and 24fps.

- [ ] **Step 5: Commit renderer source but not rendered media**

```bash
git add video/ballers-kingdom-standard-starts-here/render_animatic.sh video/ballers-kingdom-standard-starts-here/render_animatic_graphics.mjs .gitignore
git commit -m "Add Ballers Kingdom photoreal film animatic"
```

### Task 3: User animatic gate and Veo scene generation

**Files:**
- Create: local-only `video/ballers-kingdom-standard-starts-here/veo-scenes/scene-01.mp4` through `scene-05.mp4`
- Create: local-only `video/ballers-kingdom-standard-starts-here/frame-audit.md`
- Test: frame extraction, continuity audit, and each clip’s FFprobe inspection.

**Consumes:** The user-approved Task 2 animatic, the Task 1 approved prompt package, and provider authentication/billing verification.

**Produces:** One approved Veo clip per locked scene and a complete frame audit.

- [ ] **Step 1: Stop unless the animatic has explicit user approval**

Record the user’s approval in the local production notes. If the animatic is not approved, return the requested changes and do not call a paid provider.

- [ ] **Step 2: Verify provider scope before generation**

Confirm Gemini/Veo credentials are available through the authorized Ballers Kingdom Google project, billing scope is correct, and the provider route can produce 1280×720 text-free clips. Do not print any key, secret, bearer token, or client credential.

- [ ] **Step 3: Generate each approved scene exactly once**

Generate each of the five locked prompts at 8–10 seconds. Keep Brian’s approved continuity reference, black training kit, athlete age, golden-hour field geography, and human interaction requirements unchanged across clips. Composite no readable language inside generation.

- [ ] **Step 4: Audit frames and reject defects**

Extract three representative frames per clip. Record likeness/wardrobe consistency, athlete age, anatomy, hands, ball geometry, camera continuity, background life, and absence of fake text/logos in `frame-audit.md`. A defect blocks assembly until the user authorizes another take.

### Task 4: Assemble, QA, and upload an unlisted review master

**Files:**
- Create: `docs/video/ballers-kingdom-standard-starts-here-metadata.md`
- Create: local-only `video/ballers-kingdom-standard-starts-here/standard-starts-here-review.mp4`
- Create: local-only `video/ballers-kingdom-standard-starts-here/standard-starts-here-thumb.png`
- Create: local-only `video/ballers-kingdom-standard-starts-here/qa-report.md`
- Create: local-only `video/ballers-kingdom-standard-starts-here/youtube-receipt.json`
- Test: FFprobe/decode/seek/frame/audio checks and YouTube privacy/processing verification.

**Consumes:** Frame-audited Veo scenes, locked copy, the Ballers Kingdom YouTube OAuth session, and Task 3 approval evidence.

**Produces:** One QA-cleared unlisted review URL on The Ballers Kingdom channel.

- [ ] **Step 1: Create review metadata**

Use title: `The Standard Starts Here | The Ballers Kingdom`.

Use description:

```markdown
Every standard is built one rep at a time.

The Ballers Kingdom develops more than soccer players—through skill, discipline, mentorship, and community.

Build your kingdom: https://ballkingdom.com

#TheBallersKingdom #SoccerTraining #YouthDevelopment #InlandEmpire
```

- [ ] **Step 2: Assemble the five audited scenes with post-composited graphics**

Use motivated cuts/dissolves, original narration treatment, original/licensed music, and field ambience. Composite captions and the final CTA only in post. Preserve active audio through the final 7–9 seconds, then intentional fade.

- [ ] **Step 3: Run final technical and perceptual QA**

Run FFprobe and a full FFmpeg decode. Seek near 0s, 12s, 24s, 36s, and 44s. Verify H.264/AAC, 1280×720, 24fps, 44–46s duration, audio stream, final CTA spelling, frame continuity, last-ten-second audible bed, and thumbnail dimensions.

- [ ] **Step 4: Upload one unlisted review master only**

Use the Ballers Kingdom-owned OAuth client. Confirm authenticated channel title exactly equals `The Ballers Kingdom` before creating the upload. Set privacy to `unlisted`, apply the approved thumbnail, and poll until processing succeeds. Record only non-secret video ID, URL, title, privacy, processing state, and timestamp.

- [ ] **Step 5: Commit only durable source metadata**

```bash
git add docs/video/ballers-kingdom-standard-starts-here-metadata.md .gitignore
git commit -m "Document Ballers Kingdom photoreal film review"
```

## Plan self-review

- Spec coverage: Task 1 provides the full production package and continuity policy; Task 2 provides the no-cost animatic and QA gate; Task 3 enforces user approval and paid-scene/audit controls; Task 4 provides final edit, QA, unlisted publication, and release evidence.
- Placeholder scan: no deferred implementation markers remain; all generation/release gates name their exact approval and verification requirements.
- Consistency: every later task consumes named prior outputs, and generated media/receipts are local-only under the Global Constraints.
