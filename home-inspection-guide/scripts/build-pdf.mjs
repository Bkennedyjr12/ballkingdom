import path from 'node:path';
import { chromium } from 'playwright';
import { assetsDir, guideRoot } from './pipeline-utils.mjs';
import fs from 'node:fs/promises';

async function main() {
  await fs.mkdir(assetsDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await page.emulateMedia({ media: 'print' });
  await page.goto(`file://${path.join(guideRoot, 'index.html')}`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    document.querySelectorAll('img').forEach((img) => {
      img.loading = 'eager';
      img.decoding = 'sync';
    });
    await document.fonts?.ready;
    const height = document.documentElement.scrollHeight;
    for (let y = 0; y < height; y += 900) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 35));
    }
    window.scrollTo(0, 0);
    await Promise.all(Array.from(document.images).map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise((resolve, reject) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', reject, { once: true });
      });
    }));
  });
  const imageStatus = await page.evaluate(() => {
    const images = Array.from(document.images);
    const failed = images
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => img.getAttribute('src'));
    return {
      total: images.length,
      loaded: images.length - failed.length,
      failed
    };
  });
  if (imageStatus.failed.length) {
    throw new Error(`PDF image load failed for: ${imageStatus.failed.join(', ')}`);
  }
  const outputPath = path.join(assetsDir, 'guide.pdf');
  await page.pdf({
    path: outputPath,
    format: 'Letter',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '0.45in', right: '0.45in', bottom: '0.55in', left: '0.45in' }
  });
  await browser.close();
  const desktopPath = path.join(process.env.HOME || '/Users/briankennedyjrm.ed', 'Desktop', 'guide.pdf');
  await fs.copyFile(outputPath, desktopPath);
  console.log(`PDF image check: ${imageStatus.loaded}/${imageStatus.total} loaded`);
  console.log(`Generated ${outputPath}`);
  console.log(`Copied ${desktopPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
