import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync, lstatSync, realpathSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { synchronize } from './build-gumroad-sections.mjs';
import { GUMROAD_PRODUCTS } from './gumroad-catalog.mjs';
synchronize({check:true});

// Offline packaging only. Never authenticates, downloads, or deploys.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const mainRef = '280ad62b1fc4e9cdd9d401594736dafaf96ef856';
const snapshot = json(resolve(process.argv[2] || resolve(root, '../live-hosting-snapshot.json')));
const member = json(resolve(process.argv[3] || resolve(root, 'docs/operations/site-refinement-member-paths.json')));
const rootPages = new Set('404 about admin-strategy-session strategy-session agent-city ai-assessment ai-readiness audit career-blueprint college-by-design contact custom-solutions ecosystem-city ee-venture growth index order-status privacy products quickbooks-connect quickbooks-disconnect readiness shop soccer technology terms tools workout-security-check workouts your-game yvp'.split(' ').map(x => x + '.html'));
const excluded = [], platformManaged = [], unknown = [];
const candidate = new Set();
function classify(raw, source) {
  const path = raw.replace(/^\//, '');
  if (path.startsWith('__/firebase/')) { platformManaged.push({path, source}); return; }
  if (path.split('/').some(x => x.startsWith('.')) || /^(?:CNAME|rebuild_form\.gs|workouts-preview\.html|member-assessment-preview\.html)$/.test(path)) { excluded.push({path, source, reason:'reviewed internal or publication-only artifact'}); return; }
  if (path.includes('\\') || path.includes('..') || /(?:\.map$|\.bak$|preview|ai-assessment-build)/.test(path)) {unknown.push({path,source});return;}
  const allowed = rootPages.has(path) || /^(?:robots\.txt|sitemap\.xml)$/.test(path)
    || path === 'assets/downloads/college-by-design-sample.pdf'
    || /^(?:blog\/[a-z0-9-]+\.html|news\/index\.html|credit-health\/index\.html)$/.test(path)
    || /^assets\/(?:css\/[a-z0-9-]+\.css|js\/[a-z0-9-]+\.js|img\/[A-Za-z0-9_.-]+\.(?:png|jpg|jpeg|webp|svg|mp4)|vendor\/(?:leaflet\/(?:leaflet\.(?:js|css)|LICENSE|images\/[a-z0-9-]+\.png)|workouts\/[a-z-]+\.js))$/.test(path)
    || /^home-inspection-guide\/(?:(?:index|freebie|full-study-guide)\.html|data\/(?:figure-curation|guide|image-manifest)\.json|styles\/home-inspection-guide\.css|public\/assets\/(?:figures\/figure-[a-z0-9-]+\.webp|homeowner-freebie\.pdf|professional-home-inspector-seminar\.ics))$/.test(path);
  if (allowed) candidate.add(path); else unknown.push({path, source});
}
for (const file of snapshot.files) classify(file.path, 'current-live');
for (const path of Object.keys(member.files)) classify(path, 'prior-member-release');
const tracked = execFileSync('git', ['ls-tree','-r','--name-only',mainRef], {cwd:root,encoding:'utf8'}).trim().split('\n');
for (const path of tracked) {
  // Only public additions from latest main, not arbitrary tracked source.
  if (rootPages.has(path) || /^(?:blog|news|credit-health)\/.*\.html$/.test(path)
    || /^assets\/(?:css|js|img|vendor\/leaflet)\//.test(path)) classify(path, 'latest-main');
}
for (const path of ['college-by-design.html','assets/css/college-by-design.css','assets/downloads/college-by-design-sample.pdf','assets/img/gumroad-college-by-design.png','assets/img/college-by-design-worksheet.png','assets/img/apparel-polo-wordmark-v2.jpg',...['jr','la','aa','av','cb'].map(id=>`assets/img/apparel-tee-${id}-v2.jpg`),'assets/img/brian-ampac-headshot-2026.jpg','tools.html','assets/css/tool-directory.css','assets/css/gumroad.css',...GUMROAD_PRODUCTS.map(p=>p.cover.slice(1))]) classify(path,'refinement');
const missing = [...candidate].filter(path => !existsSync(resolve(root,path)) || !lstatSync(resolve(root,path)).isFile());
for (const path of candidate) if (existsSync(resolve(root,path)) && (lstatSync(resolve(root,path)).isSymbolicLink() || !realpathSync(resolve(root,path)).startsWith(realpathSync(root) + '/'))) throw new Error('Symlink or escaped source rejected: '+path);
const outputRoot = resolve(root, 'output');
if (existsSync(outputRoot) && (lstatSync(outputRoot).isSymbolicLink() || !realpathSync(outputRoot).startsWith(realpathSync(root) + '/'))) throw new Error('Output parent symlink or escape rejected');
const reportDir = resolve(root, 'output/site-preview-report'); mkdirSync(reportDir,{recursive:true});
const report = {currentVersion:snapshot.version,latestMain:mainRef,memberSource:'abc0630d657f77a0381de63b8bbd3faa3c7db439',excluded,platformManaged,unknown,missing,deploymentPerformed:false};
writeFileSync(resolve(reportDir,'classification.json'),JSON.stringify(report,null,2)+'\n');
if (unknown.length || missing.length) throw new Error(`Publication blocked: ${unknown.length} unreviewed paths; ${missing.length} missing files. See output/site-preview-report/classification.json`);
const output = resolve(root,'output/site-preview');
// Clear only this generated directory after all source checks pass; prevent stale leakage.
if (existsSync(output)) { if (lstatSync(output).isSymbolicLink()) throw new Error('Output symlink rejected'); rmSync(output,{recursive:true}); }
mkdirSync(output,{recursive:true});
const files=[];
for (const path of [...candidate].sort()) {
  const bytes=readFileSync(resolve(root,path)); const target=resolve(output,path);
  mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);
  files.push({path:'/'+path,bytes:bytes.length,sha256:digest(bytes),hostingHash:digest(gzipSync(bytes,{level:9}))});
}
const committed = json(resolve(root,'firebase.json')).hosting.find(x=>x.target==='public');
const hosting={...committed, public:'output/site-preview', ignore:[]};
const config={hosting:[hosting]};
writeFileSync(resolve(root,'firebase.site-preview.json'),JSON.stringify(config,null,2)+'\n');
const manifest={...report,fileCount:files.length,files,manifestSha256:digest(JSON.stringify(files)),configSha256:digest(JSON.stringify(config)),publicationRequiresSeparateApproval:true};
writeFileSync(resolve(reportDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({fileCount:files.length,excluded:excluded.length,platformManaged:platformManaged.length,manifestSha256:manifest.manifestSha256,output,config:'firebase.site-preview.json',deploymentPerformed:false},null,2));
