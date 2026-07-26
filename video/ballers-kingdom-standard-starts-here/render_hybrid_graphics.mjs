#!/usr/bin/env node
// Deterministic post-production copy overlays for the local hybrid review cut.
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const output = process.argv[2];
if (!output) throw new Error('Usage: render_hybrid_graphics.mjs <output-directory>');
await mkdir(output, { recursive: true });
const packageDir = path.dirname(new URL(import.meta.url).pathname);
const narration = JSON.parse(await readFile(path.join(packageDir, 'narration_contract.json'), 'utf8'));

const esc = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const quote = (value) => `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
  <rect x="0" y="566" width="1280" height="154" fill="#071013" fill-opacity=".72"/>
  <text x="640" y="635" fill="#FFF4DD" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" text-anchor="middle">${esc(value)}</text>
</svg>`;
const cta = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
  <rect width="1280" height="720" fill="#071013"/>
  <rect x="210" y="184" width="860" height="350" rx="18" fill="#13191B" stroke="#F5BD54" stroke-width="2"/>
  <text x="640" y="332" fill="#F5BD54" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700" text-anchor="middle" letter-spacing="2">BUILD YOUR KINGDOM</text>
  <text x="640" y="414" fill="#FFF4DD" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="600" text-anchor="middle">ballkingdom.com</text>
</svg>`;
const lines = [narration.beats[0].text, narration.beats[0].text, ...narration.beats.slice(1).map((beat) => beat.text)];
await Promise.all(lines.map((line, index) => sharp(Buffer.from(quote(line))).png().toFile(path.join(output, `overlay-${index + 1}.png`))));
await sharp(Buffer.from(cta)).png().toFile(path.join(output, 'overlay-7.png'));
