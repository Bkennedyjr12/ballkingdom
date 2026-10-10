import {publicGuide} from './public-chat-content.js';
// Public FAQ fallback only. No AI endpoint, backend request, telemetry, storage, or private-data access.
const make=(tag,text,attributes={})=>{const node=document.createElement(tag);if(text)node.textContent=text;for(const [k,v]of Object.entries(attributes))node.setAttribute(k,v);return node;};
const button=make('button','Ask The Ballers Kingdom',{'class':'tbk-chat-open','aria-controls':'tbk-chat-dialog'});
const dialog=make('dialog','',{'id':'tbk-chat-dialog','class':'tbk-chat'});
const head=make('div','',{'class':'tbk-chat-head'});head.append(make('h2','Ball Kingdom guide'));const close=make('button','Close',{'type':'button','aria-label':'Close service guide'});head.append(close);
const privacy=make('p','AI chat is not connected yet. This guide uses approved public service information. Your messages stay in this browser. Do not enter private or medical details.',{'class':'tbk-chat-note'});
const log=make('div','',{'class':'tbk-chat-log','role':'log','aria-live':'polite'});log.append(make('p','How can I help you find training, consulting, booking, or products?'));
const form=make('form');const label=make('label','Your public service question',{'for':'tbk-chat-question'});const input=make('input','',{'id':'tbk-chat-question','maxlength':'400','required':'','autocomplete':'off'});const send=make('button','Ask guide',{'type':'submit'});form.append(label,input,send);
const quick=make('div','',{'class':'tbk-chat-quick'});for(const text of ['Soccer training','Book a consultation','Digital products']){const item=make('button',text,{'type':'button'});item.addEventListener('click',()=>answer(text));quick.append(item);}
function answer(question){try{const response=publicGuide(question);log.append(make('p',question,{'class':'tbk-chat-question'}));const reply=make('div');reply.append(make('p',response.answer),make('a',response.label,{'href':response.link}));log.append(reply);while(log.children.length>10)log.firstElementChild.remove();input.value='';log.scrollTop=log.scrollHeight;}catch(error){log.append(make('p',error.message));}}
form.addEventListener('submit',event=>{event.preventDefault();answer(input.value);});button.addEventListener('click',()=>{dialog.showModal();input.focus();});close.addEventListener('click',()=>dialog.close());dialog.append(head,privacy,quick,log,form);document.body.append(button,dialog);
