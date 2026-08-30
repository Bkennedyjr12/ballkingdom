import assert from 'node:assert/strict';
import test from 'node:test';
import {buildQuickBooksAuthUrl} from '../../src/providers/oauth.js';
import {createQuickBooksClient} from '../../src/providers/quickbooks.js';

const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const PROD_ROOT = 'https://quickbooks.api.intuit.com/v3/company/realm-7';
const SANDBOX_ROOT = 'https://sandbox-quickbooks.api.intuit.com/v3/company/realm-7';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers:{'content-type':'application/json'},
  });
}

function clientConfig(overrides = {}) {
  return {
    clientId:'client-id',
    clientSecret:'client-secret',
    refreshToken:'refresh-token',
    realmId:'realm-7',
    sandbox:false,
    ...overrides,
  };
}

function scriptedFetch(steps) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const call = {url:String(input), init};
    calls.push(call);
    const step = steps.shift();
    assert.ok(step, `unexpected request: ${call.url}`);
    return step(call, calls.length);
  };
  fetchImpl.calls = calls;
  fetchImpl.assertDone = () => assert.equal(steps.length, 0, 'all expected requests were made');
  return fetchImpl;
}

function assertTokenRequest(call) {
  assert.equal(call.url, TOKEN_URL);
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers.accept, 'application/json');
  assert.equal(call.init.headers['content-type'], 'application/x-www-form-urlencoded');
  assert.equal(call.init.body.toString(), 'grant_type=refresh_token&refresh_token=refresh-token');
}

function tokenStep(body = {access_token:'access-token'}) {
  return call => {
    assertTokenRequest(call);
    return json(body);
  };
}

function assertAccountingHeaders(call, contentType = 'application/json') {
  assert.equal(call.init.headers.authorization, 'Bearer access-token');
  assert.equal(call.init.headers.accept, 'application/json');
  assert.equal(call.init.headers['content-type'], contentType);
}

function assertNoProviderPayloadKeys(value) {
  const providerKeys = new Set([
    'Invoice', 'Payment', 'TotalAmt', 'Balance', 'CurrencyRef', 'UnappliedAmt',
    'LinkedTxn', 'TxnId', 'TxnType', 'PrivateNote', 'status', 'active',
  ]);
  const visit = current => {
    if (Array.isArray(current)) return current.forEach(visit);
    if (!current || typeof current !== 'object') return;
    for (const [key, child] of Object.entries(current)) {
      assert.equal(providerKeys.has(key), false, `raw provider key escaped adapter: ${key}`);
      visit(child);
    }
  };
  visit(value);
}

function commerceInvoiceReadback(overrides = {}) {
  return {
    Id:'invoice-30',
    DocNumber:'1001',
    CustomerRef:{value:'customer-9'},
    PrivateNote:'bk-order-order-1',
    TotalAmt:49,
    Balance:49,
    CurrencyRef:{value:'USD'},
    Line:[{
      DetailType:'SalesItemLineDetail',
      Amount:49,
      SalesItemLineDetail:{ItemRef:{value:'item-4'},Qty:1,UnitPrice:49},
    }],
    ...overrides,
  };
}

function minimalCommerceCreateFetch({docNumber = '1001', readback = commerceInvoiceReadback()} = {}) {
  return scriptedFetch([
    tokenStep(),
    () => json({QueryResponse:{Customer:[{Id:'customer-9'}]}}),
    () => json({QueryResponse:{Item:[{Id:'item-4',Name:'Championship Week',UnitPrice:49}]}}),
    () => json({Invoice:{Id:'invoice-30',DocNumber:docNumber},time:'2026-08-30T10:00:00-07:00'}),
    call => {
      const url = new URL(call.url);
      assert.equal(`${url.origin}${url.pathname}`, `${PROD_ROOT}/invoice/invoice-30`);
      assert.equal(url.searchParams.get('minorversion'), '75');
      assert.equal(call.init.method, 'GET');
      return json({Invoice:readback,time:'2026-08-30T10:00:01-07:00'});
    },
  ]);
}

function sendEnvelope(overrides = {}) {
  return {
    Invoice:{
      Id:'invoice-30',
      EmailStatus:'EmailSent',
      BillEmail:{Address:'ada@example.com'},
      DeliveryInfo:{DeliveryType:'Email',DeliveryTime:'2026-08-30T10:01:00-07:00'},
      ...overrides,
    },
    time:'2026-08-30T10:01:00-07:00',
  };
}

