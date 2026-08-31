import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {deleteObject, getBytes, listAll, ref, uploadBytes} from 'firebase/storage';

const rootUrl = new URL('../../../', import.meta.url);

test('mapped Storage rules deny direct access to every paid artifact', async () => {
  const rules = await readFile(new URL('storage.rules', rootUrl), 'utf8');
  const commerceBlock = rules.match(
    /\/\/ BEGIN LOCAL COMMERCE MERGE CANDIDATE([\s\S]*?)\/\/ END LOCAL COMMERCE MERGE CANDIDATE/
  )?.[1];
  assert.ok(commerceBlock);
  assert.doesNotMatch(commerceBlock, /request\.auth|\.token\.admin|allow\s+[^:]+:\s*if\s+true/);
  assert.match(commerceBlock, /match \/private-commerce\/\{artifact=\*\*\}/);
  assert.match(commerceBlock, /allow read, write: if false;/);
});

test('the reviewed Storage candidate is byte-exactly mapped but never hostable', async () => {
  const config = JSON.parse(await readFile(new URL('firebase.json', rootUrl), 'utf8'));
  const rootRules = await readFile(new URL('storage.rules', rootUrl));
  const candidateRules = await readFile(new URL(
    'docs/operations/evidence/firebase-rules/merge-candidates/storage.rules', rootUrl
  ));
  assert.deepEqual(config.storage, {rules:'storage.rules'});
  assert.deepEqual(rootRules, candidateRules);
  for (const hosting of config.hosting) {
    assert.equal(hosting.ignore.includes('storage.rules'), true);
  }
});

test('mapped root Storage rules deny paid artifacts while preserving retained owner media behavior', {
  skip:!process.env.FIREBASE_STORAGE_EMULATOR_HOST && 'Storage emulator is required',
}, async () => {
  const rules = await readFile(new URL('storage.rules',rootUrl), 'utf8');
  const projectId = `demo-ballkingdom-commerce-storage-${process.pid}`;
  const bucketUrl = `gs://${projectId}.appspot.com`;
  const environment = await initializeTestEnvironment({projectId,storage:{rules}});
  try {
    await environment.clearStorage();
    await environment.withSecurityRulesDisabled(async context => {
      const storage = context.storage(bucketUrl);
      await uploadBytes(ref(storage,'private-commerce/guide.pdf'),new Uint8Array([1,2,3]),
        {contentType:'application/pdf'});
      await uploadBytes(ref(storage,'inspector-companion/owner-1/original.pdf'),
        new Uint8Array([4,5,6]),{contentType:'application/pdf'});
    });
    const contexts = [
      environment.unauthenticatedContext(),
      environment.authenticatedContext('ordinary'),
      environment.authenticatedContext('owner-1',{companionOwner:true}),
      environment.authenticatedContext('owner-2',{companionOwner:true}),
      environment.authenticatedContext('admin',{admin:true}),
    ];
    for (const context of contexts) {
      const storage = context.storage(bucketUrl);
      await assertFails(getBytes(ref(storage,'private-commerce/guide.pdf')));
      await assertFails(listAll(ref(storage,'private-commerce')));
      await assertFails(uploadBytes(ref(storage,'private-commerce/client-write.pdf'),
        new Uint8Array([9]),{contentType:'application/pdf'}));
      await assertFails(deleteObject(ref(storage,'private-commerce/guide.pdf')));
    }
    const ownerStorage = environment.authenticatedContext(
      'owner-1',{companionOwner:true}
    ).storage(bucketUrl);
    await assertSucceeds(getBytes(ref(ownerStorage,'inspector-companion/owner-1/original.pdf')));
    await assertSucceeds(uploadBytes(ref(ownerStorage,'inspector-companion/owner-1/new.pdf'),
      new Uint8Array([7]),{contentType:'application/pdf'}));
    for (const context of [
      environment.unauthenticatedContext(),environment.authenticatedContext('ordinary'),
      environment.authenticatedContext('owner-2',{companionOwner:true}),
      environment.authenticatedContext('admin',{admin:true}),
    ]) {
      await assertFails(getBytes(ref(
        context.storage(bucketUrl),'inspector-companion/owner-1/original.pdf'
      )));
    }
  } finally {
    await environment.clearStorage();
    await environment.cleanup();
  }
});

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
