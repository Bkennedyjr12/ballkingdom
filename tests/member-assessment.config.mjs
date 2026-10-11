import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: fileURLToPath(new URL('.', import.meta.url)), testMatch: /member-assessment-browser\.spec\.mjs/,
  outputDir: fileURLToPath(new URL('../output/playwright/member-test-results', import.meta.url)),
  reporter: [['list'], ['json', { outputFile: fileURLToPath(new URL('../output/playwright/member-browser-report.json', import.meta.url)) }]],
  use: { baseURL: 'http://127.0.0.1:4175', channel: 'chrome', trace: 'off' },
  webServer: { cwd: fileURLToPath(new URL('..', import.meta.url)), command: 'python3 scripts/test-static-server.py 4175', url: 'http://127.0.0.1:4175/member-assessment-preview.html', reuseExistingServer: true },
});
