import test from 'node:test';
import assert from 'node:assert/strict';
import {createIntegrationService} from '../../src/orchestration.js';
import {createCommerceService} from '../../src/commerce/commerce-service.js';
import {readFile} from 'node:fs/promises';

const appointment = Object.freeze({
  serviceType:'inspection',serviceName:'Home Inspection',customerName:'Ada',
  customerEmail:'ada@example.com',startsAt:new Date('2026-08-22T18:00:00Z'),
  amountCents:45000,currency:'USD',status:'accepted',
});

function harness({serviceEnabled=false,digitalEnabled=false} = {}) {
  const events=[];
  let storedAppointment=appointment;
  const repository={
    async claimConfirmation(){events.push('claimConfirmation');return true;},
    async completeConfirmation(){events.push('completeConfirmation');},
    async failConfirmation(){},
    async claimApproval(){events.push('claimApproval');return {id:'appt-1',...storedAppointment,approvalClaimId:'claim-1'};},
    async completeApproval(_id,_claimId,receipt){events.push(['completeApproval',receipt]);},
    async failApproval(){events.push('failApproval');},
  };
  const graph={
    async sendConfirmation(){events.push('graphConfirmation');return {accepted:true};},
    async sendInvoice(){events.push('graphInvoice');return {accepted:true};},
  };
  const quickbooks={
    async createInvoice(){events.push('legacyQboCreate');return {id:'legacy-1',number:'1001'};},
    async getInvoicePdf(){events.push('legacyPdf');return Buffer.from('pdf');},
  };
  const commerce={
    async createServiceOrder(id){events.push(['commerceOrder',id]);},
    async approveServiceInvoice(){events.push('commerceQboSend');return {
      invoiceId:'qbo-1',documentNumber:'2001',sendAccepted:true,
    };},
  };
  const service=createIntegrationService({repository,graph,quickbooks,commerce,
    readFeatureFlags:()=>({digitalInvoicePilotEnabled:digitalEnabled,serviceQboSendEnabled:serviceEnabled})});
  const originalConfirm=service.confirmAcceptedBooking.bind(service);
  service.confirmAcceptedBooking=async (id,value)=>{storedAppointment=value;return originalConfirm(id,value);};
  return {events,service};
}

test('both commerce flags default false and legacy service behavior is unchanged', async () => {
  const {events,service}=harness();
  await service.confirmAcceptedBooking('appt-1',appointment);
  await service.approveInvoice({appointmentId:'appt-1',auth:{uid:'admin',token:{admin:true}}});
  assert.deepEqual(events.map(event=>Array.isArray(event)?event[0]:event),[
    'claimConfirmation','graphConfirmation','completeConfirmation','claimApproval',
    'legacyQboCreate','legacyPdf','graphInvoice','completeApproval',
  ]);
});

test('enabled catalog-priced training stays on the unchanged legacy path without partial commerce state', async () => {
  const training={...appointment,serviceType:'training',serviceName:'Training Session',amountCents:null};
  const {events,service}=harness({serviceEnabled:true});
  await service.confirmAcceptedBooking('appt-1',training);
  await service.approveInvoice({appointmentId:'appt-1',auth:{uid:'admin',token:{admin:true}}});
  assert.equal(events.some(event=>Array.isArray(event) && event[0]==='commerceOrder'),false);
  assert.equal(events.includes('commerceQboSend'),false);
  assert.equal(events.includes('graphConfirmation'),true);
  assert.equal(events.includes('graphInvoice'),true);
  assert.equal(events.includes('legacyPdf'),true);
});

test('digital flag alone cannot migrate service invoicing', async () => {
  const {events,service}=harness({digitalEnabled:true});
  await service.confirmAcceptedBooking('appt-1',appointment);
  await service.approveInvoice({appointmentId:'appt-1',auth:{uid:'admin',token:{admin:true}}});
  assert.equal(events.some(event=>event === 'commerceQboSend' || event[0] === 'commerceOrder'),false);
  assert.equal(events.includes('graphInvoice'),true);
});

