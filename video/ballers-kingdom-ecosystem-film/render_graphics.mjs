#!/usr/bin/env node
// Render transparent, post-production-only local review overlays. Phrase
// timing is generated from the authorized-clone manifest, never from footage.

import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [outputDir, captionsDir] = process.argv.slice(2);
if (!outputDir || !captionsDir) throw new Error('Usage: render_graphics.mjs <output-directory> <caption-directory>');

const packageDir = path.dirname(new URL(import.meta.url).pathname);
const contract = JSON.parse(await readFile(path.join(packageDir, 'narration_contract.json'), 'utf8'));
const srt = await readFile(path.join(captionsDir, 'narration.srt'), 'utf8');
const cueSchedule = JSON.parse(await readFile(path.join(captionsDir, 'caption-cues.json'), 'utf8'));
const expectedSchedule = [
  ['foundation', 0, 16], ['whole-person-promise', 16, 18], ['verified-paths', 34, 22],
  ['community', 56, 8], ['cta', 64, 6],
];
const schedule = contract.beats.map(({ id, start_seconds, duration_seconds }) => [id, start_seconds, duration_seconds]);
if (JSON.stringify(schedule) !== JSON.stringify(expectedSchedule) || contract.runtime_seconds !== 70) {
  throw new Error('Narration contract does not match the locked 70-second animatic schedule.');
}
const srtBlocks = srt.trim().split('\n\n').map((block) => block.split('\n'));
if (srtBlocks.length !== cueSchedule.length || srtBlocks.some((lines, index) => lines.length !== 3 || lines[2] !== cueSchedule[index].text)) {
  throw new Error('Generated phrase SRT captions do not match the validated cue schedule.');
}
const contractPhrases = contract.beats.flatMap((beat) => beat.caption_phrases);
if (JSON.stringify(cueSchedule.map(({ text }) => text)) !== JSON.stringify(contractPhrases)) {
  throw new Error('Phrase captions do not exactly reconstruct the locked contract copy.');
}

const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const titleFor = (id) => id.replaceAll('-', ' ').toUpperCase();

function wrapCaption(value, limit = 62) {
  const words = value.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > limit && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > 3) throw new Error(`Phrase cue exceeds three readable lines: ${value}`);
  return lines;
}

function chapterSvg(beat) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    <defs><linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#08130f" stop-opacity="0"/><stop offset="1" stop-color="#08130f" stop-opacity="0.72"/></linearGradient></defs>
    <rect width="1920" height="1080" fill="url(#bottomFade)"/>
    <rect x="64" y="54" width="512" height="44" rx="22" fill="#08130f" fill-opacity="0.77" stroke="#d4b359" stroke-opacity="0.70"/>
    <text x="92" y="83" fill="#f8f4e8" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" letter-spacing="2.2">BALLERS KINGDOM  ·  LOCAL REVIEW</text>
    <text x="64" y="740" fill="#d4b359" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" letter-spacing="3.0">${esc(titleFor(beat.id))}</text>
  </svg>`;
}

function cueSvg(cue) {
  const cta = cue.beat_id === 'cta';
  const lines = wrapCaption(cue.text);
  const startY = 938 - (lines.length - 1) * 48;
  const text = lines.map((line, index) => `<text x="960" y="${startY + index * 48}" text-anchor="middle" fill="#f8f4e8" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700">${esc(line)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    ${cta ? '<rect x="64" y="900" width="820" height="106" rx="10" fill="#08130f" fill-opacity="0.83" stroke="#d4b359" stroke-opacity="0.76"/>' : ''}
    ${text}
  </svg>`;
}

await mkdir(outputDir, { recursive: true });
await Promise.all(contract.beats.map((beat, index) => sharp(Buffer.from(chapterSvg(beat))).png().toFile(path.join(outputDir, `chapter-${index + 1}.png`))));
await Promise.all(cueSchedule.map((cue, index) => sharp(Buffer.from(cueSvg(cue))).png().toFile(path.join(outputDir, `cue-${index + 1}.png`))));
