// Concept catalogue only. Publication does not authorize physical fulfillment.
const images = {'tee-bk':'apparel-tee-bk.jpg','tee-jr':'apparel-tee-jr-v3.jpg','tee-la':'apparel-tee-la-v3.jpg','tee-aa':'apparel-tee-aa-v3.jpg','tee-av':'apparel-tee-av-v3.jpg','tee-cb':'apparel-tee-cb-v3.jpg','club-polo':'apparel-club-polo.jpg','signature-polo':'apparel-polo-wordmark-v3.jpg','quarter-zip':'apparel-quarter-zip.jpg','sweatpants':'apparel-sweatpants.jpg','training-shorts':'apparel-training-shorts.jpg','smart-pants':'apparel-smart-pants-v2.jpg'};
const concepts = [
  ['tee-bk','BK Signature Tee'], ['tee-jr','JR Tee'], ['tee-la','LA Tee'],
  ['tee-aa','AA Tee'], ['tee-av','AV Tee'], ['tee-cb','CB Tee'],
  ['club-polo','Club Polo'], ['signature-polo','Signature Polo'],
  ['quarter-zip','Quarter Zip'], ['sweatpants','Sweatpants'],
  ['training-shorts','Training Shorts'], ['smart-pants','Smart Pants'],
];
export const APPAREL_CATALOG = Object.freeze(concepts.map(([id,name]) => Object.freeze({
  id,name,image:`/assets/img/${images[id]}`,comingSoon:true,
})));
export function assessApparelReadiness(config = {}) {
  const reasons=[];
  if(config.verified!==true) reasons.push('Supplier variant has not been verified');
  if(typeof config.supplierSku!=='string'||!config.supplierSku.trim()) reasons.push('Actual supplier SKU required');
  if(config.artworkApproved!==true) reasons.push('Artwork approval required');
  if(config.sampleApproved!==true) reasons.push('Physical sample approval required');
  if(config.merchantName!=='The Ballers Kingdom') reasons.push('Exact merchant identity required');
  if(config.currency!=='USD') reasons.push('Verified USD currency required');
  if(!Number.isSafeInteger(config.unitPriceCents)||config.unitPriceCents<=0) reasons.push('Verified positive selling price required');
  if(!Number.isSafeInteger(config.landedCostCents)||config.landedCostCents<0) reasons.push('Verified landed cost required');
  if(config.shippingVerified!==true) reasons.push('Verified shipping required');
  if(config.taxVerified!==true) reasons.push('Verified tax required');
  return {ready:reasons.length===0,reasons};
}
