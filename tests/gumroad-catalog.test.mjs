import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {GUMROAD_PRODUCTS,GUMROAD_PENDING} from '../scripts/gumroad-catalog.mjs';
import {placements,synchronize,renderGumroad,renderPending,productCollection} from '../scripts/build-gumroad-sections.mjs';

test('catalog retains verified original listings and validates every published product',()=>{
 const originals={recruiting:['gfjmoo',2900],'car-ride':['ofopvv',1200],scorecard:['ejldv',4700]};
 for(const [id,[slug,price]]of Object.entries(originals)){const p=GUMROAD_PRODUCTS.find(p=>p.id===id);assert.ok(p,id);assert.equal(p.url.split('/').pop(),slug);assert.equal(p.priceCents,price);}
 assert.equal(new Set(GUMROAD_PRODUCTS.map(p=>p.id)).size,GUMROAD_PRODUCTS.length);
 assert.equal(new Set(GUMROAD_PRODUCTS.map(p=>p.url)).size,GUMROAD_PRODUCTS.length);
 for(const p of GUMROAD_PRODUCTS){assert.equal(new URL(p.url).origin,'https://ballerskingdom.gumroad.com');assert.match(new URL(p.url).pathname,/^\/l\/[a-zA-Z0-9_-]+$/);assert.ok(existsSync(new URL('..'+p.cover,import.meta.url)),p.cover);assert.equal(p.currency,'USD');assert.ok(p.priceCents>0);assert.ok(['consulting','soccer','foundation','companions'].includes(productCollection(p)));}
});
test('static cards stay synchronized across every relevant page',()=>{
 assert.deepEqual(synchronize({check:true}),[]);
 for(const [name,{file,ids}]of Object.entries(placements)){
  const html=readFileSync(new URL('../'+file,import.meta.url),'utf8');const section=html.split(`<!-- GUMROAD:${name}:START -->`)[1].split(`<!-- GUMROAD:${name}:END -->`)[0];
  for(const id of ids){const p=GUMROAD_PRODUCTS.find(p=>p.id===id);assert.ok(section.includes(p.url));assert.ok(section.includes(`data-gumroad-product="${id}"`));}
  assert.equal((section.match(/data-gumroad-product=/g)||[]).length,ids.length);
  assert.equal((section.match(/target="_blank" rel="noopener noreferrer"/g)||[]).length,ids.length);
 }
 assert.ok(placements.home.ids.length<=3);
});
test('full collections are grouped and navigable without JavaScript',()=>{
 for(const name of ['products','shop']){
  const html=renderGumroad(placements[name].ids,{grouped:true,prefix:name});
  for(const group of new Set(GUMROAD_PRODUCTS.map(productCollection))){assert.ok(html.includes(`href="#${name}-${group}"`));assert.ok(html.includes(`id="${name}-${group}"`));}
 }
});
test('staged release records twelve published products and two prepared resources honestly',()=>{
 assert.equal(GUMROAD_PRODUCTS.length,12);
 assert.equal(GUMROAD_PENDING.length,2);
 const coverage=[...GUMROAD_PRODUCTS,...GUMROAD_PENDING];
 for(const lane of ['life','academic','career','business','digital','physiological','technical','tactical','psychological','political','soccer-bundle','four-pillars'])assert.ok(coverage.some(p=>p.lane===lane),lane);
 assert.equal(GUMROAD_PRODUCTS.filter(p=>p.lane==='business').length,1);
 assert.deepEqual(new Set(GUMROAD_PENDING.map(p=>p.lane)),new Set(['tactical','soccer-bundle']));
 for(const p of GUMROAD_PENDING){assert.equal(p.status,'prepared');assert.ok(!p.url);assert.ok(!GUMROAD_PRODUCTS.some(live=>live.id===p.id));}
 const pending=renderPending();assert.ok(!/<a(?:\s|>)/.test(pending));assert.ok(!pending.includes('data-gumroad-product='));assert.ok(!pending.includes('daily'));assert.ok(pending.includes('Coming soon'));
 for(const name of ['products','shop','training']){const html=renderGumroad(placements[name].ids,{grouped:true,prefix:name});for(const p of GUMROAD_PENDING)assert.ok(html.includes(`data-gumroad-pending="${p.id}"`));}
 const flagship=GUMROAD_PRODUCTS.find(p=>p.lane==='four-pillars');assert.ok(placements.home.ids.includes(flagship.id));assert.ok(placements.home.ids.includes('matchday-body'));assert.ok(placements.home.ids.includes('scorecard'));
});
test('paid downloads stay separate from future previews and inspection stays quiet',()=>{
 const html=readFileSync(new URL('../products.html',import.meta.url),'utf8');assert.ok(html.includes('Future resources'));assert.ok(html.includes('data-product-grid'));assert.ok(html.includes('id="shop-now"'));
 for(const p of GUMROAD_PRODUCTS)assert.ok(!p.id.includes('inspection'));
});
