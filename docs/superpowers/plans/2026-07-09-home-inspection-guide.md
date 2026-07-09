# Home Inspection Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable static Home Inspection Guide ingestion, page generation, and PDF pipeline for BallKingdom.

**Architecture:** Keep GitHub Pages deployment simple by generating static files from JSON and images. Use repo-local Node scripts for ingestion, static HTML generation, and Playwright PDF rendering.

**Tech Stack:** Static HTML/CSS/JS, Node ESM scripts, `sharp`, `playwright`.

## Global Constraints

- Route must deploy at `/home-inspection-guide/`.
- Do not render full textbook/page scans in the normal guide.
- Cropped figures must be saved under `home-inspection-guide/public/assets/`.
- Data must live in `home-inspection-guide/data/guide.json` and `home-inspection-guide/data/image-manifest.json`.
- Commands must include `hi:ingest`, `hi:build`, `hi:pdf`, `hi:dev`, and `hi:all`.
- Design must match BallKingdom’s royal blue, black, white static-site brand.

---

### Task 1: Scaffold Static Guide and Data

**Files:**
- Create: `package.json`
- Create: `home-inspection-guide/README.md`
- Create: `home-inspection-guide/input/images/.gitkeep`
- Create: `home-inspection-guide/data/guide.json`
- Create: `home-inspection-guide/data/image-manifest.json`

**Interfaces:**
- Produces JSON consumed by build scripts.
- Produces npm scripts used by verification.

- [x] Create folders, package scripts, seed guide chapters, and empty manifest.

### Task 2: Build Web UI Source and Styles

**Files:**
- Create: `home-inspection-guide/src/HomeInspectionGuide.tsx`
- Create: `home-inspection-guide/src/components/GuideSearch.tsx`
- Create: `home-inspection-guide/src/components/ChapterCard.tsx`
- Create: `home-inspection-guide/src/components/FigureCard.tsx`
- Create: `home-inspection-guide/src/components/ReportCommentCard.tsx`
- Create: `home-inspection-guide/src/components/ChecklistBlock.tsx`
- Create: `home-inspection-guide/styles/home-inspection-guide.css`

**Interfaces:**
- Source components document the generated UI sections.
- CSS is copied into generated `index.html`.

- [x] Add component templates and production CSS.

### Task 3: Add Pipeline Scripts

**Files:**
- Create: `home-inspection-guide/scripts/pipeline-utils.mjs`
- Create: `home-inspection-guide/scripts/extract-figures.mjs`
- Create: `home-inspection-guide/scripts/ingest-images.mjs`
- Create: `home-inspection-guide/scripts/build-guide.mjs`
- Create: `home-inspection-guide/scripts/build-pdf.mjs`
- Create: `home-inspection-guide/scripts/extract-figures.py`

**Interfaces:**
- `ingest-images.mjs` updates `image-manifest.json`.
- `build-guide.mjs` writes `home-inspection-guide/index.html`.
- `build-pdf.mjs` writes `home-inspection-guide/public/assets/guide.pdf`.

- [x] Implement deterministic pipeline with graceful empty-input handling.

### Task 4: Verify and Ship

**Files:**
- Modify: `sitemap.xml`
- Modify: `.gitignore`

**Interfaces:**
- `npm run hi:all` is the acceptance command.

- [x] Run install if needed.
- [x] Run `npm run hi:all`.
- [x] Serve and smoke-check the static page.
- [x] Commit and push focused files.