test('service flag creates an operational order but waits for approval before one QBO send', async () => {
  const {events,service}=harness({serviceEnabled:true});
  await service.confirmAcceptedBooking('appt-1',appointment);
  assert.deepEqual(events.slice(0,4).map(event=>Array.isArray(event)?event[0]:event),[
    'commerceOrder','claimConfirmation','graphConfirmation','completeConfirmation',
  ]);
  assert.equal(events.includes('commerceQboSend'),false);
  const result=await service.approveInvoice({appointmentId:'appt-1',auth:{uid:'admin',token:{admin:true}}});
  assert.deepEqual(result,{invoiceId:'qbo-1',invoiceNumber:'2001'});
  assert.equal(events.filter(event=>event === 'commerceQboSend').length,1);
  assert.equal(events.includes('graphInvoice'),false);
  assert.equal(events.includes('legacyPdf'),false);
  assert.deepEqual(events.at(-1)[1],{
    approvedBy:'admin',invoiceId:'qbo-1',invoiceNumber:'2001',qboSendAccepted:true,
  });
});

function integratedHarness({storedInvoice=false,ambiguousSend=false}={}) {
  const calls={create:0,send:0,fulfill:0};
  const order={id:'appt-1',sku:'service-inspection',name:'Home Inspection',amountCents:45000,
    currency:'USD',orderType:'service',fulfillmentType:'scheduled_service',
    customer:{name:'Ada',email:'ada@example.com'},status:'pending_invoice_approval',
    providerRefs:storedInvoice?{realmId:'realm-1',invoiceId:'invoice-1',customerId:'customer-1',providerOrderRef:'bk-order-appt-1'}:{}};
  const effects={
    invoice_create:{status:storedInvoice?'pending':'pending'},
    invoice_send:{status:ambiguousSend?'manual_review':'pending'},
  };
  const repository={
    async beginServiceInvoiceApproval(){if(order.status==='pending_invoice_approval') order.status='invoice_processing';return order.status;},
    async getOrder(){return structuredClone(order);},
    async claimEffect(_id,name){if(effects[name].status!=='pending')return false;effects[name].status='claimed';return {claimId:`${name}-claim`};},
    async getEffect(_id,name){return {...effects[name]};},
    async completeEffect(_id,name,_worker,_claim,result={}){effects[name].status='completed';Object.assign(order.providerRefs,result.providerRefs??{});},
    async markEffectDispatchStarted(){effects.invoice_send.dispatchStartedAt=new Date();},
    async recordEffectFailure(_id,name){effects[name].status=name==='invoice_send'?'manual_review':'pending';if(name==='invoice_send')order.status='manual_review';},
    async completeServiceInvoiceApproval(_id,receipt){order.status='invoiced';order.serviceInvoiceReceipt={...receipt};},
    async claimPaymentVerification(){order.paymentVerificationClaim={claimId:'pay-claim',workerId:'payment-verification-test'};return {claimId:'pay-claim'};},
    async completeVerifiedServiceOrder(){order.status='paid';},
    async completeVerifiedDigitalOrder(){calls.fulfill+=1;},
  };
  const evidence=()=>({realmId:'realm-1',invoice:{invoiceId:'invoice-1',providerOrderRef:'bk-order-appt-1',
    totalAmountCents:45000,balanceCents:0,currency:'USD',entityState:'present',paymentState:'paid'},
    payments:[{providerPaymentRef:'payment-1',totalAmountCents:45000,unappliedAmountCents:0,entityState:'present',
      applications:[{linkedTxnId:'invoice-1',linkedTxnType:'Invoice',amountCents:45000}]}]});
  const quickbooks={
    async createCommerceInvoice(){calls.create+=1;return {invoiceId:'invoice-1',customerId:'customer-1',documentNumber:'1001'};},
    async getInvoice(){return evidence();},
    async sendInvoice(){calls.send+=1;return {invoiceId:'invoice-1',sendAccepted:true};},
  };
  const service=createCommerceService({repository,quickbooks,graph:null,getApprovedPilotEmail:()=>'',
    readFeatureFlags:()=>({digitalInvoicePilotEnabled:false,serviceQboSendEnabled:true}),
    workerIdFactory:purpose=>`${purpose}-test`,sleep:()=>Promise.resolve(),
    fulfillDigitalOrder:async()=>{calls.fulfill+=1;}});
  return {service,order,effects,calls};
}

test('parallel approved service retries create and send exactly one Invoice', async()=>{
  const {service,calls,order}=integratedHarness();
  const results=await Promise.all([
    service.approveServiceInvoice({appointmentId:'appt-1'}),
    service.approveServiceInvoice({appointmentId:'appt-1'}),
  ]);
  assert.equal(calls.create,1);
  assert.equal(calls.send,1);
  assert.equal(order.status,'invoiced');
  assert.equal(results.every(result=>result.invoiceId==='invoice-1'),true);
});

