import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOverlay, hostingHash } from './build-ai-readiness-overlay.mjs';

// Offline only: overlay the reviewed nine paths on the pinned clean live release.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseline = JSON.parse(readFileSync(resolve(root, 'docs/operations/member-assessment-live-baseline.json')));
const snapshotPath = process.argv[2];
if (!snapshotPath) throw new Error('Pass the fresh read-only Hosting snapshot');
const snapshot = JSON.parse(readFileSync(resolve(snapshotPath)));
const read = path => readFileSync(resolve(root, path));
const paths = baseline.approvedOverlay.map(file => file.path.slice(1));
if (paths.length !== 9 || baseline.fileCount !== 177 || snapshot.config && JSON.stringify(snapshot.config) !== JSON.stringify(baseline.config)) throw new Error('Member release baseline/config drift');
for (const file of baseline.approvedOverlay) if (hostingHash(read(file.path.slice(1))) !== file.hostingHash) throw new Error('Approved candidate drift: ' + file.path);
const result = buildOverlay({ baseline, snapshot, read, paths });
if (result.publicationBlocked || Object.keys(result.files).length !== 179 || result.changedPaths.length !== 9) throw new Error('Unexpected member overlay');
const out = resolve(root, 'output/member-assessment-release');
mkdirSync(resolve(out, 'blobs'), { recursive: true });
for (const blob of result.blobs) writeFileSync(resolve(out, 'blobs', blob.hash + '.gz'), blob.compressed);
const payload = { files: result.files }, digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const plan = { project: 'the-ballers-kingdom', site: 'ballkingdom-com', baseVersion: baseline.version, existingFiles: 177, totalFiles: 179, unchangedFiles: 170, changedPaths: result.changedPaths, deletions: [], configUnchanged: true, inheritedInternalArtifactCount: 0, publicationBlocked: false, payloadSha256: digest(payload), configSha256: digest(result.config) };
writeFileSync(resolve(out, 'populate-files.json'), JSON.stringify(payload, null, 2) + '\n');
writeFileSync(resolve(out, 'hosting-config.json'), JSON.stringify(result.config, null, 2) + '\n');
writeFileSync(resolve(out, 'release-plan.json'), JSON.stringify(plan, null, 2) + '\n');
console.log(JSON.stringify(plan, null, 2));
