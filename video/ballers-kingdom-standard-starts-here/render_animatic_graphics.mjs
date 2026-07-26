#!/usr/bin/env node
// Local-only review animatic boards. Every readable string is locked copy or
// the required local-review classification; all people and scenery are original
// SVG illustration, not generated footage or a real-person likeness.

import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const output = process.argv[2];
if (!output) throw new Error('Usage: render_animatic_graphics.mjs <output-directory>');

const packageDir = path.dirname(new URL(import.meta.url).pathname);
const contract = JSON.parse(await readFile(path.join(packageDir, 'locked_scene_contract.json'), 'utf8'));
const expectedSchedule = [
  ['arrival', 0, 8], ['correction', 8, 9], ['pressure', 17, 9],
  ['connection', 26, 10], ['invitation', 36, 9],
];
const actualSchedule = contract.scenes.map((scene) => [scene.id, scene.start_seconds, scene.duration_seconds]);
if (JSON.stringify(actualSchedule) !== JSON.stringify(expectedSchedule)) {
  throw new Error('Locked scene schedule does not match the animatic contract.');
}
await mkdir(output, { recursive: true });

const c = {
  dusk: '#13191B', ink: '#071013', grass: '#365B43', grassLight: '#597A4E',
  gold: '#F5BD54', cream: '#FFF4DD', coral: '#D5754E', haze: '#F1A65B',
  shadow: '#091010', white: '#FEFAED', muted: '#BFC9B2', blackKit: '#111618',
};
const esc = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const text = (value, x, y, size, options = {}) => `<text x="${x}" y="${y}" fill="${options.fill ?? c.cream}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${options.weight ?? 700}" text-anchor="${options.anchor ?? 'middle'}" letter-spacing="${options.letterSpacing ?? 0}">${esc(value)}</text>`;

