import { APPAREL_CATALOG, assessApparelReadiness } from './catalog.js';
const SIZES=new Set(['YS','YM','YL','YXL','XS','S','M','L','XL','2XL','3XL']);
const COLORS=new Set(['black','navy','dark-gray']);
const STATES=new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
function record(value,label){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`Invalid ${label}`);}
function text(value,label,max=100){if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f\x7f]/.test(value))throw new Error(`Invalid ${label}`);return value.trim();}
function cents(value,label){if(!Number.isSafeInteger(value)||value<0)throw new Error(`Invalid ${label}`);return value;}
export function normalizeApparelSelection(value){
  record(value,'selection');
  if(Object.keys(value).some(k=>!['productId','size','color','quantity'].includes(k)))throw new Error('Unsupported selection field');
  const {productId,size,color,quantity}=value;
  if(!APPAREL_CATALOG.some(p=>p.id===productId)||!SIZES.has(size)||!COLORS.has(color)||!Number.isInteger(quantity)||quantity<1||quantity>10)throw new Error('Invalid apparel selection');
  return {productId,size,color,quantity};
}
export function normalizeUSShippingAddress(value){
  record(value,'shipping address');
  if(Object.keys(value).some(k=>!['name','line1','line2','city','state','postalCode','country'].includes(k)))throw new Error('Unsupported address field');
  const address={name:text(value.name,'name'),line1:text(value.line1,'line1'),line2:value.line2==null||value.line2===''?'':text(value.line2,'line2'),city:text(value.city,'city'),state:text(value.state,'state',2).toUpperCase(),postalCode:text(value.postalCode,'postal code',10),country:value.country};
  if(address.country!=='US'||!STATES.has(address.state)||!/^\d{5}(-\d{4})?$/.test(address.postalCode))throw new Error('Unsupported US shipping address');
  return address;
}
// Inputs variant/shipping/tax must come from verified server adapters, never request data.
// This pure calculation does not reserve stock, accept payment, or activate a concept.
export function buildApparelQuote({selection,variant,shipping,tax,now}={}){
  const chosen=normalizeApparelSelection(selection);
  record(variant,'server variant');record(shipping,'shipping');record(tax,'tax');
  const readiness=assessApparelReadiness({...variant,shippingVerified:shipping.verified===true,taxVerified:tax.verified===true});
  if(!readiness.ready)throw new Error(`Apparel not ready: ${readiness.reasons.join('; ')}`);
  if(['productId','size','color'].some(k=>variant[k]!==chosen[k]))throw new Error('Server variant does not match selection');
  text(variant.supplierSku,'supplier SKU',200);
  const address=normalizeUSShippingAddress(shipping.address);
  const shippingCents=cents(shipping.amountCents,'shipping amount');
  const taxCents=cents(tax.amountCents,'tax amount');
  const subtotalCents=cents(variant.unitPriceCents*chosen.quantity,'subtotal');
  const totalCents=cents(subtotalCents+shippingCents+taxCents,'total');
  if(!Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(now+900000))throw new Error('Invalid quote time');
  return {merchantName:'The Ballers Kingdom',currency:'USD',selection:chosen,supplierSku:variant.supplierSku,unitPriceCents:variant.unitPriceCents,subtotalCents,shippingCents,taxCents,totalCents,address,createdAt:now,expiresAt:now+900000};
}
