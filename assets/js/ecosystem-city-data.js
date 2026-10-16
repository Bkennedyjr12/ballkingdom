// Public geographic context is never treated as verified Ecosystem membership.
export const DEFAULT_CITY = Object.freeze({ name: 'Ontario, California, USA', lat: 34.0633, lon: -117.6509 });
export function category(tags = {}) {
  if (['school','college','university','kindergarten','library'].includes(tags.amenity)) return 'education';
  if (['bank','atm','bureau_de_change'].includes(tags.amenity)) return 'finance';
  if (['community_centre','social_facility','townhall','place_of_worship','public_building'].includes(tags.amenity) || tags.office === 'government' || tags.office === 'ngo') return 'community';
  return 'business';
}
export function normalizePlace(el) {
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180 || typeof el.tags?.name !== 'string') return null;
  if (!['node','way','relation'].includes(el.type) || !Number.isInteger(el.id) || el.id <= 0) return null;
  return Object.freeze({id:`${el.type}/${el.id}`,name:el.tags.name.slice(0,200),lat,lon,category:category(el.tags),kind:el.tags.amenity||el.tags.shop||el.tags.office||'place',address:[el.tags['addr:housenumber'],el.tags['addr:street'],el.tags['addr:city']].filter(Boolean).join(' '),source:`https://www.openstreetmap.org/${el.type}/${el.id}`,member:false});
}
export function normalizePlaces(payload) {
  if (!Array.isArray(payload?.elements)) throw new Error('The places service returned an unexpected response.');
  const seen=new Set();return payload.elements.map(normalizePlace).filter(p=>{if(!p||seen.has(p.id))return false;seen.add(p.id);return true}).slice(0,200);
}
export function buildPlacesQuery(bounds) {
  const {south,west,north,east}=bounds;
  if (![south,west,north,east].every(Number.isFinite) || south>=north || west>=east || south< -90 || north>90 || west< -180 || east>180) throw new Error('Choose a map area away from the date line, then try again.');
  if (north-south>.1 || east-west>.13) throw new Error('Zoom into a neighborhood before loading places.');
  const box=[south,west,north,east].map(n=>n.toFixed(6)).join(',');
  return `[out:json][timeout:20];(nwr["name"]["shop"](${box});nwr["name"]["office"](${box});nwr["name"]["amenity"~"^(school|college|university|kindergarten|library|bank|community_centre|social_facility|townhall|place_of_worship|cafe|restaurant|clinic|hospital)$"](${box}););out center 200;`;
}
export function filterPlaces(places,type,query='') {const q=query.trim().toLowerCase();return places.filter(p=>(type==='all'||p.category===type)&&p.name.toLowerCase().includes(q));}
export function supportFor(place) {
  if(place.category==='education') return ['Explore entrepreneurship education and workforce training.','Verify whether the institution offers advising, incubators, or facilities.','Confirm a partner relationship before recording referrals.'];
  if(place.category==='community') return ['Explore community connections, meeting space, and outreach.','Verify services, eligibility, capacity, and referral contacts.','Confirm participation before representing this place as a partner.'];
  if(place.category==='finance') return ['Verify available products, service area, and eligibility.','Explore capital-readiness education and qualified lender referrals.','A mapped financial institution is not a verified funding partner.'];
  return ['Start with a business and technology readiness assessment.','Identify needs across capital, contracts, coaching, and operations.','Agree on a support plan with the entrepreneur and confirm partner handoffs.'];
}