function person(x, y, scale = 1, options = {}) {
  const kit = options.kit ?? c.blackKit;
  const skin = options.skin ?? '#6E4631';
  const accent = options.accent ?? c.gold;
  const direction = options.direction ?? 1;
  return `<g transform="translate(${x} ${y}) scale(${scale * direction} ${scale})">
    <ellipse cx="0" cy="0" rx="30" ry="8" fill="${c.shadow}" opacity=".35"/>
    <circle cx="0" cy="-87" r="17" fill="${skin}"/>
    <path d="M-15 -97 Q0 -114 15 -97 L13 -85 L-14 -85Z" fill="#1A1816"/>
    <path d="M-20 -67 Q0 -78 20 -67 L26 -15 L-25 -15Z" fill="${kit}"/>
    <path d="M-18 -64 L-43 -33" stroke="${skin}" stroke-width="9" stroke-linecap="round"/>
    <path d="M18 -64 L42 -42" stroke="${skin}" stroke-width="9" stroke-linecap="round"/>
    <path d="M-15 -14 L-24 0 M14 -14 L22 0" stroke="${kit}" stroke-width="14" stroke-linecap="round"/>
    <path d="M-27 1 L-37 5 M20 1 L31 5" stroke="${c.cream}" stroke-width="5" stroke-linecap="round"/>
    ${options.coach ? `<path d="M-12 -52 H12" stroke="${accent}" stroke-width="3" opacity=".65"/>` : ''}
  </g>`;
}
function ball(x, y, r = 15) {
  return `<g><circle cx="${x}" cy="${y}" r="${r}" fill="${c.cream}" stroke="${c.ink}" stroke-width="3"/><path d="M${x-r*.55} ${y-r*.25}L${x} ${y-r*.55}L${x+r*.55} ${y-r*.15}L${x+r*.25} ${y+r*.55}L${x-r*.5} ${y+r*.42}Z" fill="${c.ink}" opacity=".5"/></g>`;
}
function base(content, narration) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${c.dusk}"/><stop offset=".58" stop-color="#5E6357"/><stop offset="1" stop-color="${c.haze}"/></linearGradient>
      <linearGradient id="field" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${c.grassLight}"/><stop offset="1" stop-color="${c.grass}"/></linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="14"/></filter>
      <pattern id="mow" width="130" height="130" patternUnits="userSpaceOnUse"><path d="M0 0H130V130H0Z" fill="none" stroke="${c.cream}" stroke-opacity=".045" stroke-width="24"/></pattern>
    </defs>
    <rect width="1280" height="720" fill="url(#sky)"/>
    <circle cx="1040" cy="128" r="78" fill="${c.gold}" opacity=".34" filter="url(#glow)"/>
    <circle cx="1040" cy="128" r="34" fill="${c.gold}" opacity=".82"/>
    <path d="M0 302 C210 260 362 290 510 250 C716 196 892 280 1280 218 V472 H0Z" fill="#1D2928" opacity=".78"/>
    <path d="M0 332 C280 282 506 322 714 282 C914 244 1100 306 1280 260 V472 H0Z" fill="#283E32" opacity=".95"/>
    <path d="M0 388 L1280 370 L1280 720 L0 720Z" fill="url(#field)"/>
    <rect y="388" width="1280" height="332" fill="url(#mow)"/>
    <path d="M0 523 C386 485 844 510 1280 580" fill="none" stroke="${c.cream}" stroke-opacity=".23" stroke-width="4"/>
    <path d="M0 620 C380 575 844 600 1280 676" fill="none" stroke="${c.cream}" stroke-opacity=".13" stroke-width="3"/>
    <rect x="62" y="30" width="450" height="42" rx="21" fill="${c.ink}" fill-opacity=".76" stroke="${c.cream}" stroke-opacity=".36"/>
    ${text('LOCAL REVIEW ANIMATIC • NOT PUBLIC MASTER', 287, 58, 16, { letterSpacing: 1.2 })}
    ${content}
    <rect x="0" y="622" width="1280" height="98" fill="${c.ink}" fill-opacity=".81"/>
    ${text(narration, 640, 680, 30, { fill: c.white, weight: 700 })}
  </svg>`;
}

const scenes = [
  base(`
    <path d="M146 430 L1180 495" stroke="${c.cream}" stroke-opacity=".25" stroke-width="4"/>
    <path d="M250 298 L250 470 M272 308 L272 472 M250 298 H272" stroke="${c.cream}" stroke-opacity=".55" stroke-width="3"/>
    ${person(430, 518, 1.35, { coach: true })}
    ${person(692, 536, 1.08, { kit: '#263C47', direction: -1 })}
    ${person(930, 505, .68, { kit: '#4D5640', direction: -1 })}
    ${ball(574, 505, 17)}
    <path d="M570 478 C520 438 485 430 458 438" fill="none" stroke="${c.gold}" stroke-width="4" stroke-dasharray="8 10"/>
  `, contract.scenes[0].narration),
  base(`
    <path d="M226 494 C430 430 647 438 1034 514" fill="none" stroke="${c.cream}" stroke-opacity=".28" stroke-width="4"/>
    ${person(462, 535, 1.28, { coach: true, direction: 1 })}
    ${person(754, 548, 1.08, { kit: '#263C47', direction: -1 })}
    ${ball(650, 508, 16)}
    <path d="M620 490 C675 452 700 434 742 430" fill="none" stroke="${c.gold}" stroke-width="5" stroke-linecap="round"/>
    <path d="M726 415 l21 15 -25 11" fill="${c.gold}"/>
    <circle cx="488" cy="332" r="10" fill="${c.gold}" opacity=".85"/><path d="M488 342 V382" stroke="${c.gold}" stroke-width="4"/>
  `, contract.scenes[1].narration),
  base(`
    <path d="M170 520 C410 438 634 484 902 432 C1045 404 1120 410 1190 438" fill="none" stroke="${c.cream}" stroke-opacity=".36" stroke-width="4"/>
    ${person(358, 542, .95, { kit: '#3D4D59', direction: 1 })}
    ${person(557, 516, 1.02, { kit: '#263C47', direction: -1 })}
    ${person(766, 551, .98, { kit: '#394B3E', direction: 1 })}
    ${person(976, 504, .82, { kit: '#674B3C', direction: -1 })}
    ${ball(674, 519, 14)}
    <path d="M674 490 C731 456 799 456 855 480" fill="none" stroke="${c.gold}" stroke-width="5" stroke-dasharray="9 10"/>
    ${person(1030, 466, .46, { coach: true })}${person(1110, 470, .42, { kit: '#484E49' })}
  `, contract.scenes[2].narration),
  base(`
    <path d="M94 488 L1195 438" stroke="${c.cream}" stroke-opacity=".22" stroke-width="4"/>
    <path d="M898 340 H1064 V490 H898 Z" fill="none" stroke="${c.cream}" stroke-opacity=".34" stroke-width="4"/>
    ${person(480, 548, 1.22, { coach: true })}
    ${person(688, 556, 1.00, { kit: '#263C47', direction: -1 })}
    ${person(862, 550, 1.12, { kit: '#7D5D4A', direction: -1 })}
    ${ball(755, 526, 14)}
    <path d="M665 447 C700 420 750 414 794 432" fill="none" stroke="${c.gold}" stroke-width="4" stroke-dasharray="6 10"/>
    ${person(1086, 476, .52, { kit: '#394B3E', direction: -1 })}${person(1150, 480, .47, { kit: '#4C5242' })}
  `, contract.scenes[3].narration),
  base(`
    <path d="M116 530 C370 452 612 477 875 455 C1036 441 1138 465 1210 496" fill="none" stroke="${c.cream}" stroke-opacity=".34" stroke-width="4"/>
    ${person(370, 537, 1.06, { coach: true })}
    ${person(694, 548, 1.02, { kit: '#263C47', direction: -1 })}
    ${person(926, 533, .82, { kit: '#3D4D59' })}
    ${ball(810, 530, 15)}
    <rect x="185" y="168" width="910" height="228" rx="18" fill="${c.ink}" fill-opacity=".79" stroke="${c.gold}" stroke-width="2"/>
    ${text('BUILD YOUR KINGDOM', 640, 262, 54, { fill: c.gold, letterSpacing: 1.8 })}
    ${text('ballkingdom.com', 640, 324, 31, { fill: c.white, weight: 600 })}
  `, contract.scenes[4].narration),
];

await Promise.all(scenes.map((scene, i) => sharp(Buffer.from(scene)).png().toFile(path.join(output, `scene-${i + 1}.png`))));
