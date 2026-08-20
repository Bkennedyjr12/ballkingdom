import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInvoiceRequest,
  isApprovalDue,
  validateAppointment,
} from '../src/domain/workflow.js';

const base = {
  serviceType: 'inspection',
  serviceName: 'Home Inspection',
  customerName: 'Ada Lovelace',
  customerEmail: 'ada@example.com',
  startsAt: new Date('2026-08-22T18:00:00.000Z'),
  amountCents: 45000,
  currency: 'USD',
  status: 'accepted',
};

test('validates and normalizes an accepted appointment', () => {
  const result = validateAppointment(base);
  assert.equal(result.customerEmail, 'ada@example.com');
  assert.equal(result.serviceType, 'inspection');
  assert.equal(result.amountCents, 45000);
});

test('rejects unknown services and invalid case-by-case amounts', () => {
  assert.throws(() => validateAppointment({...base, serviceType: 'other'}), /serviceType/);
  assert.throws(() => validateAppointment({...base, amountCents: 0}), /amountCents/);
  assert.throws(() => validateAppointment({...base, serviceType: 'consulting', amountCents: 10.5}), /amountCents/);
});

test('allows training to use its QuickBooks catalog price', () => {
  const result = validateAppointment({
    ...base,
    serviceType: 'training',
    serviceName: '60 Minute Training Session',
    amountCents: undefined,
  });
  assert.equal(result.amountCents, null);
});

test('approval becomes due at the 24-hour boundary, never after start', () => {
  assert.equal(isApprovalDue(base, new Date('2026-08-21T17:59:59.999Z')), false);
  assert.equal(isApprovalDue(base, new Date('2026-08-21T18:00:00.000Z')), true);
  assert.equal(isApprovalDue(base, new Date('2026-08-22T18:00:00.000Z')), false);
});

test('builds catalog and variable-price invoice requests', () => {
  assert.deepEqual(buildInvoiceRequest(validateAppointment(base)), {
    serviceType: 'inspection',
    itemName: 'Home Inspection',
    description: 'Home Inspection',
    amount: 450,
    useCatalogPrice: false,
  });
  const training = validateAppointment({...base, serviceType: 'training', serviceName: '60 Minute Training Session', amountCents: undefined});
  assert.equal(buildInvoiceRequest(training).useCatalogPrice, true);
});
