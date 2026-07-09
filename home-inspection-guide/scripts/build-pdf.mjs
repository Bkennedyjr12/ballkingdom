import path from 'node:path';
import { chromium } from 'playwright';
import { assetsDir, guideRoot } from './pipeline-utils.mjs';
import fs from 'node:fs/promises';

async function main() {
  await fs.mkdir(assetsDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await page.goto(`file://${path.join(guideRoot, 'index.html')}`, { waitUntil: 'networkidle' });
  await page.pdf({
    path: path.join(assetsDir, 'guide.pdf'),
    format: 'Letter',
    printBackground: true,
    margin: { top: '0.45in', right: '0.45in', bottom: '0.55in', left: '0.45in' }
  });
  await browser.close();
  console.log(`Generated ${path.join(assetsDir, 'guide.pdf')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
