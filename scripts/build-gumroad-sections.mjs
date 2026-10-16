import {readFileSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {GUMROAD_PRODUCTS, GUMROAD_STOREFRONT} from './gumroad-catalog.mjs';
const allIds=GUMROAD_PRODUCTS.map(p=>p.id);
const sportIds=GUMROAD_PRODUCTS.filter(p=>p.audience==='sport').map(p=>p.id);
const businessIds=GUMROAD_PRODUCTS.filter(p=>p.audience==='business').map(p=>p.id);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const placements=Object.freeze({products:{file:'products.html',ids:allIds},home:{file:'index.html',ids:allIds},training:{file:'soccer.html',ids:sportIds},shop:{file:'shop.html',ids:allIds},readiness:{file:'readiness.html',ids:businessIds}});
export function renderGumroad(ids){
 const cards=ids.map(id=>{
  const p=GUMROAD_PRODUCTS.find(p=>p.id===id);if(!p)throw new Error('Unknown public product: '+id);
  const price=new Intl.NumberFormat('en-US',{style:'currency',currency:p.currency,minimumFractionDigits:p.priceCents%100?2:0,maximumFractionDigits:2}).format(p.priceCents/100);
  return `<article class="gr-card" data-gumroad-product="${p.id}"><img class="gr-cover" src="${p.cover}" alt="${escape(p.name)} cover" width="1005" height="565" loading="lazy" decoding="async" /><p class="gr-category">${escape(p.category)}</p><h3>${escape(p.name)}</h3><p class="gr-description">${escape(p.description)}</p><div class="gr-purchase"><p class="gr-price">${price}<span>${p.currency} · Digital download</span></p><a class="btn btn-primary gr-cta" href="${p.url}" target="_blank" rel="noopener noreferrer">View on Gumroad <span aria-hidden="true">↗</span><span class="sr-only">: ${escape(p.name)} (opens in a new tab)</span></a></div></article>`;
 });
 const variant=ids.length===2?' gr-grid--two':ids.length===1?' gr-grid--single':'';
 return `<div class="gr-grid${variant}">\n${cards.join('\n')}\n</div>`;
}
export function synchronize({check=false}={}){
 const stale=[];
 for(const [placement,{file,ids}] of Object.entries(placements)){
  const path=resolve(root,file),before=readFileSync(path,'utf8');
  const start=`<!-- GUMROAD:${placement}:START -->`,end=`<!-- GUMROAD:${placement}:END -->`;
  const a=before.indexOf(start),b=before.indexOf(end);if(a<0||b<a)throw new Error('Missing catalog markers: '+file);
  const after=before.slice(0,a+start.length)+'\n'+renderGumroad(ids)+'\n'+before.slice(b);
  if(after!==before){stale.push(file);if(!check)writeFileSync(path,after);}
 }
 if(check&&stale.length)throw new Error('Gumroad sections out of date: '+stale.join(', '));
 return stale;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const stale=synchronize({check:process.argv.includes('--check')});
 console.log(JSON.stringify({products:GUMROAD_PRODUCTS.length,pages:Object.keys(placements).length,updated:stale,check:process.argv.includes('--check')}));
}
