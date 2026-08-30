import test from 'node:test';
import assert from 'node:assert/strict';
import {createLazyProvider} from '../../src/commerce/lazy-provider.js';

test('a failing auth-mail provider stays isolated from a lazy Accounting provider', async () => {
  let graphCreations = 0;
  let accountingCreations = 0;
  const graph = createLazyProvider(() => {
    graphCreations += 1;
    throw new Error('invalid Graph configuration');
  }, ['sendPilotAuthLink']);
  const accounting = createLazyProvider(() => {
    accountingCreations += 1;
    return {async getInvoice(id) { return {invoiceId:id}; }};
  }, ['getInvoice']);

  assert.equal(graphCreations, 0);
  assert.equal(accountingCreations, 0);
  await assert.rejects(graph.sendPilotAuthLink({}), /invalid Graph configuration/);
  assert.deepEqual(await accounting.getInvoice('invoice-1'), {invoiceId:'invoice-1'});
  assert.deepEqual(await accounting.getInvoice('invoice-2'), {invoiceId:'invoice-2'});
  assert.equal(graphCreations, 1);
  assert.equal(accountingCreations, 1);
});
