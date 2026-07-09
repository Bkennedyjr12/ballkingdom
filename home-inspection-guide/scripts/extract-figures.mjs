import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  ensureDirs,
  figuresDir,
  inferTopicFromText,
  originalsDir,
  relativeFromGuide,
  routeAssetPath,
  slugify,
  titleFromSlug
} from './pipeline-utils.mjs';

function overlaps(a, b) {
  const x1 = Math.max(a.left, b.left);
  const y1 = Math.max(a.top, b.top);
  const x2 = Math.min(a.left + a.width, b.left + b.width);
  const y2 = Math.min(a.top + a.height, b.top + b.height);
  if (x2 <= x1 || y2 <= y1) return false;
  const intersection = (x2 - x1) * (y2 - y1);
  const smaller = Math.min(a.width * a.height, b.width * b.height);
  return intersection / smaller > 0.35;
}

async function cropCandidates(imagePath, width, height) {
  const analysisWidth = 900;
  const cell = 30;
  const { data, info } = await sharp(imagePath, { failOn: 'none' })
    .rotate()
    .resize({ width: analysisWidth, withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const cols = Math.floor(info.width / cell);
  const rows = Math.floor(info.height / cell);
  const active = Array.from({ length: rows }, () => Array(cols).fill(false));
  const scores = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let gy = 0; gy < rows; gy += 1) {
    for (let gx = 0; gx < cols; gx += 1) {
      let content = 0;
      let color = 0;
      let dark = 0;
      const total = cell * cell;
      for (let y = gy * cell; y < (gy + 1) * cell; y += 1) {
        for (let x = gx * cell; x < (gx + 1) * cell; x += 1) {
          const offset = (y * info.width + x) * info.channels;
          const r = data[offset];
          const g = data[offset + 1];
          const b = data[offset + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const avg = (r + g + b) / 3;
          if (r < 238 || g < 238 || b < 238) content += 1;
          if (max - min > 28 && avg < 245) color += 1;
          if (avg < 205) dark += 1;
        }
      }
      const contentRatio = content / total;
      const colorRatio = color / total;
      const darkRatio = dark / total;
      scores[gy][gx] = colorRatio * 4 + darkRatio * 0.2 + contentRatio * 0.1;
      active[gy][gx] = colorRatio > 0.018;
    }
  }

  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  const components = [];
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (let gy = 0; gy < rows; gy += 1) {
    for (let gx = 0; gx < cols; gx += 1) {
      if (!active[gy][gx] || visited[gy][gx]) continue;
      const queue = [[gx, gy]];
      visited[gy][gx] = true;
      let minX = gx;
      let maxX = gx;
      let minY = gy;
      let maxY = gy;
      let score = 0;
      let count = 0;
      while (queue.length) {
        const [cx, cy] = queue.shift();
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        score += scores[cy][cx];
        count += 1;
        for (const [dx, dy] of neighbors) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          if (!active[ny][nx] || visited[ny][nx]) continue;
          visited[ny][nx] = true;
          queue.push([nx, ny]);
        }
      }
      components.push({ minX, maxX, minY, maxY, score: score / Math.max(count, 1), count });
    }
  }

  const scaleX = width / info.width;
  const scaleY = height / info.height;
  const pageArea = width * height;
  const candidates = components
    .map((component, componentIndex) => {
      const pad = 18;
      const left = Math.max(0, Math.round((component.minX * cell - pad) * scaleX));
      const top = Math.max(0, Math.round((component.minY * cell - pad) * scaleY));
      const right = Math.min(width, Math.round(((component.maxX + 1) * cell + pad) * scaleX));
      const bottom = Math.min(height, Math.round(((component.maxY + 1) * cell + pad) * scaleY));
      return {
        name: `detected-figure-${componentIndex + 1}`,
        left,
        top,
        width: right - left,
        height: bottom - top,
        score: component.score,
        cells: component.count
      };
    })
    .filter((candidate) => {
      const area = candidate.width * candidate.height;
      const aspect = candidate.width / candidate.height;
      return candidate.width >= 240
        && candidate.height >= 170
        && area / pageArea >= 0.006
        && area / pageArea <= 0.28
        && aspect >= 0.25
        && aspect <= 4.5;
    })
    .sort((a, b) => (b.score * b.width * b.height) - (a.score * a.width * a.height));

  const selected = [];
  for (const candidate of candidates) {
    if (selected.some((existing) => overlaps(existing, candidate))) continue;
    selected.push(candidate);
    if (selected.length >= 3) break;
  }
  return selected.sort((a, b) => a.top - b.top || a.left - b.left);
}

export async function createPlaceholderFigure() {
  await ensureDirs();
  const outputPath = path.join(figuresDir, 'field-board-placeholder.webp');
  const svg = `
    <svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="900" fill="#0b1220"/>
      <rect x="80" y="80" width="1040" height="740" rx="18" fill="#ffffff"/>
      <rect x="126" y="150" width="430" height="38" fill="#1b3a8e"/>
      <rect x="126" y="235" width="760" height="24" fill="#cbd5e1"/>
      <rect x="126" y="287" width="680" height="24" fill="#cbd5e1"/>
      <rect x="126" y="390" width="360" height="260" fill="#e9eefb"/>
      <path d="M178 590 L274 472 L352 545 L424 430 L480 590 Z" fill="#1b3a8e"/>
      <rect x="550" y="390" width="420" height="32" fill="#111827"/>
      <rect x="550" y="452" width="360" height="20" fill="#94a3b8"/>
      <rect x="550" y="492" width="330" height="20" fill="#94a3b8"/>
      <rect x="550" y="532" width="390" height="20" fill="#94a3b8"/>
      <text x="126" y="735" font-family="Arial, sans-serif" font-size="36" font-weight="700" fill="#0b1220">Drop page images into input/images</text>
    </svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 88 }).toFile(outputPath);
  return {
    id: 'figure-field-board-placeholder',
    filename: path.basename(outputPath),
    assetPath: routeAssetPath(outputPath),
    topicTag: 'overview',
    sourcePageReference: 'Generated placeholder',
    caption: 'Inspection field board placeholder',
    altText: 'A stylized inspection guide board placeholder graphic.',
    confidence: 0.99,
    needsReview: false,
    crop: null,
    originalPath: null
  };
}

export async function extractFiguresFromImage(imagePath, index) {
  await ensureDirs();
  const basename = slugify(path.parse(imagePath).name);
  const originalName = `${String(index + 1).padStart(3, '0')}-${basename}${path.extname(imagePath).toLowerCase()}`;
  const originalPath = path.join(originalsDir, originalName);
  await fs.copyFile(imagePath, originalPath);

  const source = sharp(imagePath, { failOn: 'none' }).rotate();
  const metadata = await source.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) return [];

  const candidates = await cropCandidates(imagePath, width, height);
  const topicTag = inferTopicFromText(basename);
  const figures = [];

  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const candidate = candidates[candidateIndex];
    const figureId = `figure-${String(index + 1).padStart(3, '0')}-${candidateIndex + 1}-${basename}`;
    const filename = `${figureId}.webp`;
    const outputPath = path.join(figuresDir, filename);
    const confidence = Number(Math.min(0.9, Math.max(0.52, 0.58 + candidate.score * 0.22)).toFixed(2));

    await sharp(imagePath, { failOn: 'none' })
      .rotate()
      .extract(candidate)
      .normalise()
      .sharpen({ sigma: 0.8 })
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 84 })
      .toFile(outputPath);

    figures.push({
      id: figureId,
      filename,
      assetPath: routeAssetPath(outputPath),
      topicTag,
      sourcePageReference: `Source image ${path.basename(imagePath)}, crop ${candidateIndex + 1}`,
      caption: `${titleFromSlug(topicTag)} reference figure`,
      altText: `Cropped ${topicTag} reference figure extracted from ${path.basename(imagePath)}.`,
      confidence,
      needsReview: confidence < 0.7,
      crop: candidate,
      originalPath: relativeFromGuide(originalPath),
      extractedTextSnippet: ''
    });
  }

  return figures;
}
