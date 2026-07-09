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

function cropCandidates(width, height) {
  const marginX = Math.round(width * 0.08);
  const marginY = Math.round(height * 0.07);
  const contentWidth = width - marginX * 2;
  const contentHeight = height - marginY * 2;
  const isTallPage = height > width * 1.15;
  const candidates = [];

  if (isTallPage) {
    const bandHeight = Math.round(contentHeight * 0.31);
    candidates.push(
      { name: 'upper-figure', left: marginX, top: marginY, width: contentWidth, height: bandHeight },
      { name: 'middle-figure', left: marginX, top: marginY + Math.round(contentHeight * 0.345), width: contentWidth, height: bandHeight },
      { name: 'lower-figure', left: marginX, top: marginY + Math.round(contentHeight * 0.69), width: contentWidth, height: Math.min(bandHeight, contentHeight - Math.round(contentHeight * 0.69)) }
    );
  } else {
    candidates.push(
      { name: 'left-figure', left: marginX, top: marginY, width: Math.round(contentWidth * 0.48), height: contentHeight },
      { name: 'right-figure', left: marginX + Math.round(contentWidth * 0.52), top: marginY, width: Math.round(contentWidth * 0.48), height: contentHeight }
    );
  }

  return candidates.filter((candidate) => {
    const area = candidate.width * candidate.height;
    const pageArea = width * height;
    return candidate.width >= 260 && candidate.height >= 180 && area / pageArea < 0.55;
  });
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

  const candidates = cropCandidates(width, height);
  const topicTag = inferTopicFromText(basename);
  const figures = [];

  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const candidate = candidates[candidateIndex];
    const figureId = `figure-${String(index + 1).padStart(3, '0')}-${candidateIndex + 1}-${basename}`;
    const filename = `${figureId}.webp`;
    const outputPath = path.join(figuresDir, filename);
    const confidence = Number((0.62 - candidateIndex * 0.06).toFixed(2));

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
