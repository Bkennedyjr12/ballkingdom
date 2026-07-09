import { createPlaceholderFigure, extractFiguresFromImage } from './extract-figures.mjs';
import {
  curationPath,
  ensureDirs,
  figuresDir,
  listInputImages,
  manifestPath,
  readJson,
  uniqueById,
  writeJson
} from './pipeline-utils.mjs';
import fs from 'node:fs/promises';

function applyCuration(figures, curation) {
  const excludeIds = new Set(curation.excludeIds || []);
  const overrides = curation.overrides || {};
  return figures
    .filter((figure) => !excludeIds.has(figure.id))
    .map((figure) => ({
      ...figure,
      ...(overrides[figure.id] || {})
    }));
}

async function removeUncuratedFigureFiles(figures) {
  const keep = new Set(figures.map((figure) => figure.filename));
  const entries = await fs.readdir(figuresDir, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.webp') && !keep.has(entry.name))
    .map((entry) => fs.rm(`${figuresDir}/${entry.name}`, { force: true })));
}

async function main() {
  await ensureDirs();
  await fs.rm(figuresDir, { recursive: true, force: true });
  await ensureDirs();
  const images = await listInputImages();
  const allFigures = [];

  for (let index = 0; index < images.length; index += 1) {
    const figures = await extractFiguresFromImage(images[index], index);
    allFigures.push(...figures);
  }

  if (allFigures.length === 0) {
    allFigures.push(await createPlaceholderFigure());
  }
  const curation = await readJson(curationPath, { excludeIds: [], overrides: {} });
  const curatedFigures = applyCuration(allFigures, curation);
  await removeUncuratedFigureFiles(curatedFigures);

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceCount: images.length,
    figures: uniqueById(curatedFigures)
  };

  await writeJson(manifestPath, manifest);
  console.log(`Home Inspection Guide ingest complete: ${images.length} source image(s), ${manifest.figures.length} figure(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
