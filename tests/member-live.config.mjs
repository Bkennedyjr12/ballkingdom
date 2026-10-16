import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: fileURLToPath(new URL('.', import.meta.url)),
  testMatch: /(?:(?:ai-readiness|production-preservation|your-game|storefront|native-assessment|member-workout-integration)-browser|member-live-smoke)\.spec\.mjs/,
  reporter: [['list'], ['json', { outputFile: fileURLToPath(new URL('../output/member-assessment-release/regression-live-browser.json', import.meta.url)) }]],
  outputDir: fileURLToPath(new URL('../output/playwright/member-live-regression-results', import.meta.url)),
  use: { baseURL: 'https://ballkingdom.com', channel: 'chrome', trace: 'off' },
});
