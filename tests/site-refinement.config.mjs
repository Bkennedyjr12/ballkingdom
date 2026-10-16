import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: /site-refinement-browser\.spec\.mjs/,
  workers: 1, timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4187', reducedMotion: 'reduce', headless: true, channel: 'chrome' },
  webServer: { command: 'python3 scripts/test-static-server.py 4187', url: 'http://127.0.0.1:4187/', reuseExistingServer: true }
});
