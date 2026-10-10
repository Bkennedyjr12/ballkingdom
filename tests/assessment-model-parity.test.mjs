import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('the browser assessment uses the exact canonical server scoring model',()=>{
  const canonical=readFileSync(new URL('../functions/src/assessment/model.js',import.meta.url));
  const browser=readFileSync(new URL('../assets/js/ai-assessment-model.js',import.meta.url));
  assert.equal(Buffer.compare(browser,canonical),0,'Run npm run build:native-assessment after changing the canonical model');
});