test('QuickBooks Accounting OAuth uses only the accounting scope', () => {
  const url = new URL(buildQuickBooksAuthUrl({
    clientId:'client-id',
    redirectUri:'https://example.test/oauth/quickbooks/callback',
    state:'state-1',
  }));
  assert.equal(url.searchParams.get('scope'), 'com.intuit.quickbooks.accounting');
  assert.equal(url.searchParams.get('scope')?.includes('payments'), false);
});

test('creates a commerce Invoice on the production Accounting host with a stable order reference and deterministic requestid', async () => {
  let persistedRefreshToken;
  const fetchImpl = scriptedFetch([
    tokenStep({access_token:'access-token',refresh_token:'rotated-refresh-token'}),
    call => {
      const url = new URL(call.url);
      assert.equal(`${url.origin}${url.pathname}`, `${PROD_ROOT}/query`);
      assert.equal(url.searchParams.get('minorversion'), '75');
      assert.equal(url.searchParams.get('query'), "select * from Customer where PrimaryEmailAddr = 'ada@example.com' maxresults 1");
      assertAccountingHeaders(call);
      return json({QueryResponse:{Customer:[{Id:'customer-9'}]}});
    },
    call => {
      const url = new URL(call.url);
      assert.equal(`${url.origin}${url.pathname}`, `${PROD_ROOT}/query`);
      assert.equal(url.searchParams.get('minorversion'), '75');
      assert.equal(url.searchParams.get('query'), "select * from Item where Name = 'Championship Week' maxresults 1");
      assertAccountingHeaders(call);
      return json({QueryResponse:{Item:[{Id:'item-4',Name:'Championship Week',UnitPrice:49}]}});
    },
    call => {
      const url = new URL(call.url);
      assert.equal(`${url.origin}${url.pathname}`, `${PROD_ROOT}/invoice`);
      assert.equal(url.searchParams.get('minorversion'), '75');
      assert.equal(url.searchParams.get('requestid'), 'bk-order-order-1');
      assert.equal(call.init.method, 'POST');
      assertAccountingHeaders(call);
      const body = JSON.parse(call.init.body);
      assert.equal(body.CustomerRef.value, 'customer-9');
      assert.equal(body.CurrencyRef.value, 'USD');
      assert.equal(body.PrivateNote, 'bk-order-order-1');
      assert.equal(body.Line.length, 1);
      assert.equal(body.Line[0].Amount, 49);
      assert.equal(body.Line[0].SalesItemLineDetail.UnitPrice, 49);
      assert.equal(body.Line[0].SalesItemLineDetail.ItemRef.value, 'item-4');
      return json({Invoice:{Id:'invoice-30',DocNumber:'1001'},time:'2026-08-30T10:00:00-07:00'});
    },
    call => {
      const url = new URL(call.url);
      assert.equal(`${url.origin}${url.pathname}`, `${PROD_ROOT}/invoice/invoice-30`);
      assert.equal(url.searchParams.get('minorversion'), '75');
      assert.equal(call.init.method, 'GET');
      assertAccountingHeaders(call);
      return json({Invoice:commerceInvoiceReadback(),time:'2026-08-30T10:00:01-07:00'});
    },
  ]);
  const client = createQuickBooksClient(clientConfig({
    onRefreshToken: async token => { persistedRefreshToken = token; },
  }), fetchImpl);

  const result = await client.createCommerceInvoice({
    id:'order-1',
    name:'Championship Week',
    customer:{name:'Ada Lovelace',email:'ada@example.com'},
    amountCents:4900,
    currency:'USD',
  });

  assert.deepEqual(result, {
    customerId:'customer-9',
    invoiceId:'invoice-30',
    documentNumber:'1001',
  });
  assert.equal(persistedRefreshToken, 'rotated-refresh-token');
  fetchImpl.assertDone();
});

test('accepts the documented null DocNumber when CustomTxnNumber is enabled', async () => {
  const fetchImpl = minimalCommerceCreateFetch({
    docNumber:null,
    readback:commerceInvoiceReadback({DocNumber:null}),
  });
  const client = createQuickBooksClient(clientConfig(), fetchImpl);

  const result = await client.createCommerceInvoice({
    id:'order-1',
    name:'Championship Week',
    customer:{name:'Ada Lovelace',email:'ada@example.com'},
    amountCents:4900,
    currency:'USD',
  });

  assert.deepEqual(result, {customerId:'customer-9',invoiceId:'invoice-30',documentNumber:null});
  fetchImpl.assertDone();
});

