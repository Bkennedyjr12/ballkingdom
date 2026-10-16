import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {GUMROAD_PRODUCTS,GUMROAD_STOREFRONT} from '../scripts/gumroad-catalog.mjs';
import {placements,synchronize} from '../scripts/build-gumroad-sections.mjs';

test('catalog includes every verified public Gumroad listing with the correct price and local cover',()=>{
 assert.equal(GUMROAD_PRODUCTS.length,3);
 assert.deepEqual(GUMROAD_PRODUCTS.map(p=>[p.url.split('/').pop(),p.priceCents]),[['gfjmoo',2900],['ofopvv',1200],['ejldv',4700]]);
 assert.equal(new Set(GUMROAD_PRODUCTS.map(p=>p.id)).size,GUMROAD_PRODUCTS.length);
 for(const p of GUMROAD_PRODUCTS){assert.equal(new URL(p.url).origin,'https://ballerskingdom.gumroad.com');assert.ok(existsSync(new URL('..'+p.cover,import.meta.url)));assert.equal(p.currency,'USD');}
});
test('static cards stay synchronized across all relevant pages and preserve safe external navigation',()=>{
 assert.deepEqual(synchronize({check:true}),[]);
 for(const [name,{file,ids}] of Object.entries(placements)){
  const html=readFileSync(new URL('../'+file,import.meta.url),'utf8');const section=html.split(`<!-- GUMROAD:${name}:START -->`)[1].split(`<!-- GUMROAD:${name}:END -->`)[0];
  for(const id of ids){const p=GUMROAD_PRODUCTS.find(p=>p.id===id);assert.ok(section.includes(p.url));assert.ok(section.includes(`data-gumroad-product="${id}"`));}
  assert.equal((section.match(/data-gumroad-product=/g)||[]).length,ids.length);
  assert.equal((section.match(/target="_blank" rel="noopener noreferrer"/g)||[]).length,ids.length);
  assert.ok(html.includes(GUMROAD_STOREFRONT));
 }
});
test('published downloads and future previews have separate availability language',()=>{
 const html=readFileSync(new URL('../products.html',import.meta.url),'utf8');assert.ok(html.includes('Future resources'));assert.ok(html.includes('data-product-grid'));assert.ok(html.includes('id="shop-now"'));assert.ok(!html.includes('The rest of the collection is available to preview'));assert.ok(!html.includes('Gumroad handles checkout and digital download delivery for The Recruiting'));
});
