import assert from 'node:assert/strict';
import test from 'node:test';
import {verifyQuickBooksPaymentEvidence} from '../../src/commerce/quickbooks-payment-verifier.js';

function validEvidence() {
  return {
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
      applications:[{
        linkedTxnId:'invoice-30',
        linkedTxnType:'Invoice',
        amountCents:4900,
      }],
    }],
  };
}

function expectedPayment() {
  return {
    realmId:'realm-7',
    invoiceId:'invoice-30',
    providerOrderRef:'bk-order-order-1',
    amountCents:4900,
    currency:'USD',
  };
}

function expectMismatch(evidence, expected = expectedPayment()) {
  assert.throws(() => verifyQuickBooksPaymentEvidence(evidence, expected), error => {
    assert.equal(error.code, 'PAYMENT_VERIFICATION_MISMATCH');
    assert.equal(error.message, 'Payment verification mismatch');
    return true;
  });
}

test('verifies one exact present payment fully applied only to the expected invoice', () => {
  assert.deepEqual(verifyQuickBooksPaymentEvidence(validEvidence(), expectedPayment()), {
    providerPaymentRef:'payment-42',
  });
});

test('canonical normalized evidence contains no invented active Boolean or provider completed value', () => {
  const evidence = validEvidence();
  const keys = [];
  const values = [];
  const visit = value => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') {
      values.push(value);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      visit(child);
    }
  };
  visit(evidence);
  assert.equal(keys.includes('active'), false);
  assert.equal(values.includes('completed'), false);
});

test('rejects mismatched Invoice identity, accounting, currency, and amount evidence', async t => {
  const cases = [
    ['realm', evidence => { evidence.realmId = 'realm-other'; }],
    ['invoice ID', evidence => { evidence.invoice.invoiceId = 'invoice-other'; }],
    ['order reference', evidence => { evidence.invoice.providerOrderRef = 'bk-order-other'; }],
    ['Invoice TotalAmt', evidence => { evidence.invoice.totalAmountCents = 5000; }],
    ['currency', evidence => { evidence.invoice.currency = 'CAD'; }],
    ['nonzero Balance', evidence => { evidence.invoice.balanceCents = 1; }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const evidence = validEvidence();
      mutate(evidence);
      expectMismatch(evidence);
    });
  }
});

test('rejects missing, unknown, deleted, voided, reversed, and partially-paid Invoice state', async t => {
  const cases = [
    ['missing entity state', evidence => { delete evidence.invoice.entityState; }],
    ['unknown entity state', evidence => { evidence.invoice.entityState = 'unknown'; }],
    ['deleted entity', evidence => { evidence.invoice.entityState = 'deleted'; }],
    ['voided entity', evidence => { evidence.invoice.entityState = 'voided'; }],
    ['missing payment state', evidence => { delete evidence.invoice.paymentState; }],
    ['unknown payment state', evidence => { evidence.invoice.paymentState = 'unknown'; }],
    ['voided payment state', evidence => { evidence.invoice.paymentState = 'voided'; }],
    ['reversed payment state', evidence => { evidence.invoice.paymentState = 'reversed'; }],
    ['partially paid state', evidence => { evidence.invoice.paymentState = 'partially_paid'; }],
    ['unpaid state', evidence => { evidence.invoice.paymentState = 'unpaid'; }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const evidence = validEvidence();
      mutate(evidence);
      expectMismatch(evidence);
    });
  }
});

