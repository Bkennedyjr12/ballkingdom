import test from 'node:test';
import assert from 'node:assert/strict';
import {manifestDigest} from '../scripts/build-ai-readiness-overlay.mjs';

let buildCleanup;
try { ({buildCleanup}=await import('../scripts/build-hosting-cleanup.mjs')); } catch {}
const files=[
  {path:'/index.html',hash:'a'.repeat(64),status:'ACTIVE'},
  {path:'/assets/js/public-chat.js',hash:'b'.repeat(64),status:'ACTIVE'},
  {path:'/workouts.html',hash:'c'.repeat(64),status:'ACTIVE'},
  {path:'/unknown-existing.gs',hash:'d'.repeat(64),status:'ACTIVE'},
  {path:'/.private/demo/source.md',hash:'e'.repeat(64),status:'ACTIVE'},
  {path:'/nested/.private/cache.json',hash:'f'.repeat(64),status:'ACTIVE'},
];
const baseline={version:'projects/the-ballers-kingdom/sites/ballkingdom-com/versions/pinned',
  fileCount:6,manifestSha256:manifestDigest(files),config:{cleanUrls:true,rewrites:[{glob:'**',path:'/index.html'}]}};
const snapshot={version:baseline.version,files};
const build=args=>{assert.equal(typeof buildCleanup,'function','Cleanup-only builder is missing');return buildCleanup(args);};

test('cleanup preserves every ordinary live hash without using checkout feature code',()=>{
  const result=build({baseline,snapshot});
  assert.deepEqual(result.files,{'/assets/js/public-chat.js':'b'.repeat(64),'/index.html':'a'.repeat(64),'/unknown-existing.gs':'d'.repeat(64),'/workouts.html':'c'.repeat(64)});
  assert.deepEqual(result.addedPaths,[]);
  assert.deepEqual(result.changedPublicPaths,[]);
  assert.equal(result.files['/ai-assessment.html'],undefined);
});
test('cleanup omits all internal paths including nested hidden components',()=>{
  const result=build({baseline,snapshot});
  assert.deepEqual(result.removedPaths,['/.private/demo/source.md','/nested/.private/cache.json']);
  assert.equal(Object.keys(result.files).length,4);
});
test('cleanup retains exact Hosting behavior in an independent config copy',()=>{
  const result=build({baseline,snapshot});
  assert.deepEqual(result.config,{cleanUrls:true,rewrites:[{glob:'**',path:'/index.html'}]});
  result.config.cleanUrls=false;
  assert.equal(baseline.config.cleanUrls,true);
});
test('stale or altered snapshot cannot become a cleanup release',()=>{
  for(const altered of [{...snapshot,version:'another-version'}, {...snapshot,files:files.slice(1)},
    {...snapshot,files:files.map((f,i)=>i===0?{...f,hash:'f'.repeat(64)}:f)}]) {
    assert.throws(()=>build({baseline,snapshot:altered}),/baseline|changed/i);
  }
});
test('cleanup builder cannot target another site or project',()=>{
  const wrong={...baseline,version:'projects/another/sites/another/versions/pinned'};
  assert.throws(()=>build({baseline:wrong,snapshot:{...snapshot,version:wrong.version}}),/target/i);
});
