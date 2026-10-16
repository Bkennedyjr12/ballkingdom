import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:/(?:site-refinement|storefront|your-game|commerce|gumroad)-browser\.spec\.mjs/,workers:1,timeout:30000,globalTimeout:180000,outputDir:'../output/college-release-browser',use:{baseURL:'http://127.0.0.1:4196',reducedMotion:'reduce',headless:true,channel:'chrome'}});
