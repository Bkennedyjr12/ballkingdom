import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { guidePath, guideRoot, readJson } from './pipeline-utils.mjs';

const companionUrl = 'https://companion.ballkingdom.com/';
const guide = await readJson(guidePath, {});
const html = await fs.readFile(path.join(guideRoot, 'index.html'), 'utf8');

const companionQuickLink = guide.classHub?.quickLinks?.find((link) => link.href === companionUrl);

assert.equal(companionQuickLink?.label, 'Open Class Companion');
assert.match(html, /class="hi-companion-link"[^>]+href="https:\/\/companion\.ballkingdom\.com\/"[^>]*>Class Companion<\/a>/);
assert.match(html, /class="hi-action hi-action-companion"[^>]+href="https:\/\/companion\.ballkingdom\.com\/"[^>]*>Open Class Companion<\/a>/);

console.log('Companion link verification PASS');
