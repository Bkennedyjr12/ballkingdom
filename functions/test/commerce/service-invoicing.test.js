import test from 'node:test';
import assert from 'node:assert/strict';
import {createIntegrationService} from '../../src/orchestration.js';

const appointment = Object.freeze({
  serviceType:'inspection',serviceName:'Home Inspection',customerName:'Ada',
  customerEmail:'ada@example.com',startsAt:new Date('2026-08-22T18:00:00Z'),
  amountCents:45000,currency:'USD',status:'accepted',
});

function harness({serviceEnabled=false,digitalEnabled=false} = {}) {
  const events=[];
  const repository={
    async claimConfirmation(){events.push('claimConfirmation');return true;},
    async completeConfirmation(){events.push('completeConfirmation');},
    async failConfirmation(){},
    async claimApproval(){events.push('claimApproval');return {id:'appt-1',...appointment};},
    async completeApproval(_id,receipt){events.push(['completeApproval',receipt]);},
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
