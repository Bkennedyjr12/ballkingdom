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

test('Storage emulator coverage stays blocked while the candidate is unmapped and Java is absent', {
  skip:'Release gate: verified candidate/bucket evidence exists, but Rules mapping, SDK, Java, and emulator proof are unavailable.',
}, () => {});

test('Storage merge candidate preserves every original byte outside the private commerce deny', async () => {
  const original = await readFile(new URL(
    'docs/operations/evidence/firebase-rules/storage/6a0d2e24-723d-4512-a4e1-7f2288550997/storage.rules',rootUrl
  ), 'utf8');
  const candidate = await readFile(new URL(
    'docs/operations/evidence/firebase-rules/merge-candidates/storage.rules',rootUrl
  ), 'utf8');
  const stripped = candidate.replace(
    /    \/\/ BEGIN LOCAL COMMERCE MERGE CANDIDATE\n[\s\S]*?    \/\/ END LOCAL COMMERCE MERGE CANDIDATE\n\n/,
    '',
  );
  assert.equal(stripped, original);
  assert.match(candidate, /match \/private-commerce\/\{artifact=\*\*\}/);
  assert.match(candidate, /match \/private-commerce\/\{artifact=\*\*\} \{\s*allow read, write: if false;/);
});