test('fails closed when authoritative Invoice readback does not exactly match the commerce create contract', async t => {
  const cases = [
    ['customer reference', {CustomerRef:{value:'customer-old'}}],
    ['order reference', {PrivateNote:'bk-order-order-old'}],
    ['provider-calculated tax total', {TotalAmt:53.05,Balance:53.05}],
    ['unexpected non-full balance', {Balance:0,LinkedTxn:[{TxnId:'payment-old',TxnType:'Payment'}]}],
    ['currency', {CurrencyRef:{value:'CAD'}}],
    ['item reference', {Line:[{DetailType:'SalesItemLineDetail',Amount:49,SalesItemLineDetail:{ItemRef:{value:'item-old'},Qty:1,UnitPrice:49}}]}],
    ['line amount', {Line:[{DetailType:'SalesItemLineDetail',Amount:48,SalesItemLineDetail:{ItemRef:{value:'item-4'},Qty:1,UnitPrice:48}}]}],
    ['stale idempotent response', {
      CustomerRef:{value:'customer-old'},
      PrivateNote:'bk-order-order-1',
      TotalAmt:39,
      Balance:39,
      Line:[{DetailType:'SalesItemLineDetail',Amount:39,SalesItemLineDetail:{ItemRef:{value:'item-old'},Qty:1,UnitPrice:39}}],
    }],
  ];
  for (const [name, overrides] of cases) {
    await t.test(name, async () => {
      const fetchImpl = minimalCommerceCreateFetch({readback:commerceInvoiceReadback(overrides)});
      const client = createQuickBooksClient(clientConfig(), fetchImpl);
      await assert.rejects(client.createCommerceInvoice({
        id:'order-1',
        name:'Championship Week',
        customer:{name:'Ada Lovelace',email:'ada@example.com'},
        amountCents:4900,
        currency:'USD',
      }), error => {
        assert.equal(error.message, 'QuickBooks Invoice create readback was invalid');
        assert.doesNotMatch(error.message, /customer-old|order-old|item-old|53\.05/);
        return true;
      });
      fetchImpl.assertDone();
    });
  }
});

test('rejects non-integer-cent commerce totals before contacting QuickBooks', async () => {
  let calls = 0;
  const client = createQuickBooksClient(clientConfig(), async () => {
    calls += 1;
    throw new Error('should not be called');
  });
  await assert.rejects(client.createCommerceInvoice({
    id:'order-1',
    name:'Championship Week',
    customer:{name:'Ada Lovelace',email:'ada@example.com'},
    amountCents:4900.5,
    currency:'USD',
  }), /invalid/i);
  assert.equal(calls, 0);
});

test('an invoice send response is not normalized as payment proof', async () => {
  const fetchImpl = scriptedFetch([
    tokenStep(),
    call => {
      const url = new URL(call.url);
      assert.equal(`${url.origin}${url.pathname}`, `${PROD_ROOT}/invoice/invoice-30/send`);
      assert.equal(url.searchParams.get('sendTo'), 'ada@example.com');
      assert.equal(url.searchParams.get('minorversion'), '75');
      assert.equal(call.init.method, 'POST');
      assert.equal(call.init.body, undefined);
      assertAccountingHeaders(call, 'application/octet-stream');
      return json(sendEnvelope());
    },
  ]);
  const client = createQuickBooksClient(clientConfig(), fetchImpl);

  const receipt = await client.sendInvoice({invoiceId:'invoice-30',customerEmail:'ada@example.com'});

  assert.deepEqual(receipt, {invoiceId:'invoice-30',sendAccepted:true});
  assert.equal(Object.hasOwn(receipt, 'status'), false);
  assert.equal(Object.hasOwn(receipt, 'url'), false);
  assert.equal(fetchImpl.calls.length, 2, 'one token request and exactly one Invoice send request');
  fetchImpl.assertDone();
});

