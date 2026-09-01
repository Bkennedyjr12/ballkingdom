import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

async function loadData() {
  const source = await read('assets/js/your-game-data.js');
  const context = { window: {} };
  vm.runInNewContext(source, context);
  return context.window.YOUR_GAME_DATA;
}

test('Kingdom Roles are an original, balanced contribution framework', async () => {
  const data = await loadData();
  assert.deepEqual(
    Array.from(data.roles, ({ id }) => id),
    ['playmaker', 'builder', 'guardian', 'pathfinder', 'catalyst']
  );
  assert.equal(new Set(data.roles.map(({ name }) => name)).size, 5);
  assert.ok(data.roles.every((role) => role.essence && role.pressure && role.practice && role.scripture));

  const counts = Object.fromEntries(data.roles.map(({ id }) => [id, 0]));
  for (const round of data.rounds) {
    assert.equal(round.statements.length, 5);
    for (const statement of round.statements) counts[statement.role] += 1;
  }
  assert.deepEqual(counts, { playmaker: 4, builder: 4, guardian: 4, pathfinder: 4, catalyst: 4 });
});

test('the framework keeps identity in Christ above assessment labels', async () => {
  const data = await loadData();
  assert.match(data.guardrail, /mirror, not a verdict/i);
  assert.match(data.guardrail, /identity.*Christ/i);
  assert.match(data.purposeNote, /cannot tell you God/i);
});

test('Your Game page exposes assessment, daily practice, progress, and privacy', async () => {
  const html = await read('your-game.html');
  assert.match(html, /id="yg-app"/);
  assert.match(html, /Kingdom Identity &amp; Purpose Assessment/);
  assert.match(html, /stored only on this device/i);
  assert.match(html, /assets\/js\/your-game-data\.js/);
  assert.match(html, /assets\/js\/your-game-app\.js/);
  const sitemap = await read('sitemap.xml');
  assert.match(sitemap, /https:\/\/ballkingdom\.com\/your-game\.html/);
});

test('Your Game remains local-first and supports selective sharing', async () => {
  const app = await read('assets/js/your-game-app.js');
  assert.match(app, /localStorage/);
  assert.match(app, /navigator\.share/);
  assert.match(app, /navigator\.clipboard/);
  assert.doesNotMatch(app, /\bfetch\s*\(|XMLHttpRequest|sendBeacon/);
  assert.match(app, /bk_your_game_profile_v1/);
  assert.match(app, /bk_daily_game_log_v1/);
  assert.match(app, /name="moveDone"/);
});

test('Inner Game reads the Your Game role without exposing journal content', async () => {
  const growthApp = await read('assets/js/growth-app.js');
  assert.match(growthApp, /bk_your_game_profile_v1/);
  assert.match(growthApp, /Your Game/);
  assert.doesNotMatch(growthApp, /bk_daily_game_log_v1/);
});
