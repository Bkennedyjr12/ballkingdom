// Run with Node before tests/release. One portable model supplies browser and server.
import { copyFile } from 'node:fs/promises';

await copyFile(
  new URL('../../functions/src/assessment/model.js', import.meta.url),
  new URL('./ai-assessment-model.js', import.meta.url),
);
