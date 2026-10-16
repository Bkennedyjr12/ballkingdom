import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const page = readFileSync(new URL('../strategy-session.html', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../admin-strategy-session.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('../sitemap.xml', import.meta.url), 'utf8');
const js = readFileSync(new URL('../assets/js/strategy-session.js', import.meta.url), 'utf8');
test('strategy page defaults to a fail-closed opening-soon button', () => {
  assert.match(page, /aria-disabled="true" data-strategy-checkout>Paid checkout opening soon</);
  assert.match(page, /data-strategy-form hidden/);
  assert.match(page, /\$100 \(tax included\)/);
  assert.doesNotMatch(page, /ampac/i.test(page.replace(/brian-kennedy-jr-ampac/g,'')) ? /AmPac/ : /$^/);
  assert.match(js, /closed\(\);/);
});
test('admin page is non-indexed and not in the sitemap', () => {
  assert.match(admin, /noindex,nofollow/);
  assert.doesNotMatch(sitemap, /admin-strategy-session/);
  assert.doesNotMatch(admin, /ampac/i);
});
