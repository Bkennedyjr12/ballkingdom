import test from 'node:test';
import assert from 'node:assert/strict';
import {createGraphClient} from '../src/providers/microsoft-graph.js';
import {createQuickBooksClient} from '../src/providers/quickbooks.js';

function response(body, status = 200, headers = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json', ...headers},
  });
}

test('Graph refreshes delegated OAuth and sends confirmation from info mailbox', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({url: String(url), options});
    if (calls.length === 1) return response({access_token: 'graph-access', refresh_token: 'graph-next'});
    return response('', 202);
  };
  const rotated = [];
  const graph = createGraphClient({
    tenantId: 'tenant', clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh',
    sender: 'info@ballkingdom.com', onRefreshToken: token => rotated.push(token),
  }, fetchMock);
  await graph.sendConfirmation({
    to: 'ada@example.com', customerName: 'Ada', serviceName: 'Home Inspection',
    startsAt: new Date('2026-08-22T18:00:00Z'), idempotencyKey: 'appointment-1-confirmation',
  });
  assert.match(calls[0].url, /tenant\/oauth2\/v2\.0\/token/);
  assert.equal(calls[1].url, 'https://graph.microsoft.com/v1.0/me/sendMail');
  const message = JSON.parse(calls[1].options.body).message;
  assert.match(message.subject, /confirmed/i);
  assert.equal(message.toRecipients[0].emailAddress.address, 'ada@example.com');
  assert.deepEqual(rotated, ['graph-next']);
});

test('Graph invoice email includes the PDF attachment', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({url: String(url), options});
    return calls.length === 1 ? response({access_token: 'token'}) : response('', 202);
  };
  const graph = createGraphClient({tenantId:'t',clientId:'c',clientSecret:'s',refreshToken:'r',sender:'info@ballkingdom.com'}, fetchMock);
  await graph.sendInvoice({to:'ada@example.com',customerName:'Ada',invoiceNumber:'1001',pdf:Buffer.from('pdf')});
  const attachment = JSON.parse(calls[1].options.body).message.attachments[0];
  assert.equal(attachment.name, 'Ballers-Kingdom-Invoice-1001.pdf');
  assert.equal(attachment.contentBytes, Buffer.from('pdf').toString('base64'));
});

test('QuickBooks creates a variable-price invoice using customer and item references', async () => {
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    calls.push({url: String(url), options});
    if (calls.length === 1) return response({access_token:'qbo-access',refresh_token:'qbo-next'});
    if (calls.length === 2) return response({QueryResponse:{Customer:[{Id:'10'}]}});
    if (calls.length === 3) return response({QueryResponse:{Item:[{Id:'20',UnitPrice:125}]}});
    return response({Invoice:{Id:'30',DocNumber:'1001'}});
  };
  const client = createQuickBooksClient({clientId:'c',clientSecret:'s',refreshToken:'r',realmId:'realm'}, fetchMock);
  const invoice = await client.createInvoice({customerName:'Ada',customerEmail:'ada@example.com',itemName:'Home Inspection',description:'Home Inspection',amount:450,useCatalogPrice:false,appointmentId:'appt-1'});
  assert.equal(invoice.id, '30');
  const payload = JSON.parse(calls[3].options.body);
  assert.equal(payload.Line[0].Amount, 450);
  assert.equal(payload.Line[0].SalesItemLineDetail.ItemRef.value, '20');
});

test('provider errors omit OAuth tokens', async () => {
  const graph = createGraphClient({tenantId:'t',clientId:'c',clientSecret:'very-secret',refreshToken:'refresh-secret',sender:'info@ballkingdom.com'}, async () => response({error:'invalid'}, 401));
  await assert.rejects(graph.sendConfirmation({to:'a@b.com',customerName:'A',serviceName:'Training',startsAt:new Date()}), error => {
    assert.doesNotMatch(error.message, /very-secret|refresh-secret/);
    return true;
  });
});
