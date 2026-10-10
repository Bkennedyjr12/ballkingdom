import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOverlay, manifestDigest, hostingHash} from '../scripts/build-ai-readiness-overlay.mjs';

const old = Buffer.from('Existing public app');
const files = [
  {path:'/index.html',hash:hostingHash(old),status:'ACTIVE'},
  {path:'/assets/js/public-chat.js',hash:hostingHash(old),status:'ACTIVE'},
  {path:'/unknown-existing-asset.pdf',hash:'a'.repeat(64),status:'ACTIVE'},
];
const baseline = {version:'projects/test/sites/public/versions/pinned',fileCount:3,
  manifestSha256:manifestDigest(files),config:{cleanUrls:true},
  recoveredFiles:[{path:'assets/js/public-chat.js',hostingHash:hostingHash(old)}]};
const snapshot = {version:baseline.version,files};
const read = path => path==='assets/js/public-chat.js' ? old : Buffer.from('New landing');

test('additive overlay preserves every unrelated blob and Hosting config without materializing them', () => {
  const result = buildOverlay({baseline,snapshot,read,paths:['index.html','ai-readiness.html']});
  assert.equal(result.files['/unknown-existing-asset.pdf'],'a'.repeat(64));
  assert.equal(result.files['/assets/js/public-chat.js'],hostingHash(old));
  assert.deepEqual(result.config,baseline.config);
  assert.equal(Object.keys(result.files).length,4);
  assert.deepEqual(result.changedPaths,['/ai-readiness.html','/index.html']);
});

test('different live version or file list requires fresh reconciliation', () => {
  for (const altered of [ {...snapshot,version:'another-release'},
    {...snapshot,files:[...files,{path:'/another.js',hash:'b'.repeat(64),status:'ACTIVE'}]},
    {...snapshot,files:files.map((f,i)=>i===2?{...f,hash:'b'.repeat(64)}:f)}]) {
    assert.throws(()=>buildOverlay({baseline,snapshot:altered,read,paths:['index.html']}),/baseline/i);
  }
});

test('changed recovered chat/workout source fails the preservation guard', () => {
  assert.throws(()=>buildOverlay({baseline,snapshot,read:()=>Buffer.from('Drift'),paths:['index.html']}),/source drift/i);
});

test('only approved public paths can become new blobs', () => {
  for (const path of ['../outside.html','.worktrees/internal.txt','functions/src/index.js','docs/note.md','assets/../private.txt','assets/key.json']) {
    assert.throws(()=>buildOverlay({baseline,snapshot,read,paths:[path]}),/public overlay path/i);
  }
});

test('duplicate or traversal entries in a snapshot are rejected', () => {
  for (const bad of [[...files,files[0]],[{path:'/../secret',hash:'a'.repeat(64),status:'ACTIVE'}]]) {
    assert.throws(()=>manifestDigest(bad),/path|duplicate/i);
  }
});

test('existing internal artifacts remain hashes only and are flagged for separate review', () => {
  const inherited = [...files,{path:'/.worktrees/old/internal.md',hash:'c'.repeat(64),status:'ACTIVE'}];
  const pin={...baseline,fileCount:4,manifestSha256:manifestDigest(inherited)};
  const result=buildOverlay({baseline:pin,snapshot:{...snapshot,files:inherited},read,paths:['ai-readiness.html']});
  assert.equal(result.inheritedInternalArtifactCount,1);
  assert.equal(result.files['/.worktrees/old/internal.md'],'c'.repeat(64));
  assert.equal(result.blobs.length,1);
});
