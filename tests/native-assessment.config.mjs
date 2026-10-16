import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const live=process.env.BK_ASSESSMENT_LIVE==='1';
export default defineConfig({
  testDir: fileURLToPath(new URL('.', import.meta.url)),
  testMatch: /native-assessment-browser\.spec\.mjs/,
  outputDir: fileURLToPath(new URL('../output/playwright/native-test-results', import.meta.url)),
  reporter: [['list'], ['json', { outputFile: fileURLToPath(new URL('../output/playwright/native-browser-report.json', import.meta.url)) }]],
  use: { baseURL: live?'https://ballkingdom.com':'http://127.0.0.1:4174', channel: 'chrome', trace: 'retain-on-failure' },
  webServer: live?undefined:{
    command: 'python3 scripts/test-static-server.py 4174',
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    url: 'http://127.0.0.1:4174/products.html',
    reuseExistingServer: true,
  },
});
