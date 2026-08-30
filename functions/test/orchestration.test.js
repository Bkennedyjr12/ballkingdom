import test from 'node:test';
import assert from 'node:assert/strict';
import {createIntegrationService} from '../src/orchestration.js';

const appointment = {
  serviceType:'inspection', serviceName:'Home Inspection', customerName:'Ada',
  customerEmail:'ada@example.com', startsAt:new Date('2026-08-22T18:00:00Z'),
  amountCents:45000, currency:'USD', status:'accepted',
};

function harness(overrides = {}) {
  const events = [];
  const repository = {
    async claimConfirmation(id) { events.push(['claimConfirmation',id]); return true; },
    async completeConfirmation(id, receipt) { events.push(['completeConfirmation',id,receipt]); },
    async failConfirmation(id) { events.push(['failConfirmation',id]); },
    async listAcceptedBefore() { return [{id:'appt-1',...appointment}]; },
    async stageApproval(id, data) { events.push(['stageApproval',id,data]); return true; },
    async claimApproval(id, uid) { events.push(['claimApproval',id,uid]); return {id,...appointment,approvalClaimId:'claim-1'}; },
    async completeApproval(id, claimId, receipt) { events.push(['completeApproval',id,claimId,receipt]); },
    async failApproval(id) { events.push(['failApproval',id]); },
    ...overrides.repository,
  };
  const graph = {
    async sendConfirmation() { events.push(['sendConfirmation']); return {accepted:true}; },
    async sendInvoice() { events.push(['sendInvoice']); return {accepted:true}; },
    ...overrides.graph,
  };
  const quickbooks = {
    async createInvoice() { events.push(['createInvoice']); return {id:'30',number:'1001'}; },
    async getInvoicePdf() { events.push(['getInvoicePdf']); return Buffer.from('pdf'); },
    ...overrides.quickbooks,
  };
  return {events, service:createIntegrationService({repository,graph,quickbooks,clock:()=>new Date('2026-08-21T18:00:00Z')})};
}

test('accepted booking sends one automatic confirmation', async () => {
  const {events,service} = harness();
  await service.confirmAcceptedBooking('appt-1', appointment);
  assert.deepEqual(events.map(x=>x[0]), ['claimConfirmation','sendConfirmation','completeConfirmation']);
});

test('duplicate confirmation claim suppresses delivery', async () => {
  const {events,service} = harness({repository:{async claimConfirmation(){return false;}}});
  assert.equal((await service.confirmAcceptedBooking('appt-1', appointment)).duplicate, true);
  assert.deepEqual(events, []);
});

test('scheduler stages a due approval request without creating an invoice', async () => {
  const {events,service} = harness();
  const result = await service.stageDueApprovals();
  assert.equal(result.staged, 1);
  assert.deepEqual(events.map(x=>x[0]), ['stageApproval']);
});

test('approval requires an authenticated administrator', async () => {
  const {service} = harness();
  await assert.rejects(service.approveInvoice({appointmentId:'appt-1',auth:null}), /administrator/);
  await assert.rejects(service.approveInvoice({appointmentId:'appt-1',auth:{uid:'u',token:{admin:false}}}), /administrator/);
});

test('admin approval creates invoice, fetches PDF, then sends email once', async () => {
  const {events,service} = harness();
  const result = await service.approveInvoice({appointmentId:'appt-1',auth:{uid:'admin-1',token:{admin:true}}});
  assert.equal(result.invoiceNumber, '1001');
  assert.deepEqual(events.map(x=>x[0]), ['claimApproval','createInvoice','getInvoicePdf','sendInvoice','completeApproval']);
});
