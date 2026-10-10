import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

// Local build only. This module contains no network, authentication or deployment operation.
export const OVERLAY_PATHS = Object.freeze([
  'ai-readiness.html','assets/css/ai-readiness.css',
  'index.html','privacy.html','readiness.html','sitemap.xml',
  'ai-assessment.html','assets/css/ai-assessment.css',
  'assets/js/ai-assessment-app.js','assets/js/ai-assessment-model.js',
]);
const digest = value => createHash('sha256').update(value).digest('hex');
const sorted = entries => entries.sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0);
export const hostingHash = bytes => digest(gzipSync(bytes,{level:9}));

function fileMap(files) {
  if (!Array.isArray(files)) throw new Error('Invalid baseline files');
  const map = Object.create(null);
  for (const entry of files) {
    if (typeof entry?.path !== 'string' || !entry.path.startsWith('/')
      || entry.path.includes('\\') || entry.path.includes('\0')
      || entry.path.split('/').some(part => part==='..' || part==='.')
      || !/^[a-f0-9]{64}$/.test(entry.hash) || entry.status!=='ACTIVE') {
      throw new Error('Invalid baseline path/hash/status');
    }
    if (Object.hasOwn(map,entry.path)) throw new Error('Duplicate baseline path');
    map[entry.path]=entry.hash;
  }
  return Object.fromEntries(sorted(Object.entries(map)));
}
export const manifestDigest = files => digest(JSON.stringify(fileMap(files)));

function publicOverlayPath(path) {
  return typeof path==='string' && !path.includes('..')
    && /^(?:[a-z0-9-]+\.html|sitemap\.xml|assets\/(?:css\/[a-z0-9-]+\.css|js\/[a-z0-9-]+\.js))$/.test(path);
}

export function buildOverlay({baseline,snapshot,read,paths=OVERLAY_PATHS}) {
  if (snapshot?.version!==baseline?.version || snapshot.files?.length!==baseline.fileCount
    || manifestDigest(snapshot.files)!==baseline.manifestSha256) {
    throw new Error('Hosting baseline changed; reconcile the live release again');
  }
  for (const file of baseline.recoveredFiles ?? []) {
    if (!publicOverlayPath(file.path) && !/^assets\/vendor\/workouts\/[a-z-]+\.js$/.test(file.path)) {
      throw new Error('Invalid recovered source path');
    }
    if (hostingHash(read(file.path))!==file.hostingHash) throw new Error(`Recovered source drift: ${file.path}`);
  }
  const files=fileMap(snapshot.files),blobs=[],changedPaths=[];
  for (const path of paths) {
    if (!publicOverlayPath(path)) throw new Error('Invalid public overlay path');
    const bytes=read(path),compressed=gzipSync(bytes,{level:9}),hash=digest(compressed);
    if (files[`/${path}`]!==hash) {
      files[`/${path}`]=hash;changedPaths.push(`/${path}`);blobs.push({path,hash,compressed});
    }
  }
  const inheritedInternalArtifactCount=snapshot.files.filter(file=>file.path.split('/').some(part=>part.startsWith('.'))).length;
  // Retaining hashes proves compatibility only. It never approves carrying
  // publicly reachable internal artifacts into a new Hosting release.
  return {baseVersion:baseline.version,config:structuredClone(baseline.config),
    files:Object.fromEntries(sorted(Object.entries(files))),blobs,changedPaths:changedPaths.sort(),
    inheritedInternalArtifactCount,publicationBlocked:inheritedInternalArtifactCount>0,
    publicationBlockers:inheritedInternalArtifactCount>0?['inherited-internal-artifact-review']:[]};
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const snapshotPath=process.argv[2];
  if (!snapshotPath) throw new Error('Usage: node scripts/build-ai-readiness-overlay.mjs <read-only-live-file-snapshot.json>');
  const baseline=JSON.parse(readFileSync(resolve(root,'docs/operations/ai-readiness-live-baseline.json')));
  const snapshot=JSON.parse(readFileSync(resolve(snapshotPath)));
  if (digest(readFileSync(resolve(root,'assets/js/ai-assessment-model.js')))
    !==digest(readFileSync(resolve(root,'functions/src/assessment/model.js')))) {
    throw new Error('Assessment model drift; run npm run build:native-assessment');
  }
  const result=buildOverlay({baseline,snapshot,read:path=>readFileSync(resolve(root,path))});
  const output=resolve(root,'output/ai-readiness-release');mkdirSync(resolve(output,'blobs'),{recursive:true});
  for (const blob of result.blobs) writeFileSync(resolve(output,'blobs',`${blob.hash}.gz`),blob.compressed);
  const payload={files:result.files};
  writeFileSync(resolve(output,'populate-files.json'),JSON.stringify(payload,null,2)+'\n');
  writeFileSync(resolve(output,'hosting-config.json'),JSON.stringify(result.config,null,2)+'\n');
  const plan={site:'ballkingdom-com',project:'the-ballers-kingdom',baseVersion:result.baseVersion,
    existingFiles:baseline.fileCount,totalFiles:Object.keys(result.files).length,
    unchangedFiles:baseline.fileCount-result.changedPaths.filter(path=>snapshot.files.some(file=>file.path===path)).length,
    changedPaths:result.changedPaths,deletions:[],configUnchanged:true,
    inheritedInternalArtifactCount:result.inheritedInternalArtifactCount,
    publicationBlocked:result.publicationBlocked,publicationBlockers:result.publicationBlockers,
    deploymentPerformed:false,publicationRequiresSeparateApproval:true,
    payloadSha256:digest(JSON.stringify(payload)),configSha256:digest(JSON.stringify(result.config))};
  writeFileSync(resolve(output,'release-plan.json'),JSON.stringify(plan,null,2)+'\n');
  console.log(JSON.stringify(plan,null,2));
}
