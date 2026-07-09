import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const guideRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = path.resolve(guideRoot, '..');
export const inputDir = path.join(guideRoot, 'input', 'images');
export const dataDir = path.join(guideRoot, 'data');
export const publicDir = path.join(guideRoot, 'public');
export const assetsDir = path.join(publicDir, 'assets');
export const originalsDir = path.join(assetsDir, 'originals');
export const figuresDir = path.join(assetsDir, 'figures');
export const guidePath = path.join(dataDir, 'guide.json');
export const manifestPath = path.join(dataDir, 'image-manifest.json');

export const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.heic']);

export async function ensureDirs() {
  await fs.mkdir(inputDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(assetsDir, { recursive: true });
  await fs.mkdir(originalsDir, { recursive: true });
  await fs.mkdir(figuresDir, { recursive: true });
}

export async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

export function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

export function titleFromSlug(value) {
  return slugify(value)
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function cleanInputName(filePath) {
  const parsed = path.parse(filePath);
  return `${slugify(parsed.name)}${parsed.ext.toLowerCase()}`;
}

export async function listInputImages() {
  await ensureDirs();
  const entries = await fs.readdir(inputDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(inputDir, entry.name))
    .sort();
}

export function inferTopicFromText(text) {
  const value = slugify(text);
  const rules = [
    ['drainage', ['drain', 'grade', 'gutter', 'downspout', 'slope']],
    ['roof', ['roof', 'shingle', 'flashing', 'valley', 'chimney']],
    ['electrical', ['panel', 'breaker', 'gfci', 'afci', 'wire', 'electrical']],
    ['plumbing', ['water', 'plumb', 'heater', 'drain', 'pipe', 'leak']],
    ['hvac', ['hvac', 'furnace', 'cooling', 'condenser', 'air-condition']],
    ['foundation', ['foundation', 'crawl', 'basement', 'settlement', 'crack']],
    ['attic', ['attic', 'insulation', 'ventilation', 'rafter', 'truss']],
    ['exterior', ['siding', 'trim', 'stucco', 'exterior', 'wall']],
    ['interior', ['interior', 'ceiling', 'floor', 'stair', 'wall']],
    ['environmental', ['mold', 'asbestos', 'lead', 'radon', 'environment']]
  ];
  for (const [topic, needles] of rules) {
    if (needles.some((needle) => value.includes(needle))) return topic;
  }
  return 'overview';
}

export function relativeFromGuide(filePath) {
  return path.relative(guideRoot, filePath).split(path.sep).join('/');
}

export function routeAssetPath(filePath) {
  return relativeFromGuide(filePath).replace(/^public\//, 'public/');
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
