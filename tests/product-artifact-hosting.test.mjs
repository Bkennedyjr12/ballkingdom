import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Firebase Hosting excludes the paid source artifact from its root package', async () => {
  const config = JSON.parse(await readFile(new URL('../firebase.json', import.meta.url), 'utf8'));
  const publicHosting = config.hosting.find(entry => entry.target === 'public');
  assert.ok(publicHosting);
  assert.ok(publicHosting.ignore.includes('home-inspection-guide/public/assets/guide.pdf'));
});
