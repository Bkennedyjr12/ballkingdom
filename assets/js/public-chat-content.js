export const FAQ=Object.freeze({
 training:{answer:'The Ballers Kingdom offers private, small-group, and team soccer training. Start with a consultation to discuss the right format and availability.',link:'/soccer',label:'Explore training'},
 consulting:{answer:'Consulting covers life, academic, career, business, and digital development. A consultation is the starting point for discussing your goal and scope.',link:'/yvp',label:'Explore consulting'},
 booking:{answer:'Use the contact page to find the current consultation booking path. Availability and any service terms are confirmed through that process.',link:'/contact',label:'Contact and book'},
 products:{answer:'The public products page lists digital guides and personalized-solution options. Check that page for current availability and purchase details.',link:'/products',label:'View products'},
 shop:{answer:'Kingdom Goods is our coming-soon apparel shop, to be operated by Building Kingdoms Collaborative, doing business as The Builders Kingdom. Preview the collection; apparel checkout is not live.',link:'/shop#apparel-collection',label:'Preview Kingdom Goods'},
 purpose:{answer:'Your Game is the public contribution-role and daily-practice tool. Its current page explains how device-only assessment and journal data are handled.',link:'/your-game',label:'Open Your Game'},
 contact:{answer:'For service questions that need a person, contact The Ballers Kingdom through the public contact page. This guide cannot access accounts, private workout plans, or booking records.',link:'/contact',label:'Contact The Ballers Kingdom'}
});
export const PUBLIC_LINKS=Object.freeze([...new Set(Object.values(FAQ).map(item=>item.link))]);
export function restrictedQuestion(question){return /\b(diagnos\w*|medical|medication|injur\w*|pain|pregnan\w*|diet|calories|weight\s*loss|private\s+(plan|record)|my\s+workout|password|token|secret|ssn)\b/i.test(question)||/\S+@\S+\.\S+|\b\d{3}[- .]?\d{3}[- .]?\d{4}\b/.test(question);}
export function publicGuide(question){
 if(typeof question!=='string'||!question.trim()||question.length>400)throw new Error('Ask a public service question using 1 to 400 characters.');
 if(restrictedQuestion(question))return {mode:'faq',answer:'Please keep personal, account, medical, and private workout details out of this public guide. A private conversation with an appropriate professional is the right next step.',link:'/contact',label:'Contact The Ballers Kingdom'};
 let id='contact';if(/soccer|coach|train|group|team/i.test(question))id='training';else if(/book|schedule|appointment|availability/i.test(question))id='booking';else if(/consult|career|business|academic|digital/i.test(question))id='consulting';else if(/product|guide|toolkit/i.test(question))id='products';else if(/shop|apparel|hoodie|shirt/i.test(question))id='shop';else if(/your game|purpose|roles/i.test(question))id='purpose';
 return {mode:'faq',...FAQ[id]};
}
