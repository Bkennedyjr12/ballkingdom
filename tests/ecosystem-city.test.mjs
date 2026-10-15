import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePlace,normalizePlaces,buildPlacesQuery,filterPlaces,supportFor} from '../assets/js/ecosystem-city-data.js';
const place=(id,tags={},other={})=>({type:'node',id,lat:34.06,lon:-117.65,tags:{name:'Test Business',...tags},...other});
test('public listings cannot confer verified Ecosystem membership',()=>{
 const p=normalizePlace(place(1,{member:true,partner:true}));assert.equal(p.member,false);assert.equal(p.source,'https://www.openstreetmap.org/node/1');assert.equal(p.category,'business');
});
test('invalid coordinates, unnamed places and malformed identifiers are rejected',()=>{
 for (const p of [place(1,{}, {lat:NaN}),place(1,{}, {lon:181}),place(1,{name:undefined}),place(-1),place(1,{}, {type:'<script>'}),place(1,{}, {lat:'34'})])assert.equal(normalizePlace(p),null);
});
test('ways use center coordinates; response deduplicates and caps results',()=>{
 assert.equal(normalizePlace(place(1,{amenity:'school'},{type:'way',lat:undefined,lon:undefined,center:{lat:34,lon:-117}})).category,'education');
 const list=normalizePlaces({elements:[place(1),place(1),...Array.from({length:250},(_,i)=>place(i+2))]});assert.equal(list.length,200);assert.equal(new Set(list.map(p=>p.id)).size,200);assert.throws(()=>normalizePlaces({error:'busy'}));
});
test('geographic queries are bounded and reject broad or crossing areas',()=>{
 assert.match(buildPlacesQuery({south:34,west:-117.7,north:34.05,east:-117.65}),/34\.000000,-117\.700000,34\.050000,-117\.650000/);
 for (const b of [{south:34,west:-118,north:35,east:-117},{south:34,west:179,north:34.01,east:-179},{south:NaN,west:-117.7,north:34.05,east:-117.65}])assert.throws(()=>buildPlacesQuery(b));
});
test('filters retain only matching type and literal name; pathways remain suggestions',()=>{
 const p=[normalizePlace(place(1,{amenity:'school',name:'Ontario School'})),normalizePlace(place(2,{name:'Ontario Cafe'}))];assert.equal(filterPlaces(p,'education','ONTARIO').length,1);assert.equal(filterPlaces(p,'all','<script>').length,0);assert.match(supportFor(p[0]).join(' '),/Confirm a partner relationship/);
});