test('fails closed when the documented Invoice send result is missing or contradictory', async t => {
  const cases = [
    ['missing EmailStatus', invoice => { delete invoice.EmailStatus; }],
    ['non-sent EmailStatus', invoice => { invoice.EmailStatus = 'NeedToSend'; }],
    ['missing BillEmail', invoice => { delete invoice.BillEmail; }],
    ['wrong BillEmail recipient', invoice => { invoice.BillEmail.Address = 'other@example.com'; }],
    ['missing DeliveryInfo', invoice => { delete invoice.DeliveryInfo; }],
    ['wrong DeliveryType', invoice => { invoice.DeliveryInfo.DeliveryType = 'Print'; }],
    ['missing DeliveryTime', invoice => { delete invoice.DeliveryInfo.DeliveryTime; }],
    ['invalid DeliveryTime', invoice => { invoice.DeliveryInfo.DeliveryTime = 'not-a-date'; }],
    ['Missing Info delivery error', invoice => { invoice.DeliveryInfo.DeliveryErrorType = 'Missing Info'; }],
    ['Undeliverable delivery error', invoice => { invoice.DeliveryInfo.DeliveryErrorType = 'Undeliverable'; }],
    ['Delivery Server Down error', invoice => { invoice.DeliveryInfo.DeliveryErrorType = 'Delivery Server Down'; }],
    ['Bounced Email delivery error', invoice => { invoice.DeliveryInfo.DeliveryErrorType = 'Bounced Email'; }],
    ['unknown nonempty delivery error', invoice => { invoice.DeliveryInfo.DeliveryErrorType = 'Provider Specific Error'; }],
    ['present empty delivery error field', invoice => { invoice.DeliveryInfo.DeliveryErrorType = ''; }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const response = sendEnvelope();
      mutate(response.Invoice);
      const fetchImpl = scriptedFetch([tokenStep(), () => json(response)]);
      const client = createQuickBooksClient(clientConfig(), fetchImpl);
      await assert.rejects(client.sendInvoice({invoiceId:'invoice-30',customerEmail:'ada@example.com'}), error => {
        assert.equal(error.message, 'QuickBooks Invoice send response was invalid');
        assert.doesNotMatch(error.message, /other@example\.com|not-a-date/);
        return true;
      });
      fetchImpl.assertDone();
    });
  }
});

test('malformed Customer and Item query responses fail with redacted operation errors', async t => {
  const cases = [
    ['invalid Customer query JSON', [tokenStep(), () => new Response('customer-body-secret', {status:200})], 'Customer query'],
    ['invalid Customer query envelope', [tokenStep(), () => json({Wrong:{Customer:[]}})], 'Customer query'],
    ['invalid Item query JSON', [
      tokenStep(),
      () => json({QueryResponse:{Customer:[{Id:'customer-9'}]}}),
      () => new Response('item-body-secret', {status:200}),
    ], 'Item query'],
    ['invalid Item query envelope', [
      tokenStep(),
      () => json({QueryResponse:{Customer:[{Id:'customer-9'}]}}),
      () => json({Wrong:{Item:[]}}),
    ], 'Item query'],
  ];
  for (const [name, steps, operation] of cases) {
    await t.test(name, async () => {
      const fetchImpl = scriptedFetch(steps);
      const client = createQuickBooksClient(clientConfig(), fetchImpl);
      await assert.rejects(client.createCommerceInvoice({
        id:'order-1',
        name:'Championship Week',
        customer:{name:'Ada Lovelace',email:'ada@example.com'},
        amountCents:4900,
        currency:'USD',
      }), error => {
        assert.equal(error.message, `QuickBooks ${operation} response was invalid`);
        assert.doesNotMatch(error.message, /body-secret|Unexpected|Wrong/);
        return true;
      });
      fetchImpl.assertDone();
    });
  }
});

test('malformed Customer creation responses fail with a redacted operation error', async t => {
  const cases = [
    ['invalid JSON', () => new Response('customer-create-secret', {status:200})],
    ['invalid envelope', () => json({Wrong:{Id:'customer-9'}})],
  ];
  for (const [name, customerResponse] of cases) {
    await t.test(name, async () => {
      const fetchImpl = scriptedFetch([
        tokenStep(),
        () => json({QueryResponse:{}}),
        customerResponse,
      ]);
      const client = createQuickBooksClient(clientConfig(), fetchImpl);
      await assert.rejects(client.createCommerceInvoice({
        id:'order-1',
        name:'Championship Week',
        customer:{name:'Ada Lovelace',email:'ada@example.com'},
        amountCents:4900,
        currency:'USD',
      }), error => {
        assert.equal(error.message, 'QuickBooks Customer create response was invalid');
        assert.doesNotMatch(error.message, /customer-create-secret|Unexpected|Wrong/);
        return true;
      });
      fetchImpl.assertDone();
    });
  }
});

