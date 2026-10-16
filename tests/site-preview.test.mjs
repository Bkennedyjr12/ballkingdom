import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const baseline = JSON.parse(readFileSync(join(root, 'docs/operations/site-refinement-member-paths.json')));
const temp = mkdtempSync(join(tmpdir(), 'kingdom-public-package-'));
const input = join(temp, 'snapshot.json');
const snapshot = {version: 'synthetic-public-baseline', files: Object.keys(baseline.files).map(path => ({path}))};
const run = () => JSON.parse(execFileSync(process.execPath, ['scripts/build-site-preview.mjs', input], {cwd:root, encoding:'utf8'}));

test('public package is deterministic, preserves actual brand bytes, and excludes internal material', () => {
  try {
    writeFileSync(input, JSON.stringify(snapshot));
    const first = run(), second = run();
    assert.equal(first.manifestSha256, second.manifestSha256);
    const manifest = JSON.parse(readFileSync(join(root, 'output/site-preview-report/manifest.json')));
    assert.ok(manifest.files.some(f => f.path === '/assets/js/member-assessment-app.js'));
    assert.ok(manifest.files.some(f => f.path === '/tools.html'));
    assert.ok(manifest.files.every(f => !/(?:^|\/)(?:\.|docs\/|tests\/|functions\/|scripts\/)|preview|rebuild_form/.test(f.path.slice(1))));
    const brand = manifest.files.find(f => f.path === '/assets/img/logo-nav-white.png');
    assert.equal(brand.sha256, createHash('sha256').update(readFileSync(join(root, 'assets/img/logo-nav-white.png'))).digest('hex'));
    const config = JSON.parse(readFileSync(join(root, 'firebase.site-preview.json')));
    assert.deepEqual(Object.keys(config), ['hosting']);
    assert.equal(config.hosting[0].public, 'output/site-preview');
  } finally { /* The next check reuses only this synthetic fixture. */ }
});

test('unknown inherited path blocks packaging without replacing the reviewed output', () => {
  try {
    const before = readFileSync(join(root, 'output/site-preview/index.html'));
    writeFileSync(input, JSON.stringify({...snapshot, files:[...snapshot.files, {path:'/unreviewed-draft.txt'}]}));
    const result = spawnSync(process.execPath, ['scripts/build-site-preview.mjs', input], {cwd:root, encoding:'utf8'});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Publication blocked/);
    assert.deepEqual(readFileSync(join(root, 'output/site-preview/index.html')), before);
  } finally { rmSync(temp, {recursive:true, force:true}); }
});
