import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const source=()=>readFileSync(new URL('../college-by-design.html',import.meta.url),'utf8');
test('college toolkit states the approved price and actual self-guided delivery',()=>{
 const html=source();assert.match(html,/\$49/);assert.match(html,/23-page/);assert.match(html,/self-guided/i);assert.match(html,/does not include live classes/i);
 for(const label of ['Preparing for college','Already enrolled','Returning to college','Families'])assert.ok(html.includes(label),label);
});
test('blocked checkout cannot be mistaken for an available paid product',()=>{
 const html=source();assert.match(html,/check current purchase availability on Gumroad/i);assert.match(html,/data-college-availability="provider"/);
 assert.ok(html.includes('https://ballerskingdom.gumroad.com/college-by-design'));
 assert.ok(!html.includes('https://ballerskingdom.gumroad.com/l/college-by-design'));
 assert.ok(!html.includes('data-gumroad-action="buy"'));
});
test('public sample and cover exist while paid and internal files stay out of the page',()=>{
 const html=source();assert.ok(html.includes('/assets/downloads/college-by-design-sample.pdf'));
 assert.ok(existsSync(new URL('../assets/downloads/college-by-design-sample.pdf',import.meta.url)));
 assert.ok(existsSync(new URL('../assets/img/gumroad-college-by-design.png',import.meta.url)));
 for(const text of ['Doctoral_Concept.pdf','Pilot_Playbook.pdf','Founder_Story_Guide.pdf','student-family-toolkit.zip','First_Edition.zip'])assert.ok(!html.includes(text),text);
});
test('new program is discoverable through existing public entry points',()=>{
 for(const file of ['products.html','ee-venture.html','index.html'])assert.ok(readFileSync(new URL('../'+file,import.meta.url),'utf8').includes('/college-by-design.html'),file);
 assert.ok(readFileSync(new URL('../sitemap.xml',import.meta.url),'utf8').includes('https://ballkingdom.com/college-by-design'));
});
test('public builder allows only the specific preview PDF and new program route',()=>{
 const build=readFileSync(new URL('../scripts/build-site-preview.mjs',import.meta.url),'utf8');
 assert.ok(build.includes('college-by-design'));assert.ok(build.includes('college-by-design-sample.pdf'));
 assert.ok(!/assets\\\/downloads\\\/\.\*/.test(build));
});