test('a stored deterministic Invoice is recovered without another create',async()=>{
  const {service,calls,order}=integratedHarness({storedInvoice:true});
  await service.approveServiceInvoice({appointmentId:'appt-1'});
  assert.equal(calls.create,0);
  assert.equal(calls.send,1);
  assert.equal(order.status,'invoiced');
});

test('an ambiguous stale send is quarantined and never resent',async()=>{
  const {service,calls,order}=integratedHarness({storedInvoice:true,ambiguousSend:true});
  await assert.rejects(service.approveServiceInvoice({appointmentId:'appt-1'}),error=>error.code==='ORDER_MANUAL_REVIEW');
  assert.equal(calls.send,0);
  assert.notEqual(order.status,'paid');
});

test('exact Accounting evidence marks a service paid with zero digital fulfillment',async()=>{
  const {service,calls,order}=integratedHarness();
  await service.approveServiceInvoice({appointmentId:'appt-1'});
  const result=await service.verifyOrderPayment({orderId:'appt-1',source:'admin'});
  assert.equal(result.status,'paid');
  assert.equal(order.status,'paid');
  assert.equal(calls.fulfill,0);
});

test('appointment approval recovers after completion crash without another QBO send',async()=>{
  let appointmentStatus='pending';
  let completionCrashes=1;
  let commerceCalls=0;
  const repository={
    async claimApproval(){
      if(appointmentStatus!=='pending')return null;
      appointmentStatus='processing';
      return {id:'appt-1',...appointment,approvalClaimId:`claim-${commerceCalls+1}`};
    },
    async completeApproval(){
      if(completionCrashes-->0)throw new Error('injected completion crash');
      appointmentStatus='completed';
    },
    async failApproval(){appointmentStatus='pending';},
  };
  let invoiceCompleted=false;
  const commerce={
    async approveServiceInvoice(){commerceCalls+=1;if(invoiceCompleted)return {invoiceId:'invoice-1',documentNumber:'1001',sendAccepted:true,duplicate:true};invoiceCompleted=true;return {invoiceId:'invoice-1',documentNumber:'1001',sendAccepted:true};},
  };
  const service=createIntegrationService({repository,graph:null,quickbooks:null,commerce,
    readFeatureFlags:()=>({digitalInvoicePilotEnabled:false,serviceQboSendEnabled:true})});
  await assert.rejects(service.approveInvoice({appointmentId:'appt-1',auth:{uid:'admin',token:{admin:true}}}),/injected/);
  await service.approveInvoice({appointmentId:'appt-1',auth:{uid:'admin',token:{admin:true}}});
  assert.equal(appointmentStatus,'completed');
  assert.equal(commerceCalls,2);
  assert.equal(invoiceCompleted,true);
});

test('ambiguous service send quarantines the appointment instead of reopening approval',async()=>{
  let quarantined=false;
  const repository={
    async claimApproval(){return {id:'appt-1',...appointment,approvalClaimId:'claim-1'};},
    async quarantineApproval(_id,claimId,error){quarantined=claimId==='claim-1'&&error.code==='invoice_send_unknown';},
    async failApproval(){throw new Error('must not reopen');},
  };
  const commerce={async approveServiceInvoice(){const error=new Error('manual review');error.code='ORDER_MANUAL_REVIEW';throw error;}};
  const service=createIntegrationService({repository,graph:null,quickbooks:null,commerce,
    readFeatureFlags:()=>({digitalInvoicePilotEnabled:false,serviceQboSendEnabled:true})});
  await assert.rejects(service.approveInvoice({appointmentId:'appt-1',auth:{uid:'admin',token:{admin:true}}}),error=>error.code==='ORDER_MANUAL_REVIEW');
  assert.equal(quarantined,true);
});

test('production appointment approval uses a bounded exact-claim lease and expiry reclaim',async()=>{
  const source=await readFile(new URL('../../src/index.js',import.meta.url),'utf8');
  assert.match(source,/approval\.status === 'processing' && leaseExpiresAt <= now/);
  assert.match(source,/'invoiceApproval\.claimId':claimId/);
  assert.match(source,/now\+5\*60\*1000/);
  assert.match(source,/invoiceApproval\?\.claimId !== claimId/);
});
