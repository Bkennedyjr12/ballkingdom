import { createPlaceholderFigure, extractFiguresFromImage } from './extract-figures.mjs';
import {
  ensureDirs,
  listInputImages,
  manifestPath,
  uniqueById,
  writeJson
} from './pipeline-utils.mjs';

async function main() {
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

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceCount: images.length,
    figures: uniqueById(allFigures)
  };

  await writeJson(manifestPath, manifest);
  console.log(`Home Inspection Guide ingest complete: ${images.length} source image(s), ${manifest.figures.length} figure(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