test('rejects absent, split, over, under, unapplied, or ambiguously applied Payment evidence', async t => {
  const cases = [
    ['no linked Payment', evidence => { evidence.payments = []; }],
    ['split payments', evidence => { evidence.payments.push(structuredClone(evidence.payments[0])); }],
    ['Payment TotalAmt under expected', evidence => { evidence.payments[0].totalAmountCents = 4800; }],
    ['Payment TotalAmt over expected', evidence => { evidence.payments[0].totalAmountCents = 5000; }],
    ['nonzero UnappliedAmt', evidence => { evidence.payments[0].unappliedAmountCents = 100; }],
    ['partial application', evidence => { evidence.payments[0].applications[0].amountCents = 4800; }],
    ['over application', evidence => { evidence.payments[0].applications[0].amountCents = 5000; }],
    ['multiple applications', evidence => { evidence.payments[0].applications.push({linkedTxnId:'invoice-other',linkedTxnType:'Invoice',amountCents:1}); }],
    ['wrong Invoice ID', evidence => { evidence.payments[0].applications[0].linkedTxnId = 'invoice-other'; }],
    ['non-Invoice linked transaction type', evidence => { evidence.payments[0].applications[0].linkedTxnType = 'CreditMemo'; }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const evidence = validEvidence();
      mutate(evidence);
      expectMismatch(evidence);
    });
  }
});

test('rejects missing, unknown, deleted, and voided Payment entity state', async t => {
  const cases = [
    ['missing', evidence => { delete evidence.payments[0].entityState; }],
    ['unknown', evidence => { evidence.payments[0].entityState = 'unknown'; }],
    ['deleted', evidence => { evidence.payments[0].entityState = 'deleted'; }],
    ['voided', evidence => { evidence.payments[0].entityState = 'voided'; }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const evidence = validEvidence();
      mutate(evidence);
      expectMismatch(evidence);
    });
  }
});

test('rejects malformed evidence, invalid integer cents, and invalid expected payment contracts', async t => {
  const malformed = [
    null,
    [],
    {},
    {...validEvidence(),invoice:null},
    {...validEvidence(),payments:null},
  ];
  for (const [index, evidence] of malformed.entries()) {
    await t.test(`malformed ${index + 1}`, () => expectMismatch(evidence));
  }

  const centCases = [
    evidence => { evidence.invoice.totalAmountCents = 4900.5; },
    evidence => { evidence.invoice.balanceCents = -1; },
    evidence => { evidence.payments[0].totalAmountCents = '4900'; },
    evidence => { evidence.payments[0].unappliedAmountCents = 0.5; },
    evidence => { evidence.payments[0].applications[0].amountCents = NaN; },
  ];
  for (const [index, mutate] of centCases.entries()) {
    await t.test(`invalid cents ${index + 1}`, () => {
      const evidence = validEvidence();
      mutate(evidence);
      expectMismatch(evidence);
    });
  }

  const invalidExpected = [
    {...expectedPayment(),invoiceId:''},
    {...expectedPayment(),amountCents:4900.5},
    {...expectedPayment(),currency:'usd'},
  ];
  for (const [index, expected] of invalidExpected.entries()) {
    await t.test(`invalid expected ${index + 1}`, () => expectMismatch(validEvidence(), expected));
  }
});

test('rejects raw provider payload keys at every normalized evidence level', async t => {
  const cases = [
    ['top-level Invoice envelope', evidence => { evidence.Invoice = {}; }],
    ['top-level Payment envelope', evidence => { evidence.Payment = {}; }],
    ['Invoice TotalAmt', evidence => { evidence.invoice.TotalAmt = 49; }],
    ['Invoice Balance', evidence => { evidence.invoice.Balance = 0; }],
    ['Invoice active Boolean', evidence => { evidence.invoice.active = true; }],
    ['Invoice provider completed value', evidence => { evidence.invoice.status = 'completed'; }],
    ['Payment UnappliedAmt', evidence => { evidence.payments[0].UnappliedAmt = 0; }],
    ['Payment LinkedTxn', evidence => { evidence.payments[0].LinkedTxn = []; }],
    ['application TxnId', evidence => { evidence.payments[0].applications[0].TxnId = 'invoice-30'; }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const evidence = validEvidence();
      mutate(evidence);
      expectMismatch(evidence);
    });
  }
});
