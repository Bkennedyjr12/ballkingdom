# Home Inspection Guide

Static ingestion and publishing system for the BallKingdom Home Inspection Guide.

## Quick Start

Live class page:

```text
https://ballkingdom.com/home-inspection-guide/
```

Latest polished PDF:

```text
https://ballkingdom.com/home-inspection-guide/public/assets/guide.pdf
```

Drop page images into:

```bash
home-inspection-guide/input/images/
```

Then run:

```bash
npm run hi:all
```

Generated outputs:

- Webpage: `home-inspection-guide/index.html`
- Route: `https://ballkingdom.com/home-inspection-guide/`
- PDF: `home-inspection-guide/public/assets/guide.pdf`
- Cropped figures: `home-inspection-guide/public/assets/figures/`
- Audit originals: `home-inspection-guide/public/assets/originals/`
- Figure manifest: `home-inspection-guide/data/image-manifest.json`

The normal guide never renders full page scans. Originals are retained only for audit/debug.

## Add Photos From Codex or Terminal

When you add or attach photos in a Codex thread, the agent needs a local file path. Drag the image into the terminal, copy the local path from the attachment, or save the image somewhere on disk, then run:

```bash
npm run hi:add -- /path/to/photo.jpg
```

You can pass multiple files or a folder:

```bash
npm run hi:add -- ~/Downloads/inspection-pages
npm run hi:add -- ~/Desktop/page-01.jpg ~/Desktop/page-02.jpg
```

`hi:add` copies supported images into `input/images/`, runs ingestion, rebuilds the webpage, and regenerates the PDF. To skip the PDF during quick review:

```bash
npm run hi:add -- ~/Downloads/inspection-pages --no-pdf
```

Supported input formats: JPG, JPEG, PNG, WebP, TIFF, and HEIC if the local image stack can decode it.

Public safety rule: keep personal mailing addresses, phone numbers, client addresses, license plates, faces, and private documents out of the public guide unless they are intentionally redacted.

## Commands

```bash
npm run hi:ingest
npm run hi:build
npm run hi:pdf
npm run hi:all
npm run hi:dev
npm run hi:add -- /path/to/photo-or-folder
```

`hi:dev` starts a static server at `http://localhost:4173/`. Open:

```text
http://localhost:4173/home-inspection-guide/
```

## Review Cropped Figures

Open:

```text
home-inspection-guide/data/image-manifest.json
```

Each figure has:

- `id`
- `filename`
- `assetPath`
- `topicTag`
- `sourcePageReference`
- `caption`
- `altText`
- `confidence`
- `needsReview`
- `crop`
- `originalPath`

If `needsReview` is true, inspect the crop in `public/assets/figures/`, then edit the manifest caption, tag, alt text, or remove the figure.

## Edit Guide Content

Edit:

```text
home-inspection-guide/data/guide.json
```

Important fields:

- `studyMethod`: guide-level learning cards.
- `inspectionSequence`: field workflow.
- `reportPrinciples`: report-writing rules.
- `chapters[].sections[]`: topic body, tags, checklists, report comments, exam tips, and Brian's Field Notes.

Figure matching is tag-based. A section with:

```json
"figureTags": ["roof", "flashing"]
```

will show cropped figures whose manifest `topicTag` is `roof` or `flashing`.

After edits:

```bash
npm run hi:build
npm run hi:pdf
```

## Figure Extraction

The default extractor uses Node + `sharp`:

- copies originals into an audit folder
- trims page-margin assumptions with conservative crop bands
- avoids crops larger than 55% of the page
- enhances contrast and sharpness
- saves optimized WebP files
- marks lower-confidence crops as `needsReview`

There is also a Python fallback placeholder at:

```text
home-inspection-guide/scripts/extract-figures.py
```

Use that later if you want OpenCV contour detection, deskewing, or pytesseract OCR tuned for scanned textbooks.

## Deployment Notes

This repo deploys as static GitHub Pages from the root. The generated `home-inspection-guide/index.html` route works with relative asset paths, so pushing the folder is enough:

```bash
git add home-inspection-guide docs package.json package-lock.json sitemap.xml
git commit -m "Update home inspection guide"
git push
```

GitHub Pages will serve:

```text
https://ballkingdom.com/home-inspection-guide/
```

## Troubleshooting

If `sharp` is missing:

```bash
npm install
```

If Playwright cannot find a browser:

```bash
npx playwright install chromium
```

If crops are poor, keep the source image in `input/images/`, delete the bad figure from `image-manifest.json`, and either rerun after improving the scan/photo or manually add a cropped image to `public/assets/figures/` with a manifest entry.

If the PDF is old, run:

```bash
npm run hi:build && npm run hi:pdf
```
