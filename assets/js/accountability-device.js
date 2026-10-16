import {DAILY_KEY,LINKS_KEY,emptyLinks,validateLinks,replaceLinkedPlan,unlinkPlan,weekSummary} from './accountability-model.js';
export function createDeviceAccountability(storage,{onChange=()=>{}}={}){
 const read=(key,fallback)=>{try{const raw=storage.getItem(key);return raw===null?fallback:JSON.parse(raw);}catch{throw new Error('Device storage is unavailable. No journal or link was changed.');}};
 const links=()=>validateLinks(read(LINKS_KEY,emptyLinks()));
 const write=value=>{try{storage.setItem(LINKS_KEY,JSON.stringify(value));}catch{throw new Error('Device storage is full or blocked. This link was not saved.');}onChange();};
 return Object.freeze({links,journal:()=>read(DAILY_KEY,[]),isLinked:key=>Object.hasOwn(links().plans,key),link:(key,sessions)=>{write(replaceLinkedPlan(links(),key,sessions));},sync:(key,sessions)=>{const value=links();if(Object.hasOwn(value.plans,key))write(replaceLinkedPlan(value,key,sessions));},disconnect:key=>write(unlinkPlan(links(),key)),summary:date=>weekSummary(read(DAILY_KEY,[]),links(),date)});
}
export function browserAccountability(){return createDeviceAccountability(window.localStorage,{onChange:()=>window.dispatchEvent(new Event('tbk-accountability-changed'))});}
