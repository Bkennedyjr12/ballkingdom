import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {manifestDigest} from './build-ai-readiness-overlay.mjs';

// Cleanup only: no checkout asset reads, feature overlays, uploads or network calls.
const target=/^projects\/(?:the-ballers-kingdom|78885961453)\/sites\/ballkingdom-com\/versions\/[A-Za-z0-9_-]+$/;
export function buildCleanup({baseline,snapshot}) {
  if(!target.test(baseline?.version??''))throw new Error('Cleanup target is not the authorized public site');
  if(snapshot?.version!==baseline.version || snapshot.files?.length!==baseline.fileCount
    || manifestDigest(snapshot.files)!==baseline.manifestSha256)throw new Error('Live baseline changed; reconcile before cleanup');
  const files={},removedPaths=[];
  for(const file of [...snapshot.files].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)) {
    if(file.path.split('/').some(part=>part.startsWith('.')))removedPaths.push(file.path);
    else files[file.path]=file.hash;
  }
  return {baseVersion:baseline.version,files,removedPaths,config:structuredClone(baseline.config),
    addedPaths:[],changedPublicPaths:[]};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const baseline=JSON.parse(readFileSync(resolve(root,'docs/operations/ai-readiness-live-baseline.json')));
  const snapshot=JSON.parse(readFileSync(resolve(root,'output/reconciliation/hosting-live-files.json')));
  const result=buildCleanup({baseline,snapshot});
  const out=resolve(root,'output/cleanup-only-release');mkdirSync(out,{recursive:true});
  const payload={files:result.files};
  const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  writeFileSync(resolve(out,'populate-files.json'),JSON.stringify(payload,null,2)+'\n');
  writeFileSync(resolve(out,'hosting-config.json'),JSON.stringify(result.config,null,2)+'\n');
  writeFileSync(resolve(out,'removed-paths.json'),JSON.stringify({paths:result.removedPaths},null,2)+'\n');
  const plan={project:'the-ballers-kingdom',site:'ballkingdom-com',baseVersion:result.baseVersion,
    cleanupOnly:true,existingFiles:baseline.fileCount,retainedFiles:Object.keys(result.files).length,
    removedInternalFiles:result.removedPaths.length,changedPublicFiles:0,addedFiles:0,
    configUnchanged:true,newFeaturesIncluded:false,deployPerformed:false,
    manifestSha256:sha(payload),configSha256:sha(result.config)};
  writeFileSync(resolve(out,'plan.json'),JSON.stringify(plan,null,2)+'\n');
  console.log(JSON.stringify(plan,null,2));
}
