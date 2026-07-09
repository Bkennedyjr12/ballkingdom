# Home Inspection Guide Design

## Goal

Build a static BallKingdom-hosted Home Inspection Guide at `/home-inspection-guide/` with a reusable ingestion pipeline that converts dropped page images into cropped figure assets, searchable guide data, and a matching PDF.

## Architecture

The BallKingdom repo is a static GitHub Pages site, so the guide will be generated as static HTML/CSS/JS instead of introducing a site-wide framework. Source data, scripts, and reusable component templates live under `home-inspection-guide/`; generated deployable output lives in `home-inspection-guide/index.html` and `home-inspection-guide/public/`.

## Content Pipeline

`npm run hi:ingest` scans `home-inspection-guide/input/images/`, copies audit originals, extracts likely figure regions, writes optimized figure crops, and updates `data/image-manifest.json`. If no page images exist, the pipeline still creates a usable manifest with a branded placeholder figure so the route and PDF can be verified.

`npm run hi:build` reads `data/guide.json` and `data/image-manifest.json`, then renders a static learning portal with search, chapter navigation, topic cards, checklists, report comments, exam tips, field notes, and a figure gallery. It never renders full source scans in the normal guide.

`npm run hi:pdf` opens the static route with Playwright and prints `home-inspection-guide/public/assets/guide.pdf` using print CSS that matches the webpage.

## Design Direction

The page follows BallKingdom’s current brand: Oswald display headings, Inter body copy, royal blue, black, white, sharp low-radius cards, and direct dashboard navigation. The signature visual pattern is an inspector-style “field board” dashboard: chapter rail, search console, figure cards, report language, and Brian’s Field Notes callouts.

## Verification

Verification should run `npm run hi:all`, then serve the repo locally and confirm `/home-inspection-guide/` loads, search filters sections, figure assets render, and the PDF exists.