test('reads an Invoice and its linked Payment and returns only integer-cent normalized evidence', async () => {
  const fetchImpl = scriptedFetch([
    tokenStep(),
    call => {
      const url = new URL(call.url);
      assert.equal(`${url.origin}${url.pathname}`, `${PROD_ROOT}/invoice/invoice-30`);
      assert.equal(url.searchParams.get('minorversion'), '75');
      assert.equal(call.init.method, 'GET');
      assertAccountingHeaders(call);
      return json({
        Invoice:{
          Id:'invoice-30',
          PrivateNote:'bk-order-order-1',
          TotalAmt:49,
          Balance:0,
          CurrencyRef:{value:'USD'},
          LinkedTxn:[{TxnId:'payment-42',TxnType:'Payment'}],
        },
        time:'2026-08-30T10:02:00-07:00',
      });
    },
    call => {
      const url = new URL(call.url);
      assert.equal(`${url.origin}${url.pathname}`, `${PROD_ROOT}/payment/payment-42`);
      assert.equal(url.searchParams.get('minorversion'), '75');
      assert.equal(call.init.method, 'GET');
      assertAccountingHeaders(call);
      return json({
        Payment:{
          Id:'payment-42',
          TotalAmt:49,
          UnappliedAmt:0,
          Line:[{Amount:49,LinkedTxn:[{TxnId:'invoice-30',TxnType:'Invoice'}]}],
        },
        time:'2026-08-30T10:02:01-07:00',
      });
    },
  ]);
  const client = createQuickBooksClient(clientConfig(), fetchImpl);

  const evidence = await client.getInvoice('invoice-30');

  assert.deepEqual(evidence, {
    realmId:'realm-7',
    invoice:{
      invoiceId:'invoice-30',
      providerOrderRef:'bk-order-order-1',
      totalAmountCents:4900,
      balanceCents:0,
      currency:'USD',
      entityState:'present',
      paymentState:'paid',
    },
    payments:[{
      providerPaymentRef:'payment-42',
      entityState:'present',
      totalAmountCents:4900,
      unappliedAmountCents:0,
      applications:[{linkedTxnId:'invoice-30',linkedTxnType:'Invoice',amountCents:4900}],
    }],
  });
  assertNoProviderPayloadKeys(evidence);
  fetchImpl.assertDone();
});

test('reads and normalizes one exact Payment on the sandbox Accounting host', async () => {
  const fetchImpl = scriptedFetch([
    tokenStep(),
    call => {
      const url = new URL(call.url);
      assert.equal(`${url.origin}${url.pathname}`, `${SANDBOX_ROOT}/payment/payment-42`);
      assert.equal(url.searchParams.get('minorversion'), '75');
      assertAccountingHeaders(call);
      return json({Payment:{
        Id:'payment-42',
        TotalAmt:49.99,
        UnappliedAmt:0,
        Line:[{Amount:49.99,LinkedTxn:[{TxnId:'invoice-30',TxnType:'Invoice'}]}],
      }});
    },
  ]);
  const client = createQuickBooksClient(clientConfig({sandbox:true}), fetchImpl);

  assert.deepEqual(await client.getPayment('payment-42'), {
    providerPaymentRef:'payment-42',
    entityState:'present',
    totalAmountCents:4999,
    unappliedAmountCents:0,
    applications:[{linkedTxnId:'invoice-30',linkedTxnType:'Invoice',amountCents:4999}],
  });
  fetchImpl.assertDone();
});

test('maps the official CDC envelope to refetch-only Invoice and Payment change hints', async () => {
  const changedSince = '2026-08-29T12:34:56-07:00';
  const fetchImpl = scriptedFetch([
    tokenStep(),
    call => {
      const url = new URL(call.url);
      assert.equal(`${url.origin}${url.pathname}`, `${PROD_ROOT}/cdc`);
      assert.equal(url.searchParams.get('entities'), 'Invoice,Payment');
      assert.equal(url.searchParams.get('changedSince'), changedSince);
      assert.equal(url.searchParams.has('minorversion'), false);
      assert.equal(call.init.method, 'GET');
      assertAccountingHeaders(call, 'text/plain');
      return json({
        CDCResponse:[{QueryResponse:[
          {Invoice:[{Id:'invoice-30',TotalAmt:49,Balance:0}]},
          {Payment:[{Id:'payment-42',TotalAmt:49},{Id:'payment-void',status:'Deleted'}]},
        ]}],
        time:'2026-08-30T10:03:00-07:00',
      });
    },
  ]);
  const client = createQuickBooksClient(clientConfig(), fetchImpl);

  assert.deepEqual(await client.getAccountingChanges({changedSince}), {
    realmId:'realm-7',
    changes:[
      {entityType:'Invoice',entityId:'invoice-30',operation:'refetch'},
      {entityType:'Payment',entityId:'payment-42',operation:'refetch'},
      {entityType:'Payment',entityId:'payment-void',operation:'deleted'},
    ],
  });
  fetchImpl.assertDone();
});

