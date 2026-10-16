import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: /(?:storefront|commerce|your-game|ai-readiness|production-preservation)-browser\.spec\.mjs/,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'python3 scripts/test-static-server.py 4173',
    url: 'http://127.0.0.1:4173/products.html',
    reuseExistingServer: true
  }
});
