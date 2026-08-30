import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const rootUrl = new URL('../../../', import.meta.url);

test('the local Storage fragment denies direct access to every paid artifact', async () => {
  const rules = await readFile(new URL('storage.rules', rootUrl), 'utf8');
  assert.doesNotMatch(rules, /request\.auth|\.token\.admin|allow\s+[^:]+:\s*if\s+true/);
  assert.match(rules, /match \/private-commerce\/\{artifact=\*\*\}/);
  assert.match(rules, /allow read, write: if false;/);
});

test('the unverified Storage fragment is neither mapped for deploy nor hostable', async () => {
  const config = JSON.parse(await readFile(new URL('firebase.json', rootUrl), 'utf8'));
  assert.equal(config.storage, undefined);
  for (const hosting of config.hosting) {
    assert.equal(hosting.ignore.includes('storage.rules'), true);
  }
});

test('Storage emulator coverage stays explicitly blocked until source and bucket recovery', {
  skip:'Environment gate: authoritative Storage Rules source/bucket mapping and emulator proof are unavailable.',
}, () => {});