test('fails closed for documented deleted, voided, unknown, missing, and contradictory entity state', async t => {
  const cases = [
    ['deleted Invoice', {Invoice:{Id:'invoice-30',status:'Deleted'}}],
    ['voided Invoice', {Invoice:{Id:'invoice-30',PrivateNote:'Voided bk-order-order-1',TotalAmt:0,Balance:0,CurrencyRef:{value:'USD'}}}],
    ['unknown Invoice status', {Invoice:{Id:'invoice-30',status:'Mystery',PrivateNote:'bk-order-order-1',TotalAmt:49,Balance:0,CurrencyRef:{value:'USD'}}}],
    ['missing currency', {Invoice:{Id:'invoice-30',PrivateNote:'bk-order-order-1',TotalAmt:49,Balance:0}}],
    ['contradictory balance', {Invoice:{Id:'invoice-30',PrivateNote:'bk-order-order-1',TotalAmt:49,Balance:50,CurrencyRef:{value:'USD'}}}],
  ];
  for (const [name, body] of cases) {
    await t.test(name, async () => {
      const fetchImpl = scriptedFetch([tokenStep(), () => json(body)]);
      const client = createQuickBooksClient(clientConfig(), fetchImpl);
      await assert.rejects(client.getInvoice('invoice-30'), /QuickBooks Invoice evidence is unusable/);
      fetchImpl.assertDone();
    });
  }
});

test('fails closed for documented deleted and voided Payment state', async t => {
  const cases = [
    ['deleted Payment', {Payment:{Id:'payment-42',status:'Deleted'}}],
    ['voided Payment', {Payment:{Id:'payment-42',PrivateNote:'Voided',TotalAmt:0,UnappliedAmt:0,Line:[]}}],
  ];
  for (const [name, body] of cases) {
    await t.test(name, async () => {
      const fetchImpl = scriptedFetch([tokenStep(), () => json(body)]);
      const client = createQuickBooksClient(clientConfig(), fetchImpl);
      await assert.rejects(client.getPayment('payment-42'), /QuickBooks Payment evidence is unusable/);
      fetchImpl.assertDone();
    });
  }
});

test('rejects malformed or mismatched provider envelopes without exposing provider response data', async t => {
  const cases = [
    ['missing Invoice envelope', {Wrong:{Id:'invoice-30'}}],
    ['mismatched Invoice ID', {Invoice:{Id:'different'}}],
  ];
  for (const [name, body] of cases) {
    await t.test(name, async () => {
      const fetchImpl = scriptedFetch([tokenStep(), () => json(body)]);
      const client = createQuickBooksClient(clientConfig(), fetchImpl);
      await assert.rejects(client.sendInvoice({invoiceId:'invoice-30',customerEmail:'ada@example.com'}), error => {
        assert.match(error.message, /QuickBooks Invoice send response was invalid/);
        assert.doesNotMatch(error.message, /Wrong|different|ada@example\.com/);
        return true;
      });
    });
  }
});

test('redacts non-2xx Accounting response bodies and credentials', async () => {
  const fetchImpl = scriptedFetch([
    tokenStep(),
    () => new Response('provider-secret ada@example.com refresh-token', {status:500}),
  ]);
  const client = createQuickBooksClient(clientConfig(), fetchImpl);
  await assert.rejects(client.sendInvoice({invoiceId:'invoice-30',customerEmail:'ada@example.com'}), error => {
    assert.equal(error.message, 'QuickBooks request failed with provider status 500');
    assert.doesNotMatch(error.message, /provider-secret|ada@example\.com|refresh-token|client-secret/);
    return true;
  });
});

test('a missing provider entity fails closed on a 404 without returning provider data', async () => {
  const fetchImpl = scriptedFetch([
    tokenStep(),
    () => new Response('deleted invoice details', {status:404}),
  ]);
  const client = createQuickBooksClient(clientConfig(), fetchImpl);
  await assert.rejects(client.getInvoice('invoice-30'), error => {
    assert.equal(error.message, 'QuickBooks request failed with provider status 404');
    assert.doesNotMatch(error.message, /deleted invoice details/);
    return true;
  });
});
