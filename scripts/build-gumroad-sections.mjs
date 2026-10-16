import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {GUMROAD_PRODUCTS,GUMROAD_PENDING} from './gumroad-catalog.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const productCollection=p=>p.collection||(p.id==='scorecard'?'consulting':'companions');
const idsWhere=fn=>GUMROAD_PRODUCTS.filter(fn).map(p=>p.id);
const allIds=idsWhere(()=>true),businessIds=idsWhere(p=>p.lane==='business'||p.id==='scorecard');
const flagship=GUMROAD_PRODUCTS.find(p=>p.lane==='four-pillars'||p.id==='train-develop-serve-lead');
const bundle=GUMROAD_PRODUCTS.find(p=>p.lane==='soccer-bundle'||p.id==='complete-soccer-development-toolkit');
const soccerFallback=GUMROAD_PRODUCTS.find(p=>p.id==='matchday-body'||p.lane==='physiological');
const compact=flagship?[flagship.id,(bundle||soccerFallback)?.id,...businessIds].filter(Boolean).slice(0,3):allIds.slice(0,3);
const lane=l=>idsWhere(p=>p.lane===l);
export const placements=Object.freeze({products:{file:'products.html',ids:allIds,grouped:true},home:{file:'index.html',ids:compact},training:{file:'soccer.html',ids:idsWhere(p=>['soccer','companions'].includes(productCollection(p))),grouped:true},shop:{file:'shop.html',ids:allIds,grouped:true},readiness:{file:'readiness.html',ids:businessIds},consulting:{file:'ee-venture.html',ids:idsWhere(p=>productCollection(p)==='consulting'),grouped:true},life:{file:'growth.html',ids:lane('life')},career:{file:'career-blueprint.html',ids:lane('career')},digital:{file:'technology.html',ids:lane('digital')},ai:{file:'ai-readiness.html',ids:lane('digital')}});
const groups=[['foundation','Train · Develop · Serve · Lead','A whole-person practice connecting training, growth, service, and leadership. Brian’s Christian faith shapes the framework; faith reflections in the workbook are optional.'],['consulting','Consulting resources','Self-guided resources across Life, Academic, Career, Business, and Digital development.'],['soccer','Soccer development','Five connected areas: physiological, technical, tactical, psychological, and political realities of the game—including roles, selection, and club systems.'],['companions','For players & families','Companion guides for recruiting decisions and conversations beyond the final whistle.']];
function cards(ids){
 const variant=ids.length===2?' gr-grid--two':ids.length===1?' gr-grid--single':'';
 return `<div class="gr-grid${variant}">\n${ids.map(id=>{
 const p=GUMROAD_PRODUCTS.find(p=>p.id===id);if(!p)throw Error('Unknown public product: '+id);
 const price=new Intl.NumberFormat('en-US',{style:'currency',currency:p.currency,minimumFractionDigits:p.priceCents%100?2:0,maximumFractionDigits:2}).format(p.priceCents/100);
 return `<article class="gr-card" data-gumroad-product="${escape(p.id)}"><img class="gr-cover" src="${escape(p.cover)}" alt="${escape(p.name)} cover" width="1600" height="900" loading="lazy" decoding="async" /><p class="gr-category">${escape(p.category||p.lane)}</p><h3>${escape(p.name)}</h3><p class="gr-description">${escape(p.description)}</p><div class="gr-purchase"><p class="gr-price">${price}<span>${escape(p.currency)} · ${p.lane==='soccer-bundle'?'Digital collection':'Digital download'}</span></p><a class="btn btn-primary gr-cta" href="${escape(p.url)}" target="_blank" rel="noopener noreferrer">View on Gumroad <span aria-hidden="true">↗</span><span class="sr-only">: ${escape(p.name)} (opens in a new tab)</span></a></div></article>`;
 }).join('\n')}\n</div>`;
}
export function renderPending(){
 if(!GUMROAD_PENDING.length)return '';
 return `<aside class="gr-pending" aria-label="Upcoming resources"><p class="kicker">Coming soon</p><h3>More ways to develop your game.</h3><ul>${GUMROAD_PENDING.map(p=>`<li data-gumroad-pending="${escape(p.id)}">${escape(p.name)} <span>· Coming soon</span></li>`).join('')}</ul><p>These resources are not available to purchase yet.</p></aside>`;
}
export function renderGumroad(ids,{grouped=false,prefix='collection'}={}){
 if(!ids.length)return '<p class="gr-empty">Explore the <a href="/products.html">published product collection</a> for current resources.</p>';
 if(!grouped)return cards(ids);
 const used=groups.filter(([key])=>ids.some(id=>productCollection(GUMROAD_PRODUCTS.find(p=>p.id===id))===key));
 return `<nav class="gr-collections" aria-label="Product collections">${used.map(([key,title])=>`<a href="#${prefix}-${key}">${title}</a>`).join('')}</nav>\n${used.map(([key,title,intro])=>`<section class="gr-collection" id="${prefix}-${key}" aria-labelledby="${prefix}-${key}-title"><div class="gr-collection-heading"><p class="kicker">${escape(key==='companions'?'Players & families':key)}</p><h3 id="${prefix}-${key}-title">${escape(title)}</h3><p>${escape(intro)}</p></div>${cards(ids.filter(id=>productCollection(GUMROAD_PRODUCTS.find(p=>p.id===id))===key))}</section>`).join('\n')}${['products','shop','training'].includes(prefix)?renderPending():''}`;
}
export function synchronize({check=false}={}){
 const stale=[];
 for(const [placement,{file,ids,grouped}]of Object.entries(placements)){
 const path=resolve(root,file),before=readFileSync(path,'utf8');const start=`<!-- GUMROAD:${placement}:START -->`,end=`<!-- GUMROAD:${placement}:END -->`;const a=before.indexOf(start),b=before.indexOf(end);if(a<0||b<a)throw Error('Missing catalog markers: '+file);
 const after=before.slice(0,a+start.length)+'\n'+renderGumroad(ids,{grouped,prefix:placement})+'\n'+before.slice(b);
 if(after!==before){stale.push(file);if(!check)writeFileSync(path,after);}
 }
 if(check&&stale.length)throw Error('Gumroad sections out of date: '+stale.join(', '));return stale;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const stale=synchronize({check:process.argv.includes('--check')});console.log(JSON.stringify({products:GUMROAD_PRODUCTS.length,pages:Object.keys(placements).length,updated:stale,check:process.argv.includes('--check')}));}
