import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: fileURLToPath(new URL('.', import.meta.url)),
  testMatch: /native-assessment-browser\.spec\.mjs/,
  outputDir: fileURLToPath(new URL('../output/playwright/native-test-results', import.meta.url)),
  reporter: [['list'], ['json', { outputFile: fileURLToPath(new URL('../output/playwright/native-browser-report.json', import.meta.url)) }]],
  use: { baseURL: 'http://127.0.0.1:4174', channel: 'chrome', trace: 'retain-on-failure' },
  webServer: {
    command: 'python3 scripts/test-static-server.py 4174',
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    url: 'http://127.0.0.1:4174/products.html',
    reuseExistingServer: true,
  },
});
