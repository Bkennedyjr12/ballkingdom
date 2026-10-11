import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';

const live=process.env.BK_CLEANUP_LIVE==='1';
const root=fileURLToPath(new URL('..',import.meta.url));
export default defineConfig({
  testDir:fileURLToPath(new URL('.',import.meta.url)),
  testMatch:/(?:hosting-cleanup|your-game)-browser\.spec\.mjs/,
  workers:1,
  outputDir:`${root}/output/cleanup-only-release/browser-${live?'live':'local'}`,
  reporter:[['list'],['json',{outputFile:`${root}/output/cleanup-only-release/browser-${live?'live':'local'}.json`}]],
  use:{baseURL:live?'https://ballkingdom.com':'http://127.0.0.1:4175',channel:'chrome',trace:'retain-on-failure'},
  webServer:live?undefined:{
    command:`python3 ${root}/scripts/test-static-server.py 4175`,
    cwd:`${root}/output/cleanup-only-release/staging`,
    url:'http://127.0.0.1:4175/products.html',reuseExistingServer:false,
  },
});
