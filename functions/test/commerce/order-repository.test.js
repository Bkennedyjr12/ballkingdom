import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrderRepository} from '../../src/commerce/order-repository.js';

const SERVER_TIMESTAMP = Object.freeze({kind: 'server-timestamp'});

function timestamp(date) {
  const milliseconds = date.getTime();
  return Object.freeze({
    milliseconds,
    toDate: () => new Date(milliseconds),
  });
}

function valueAt(data, field) {
  return field.split('.').reduce((value, part) => value?.[part], data);
}

function comparable(value) {
  if (value?.milliseconds != null) return value.milliseconds;
  if (value?.toDate instanceof Function) return value.toDate().getTime();
  return value;
}

function createFakeFirestore() {
  const documents = new Map();
  const counters = new Map();
  let transactionQueue = Promise.resolve();

  function snapshot(reference) {
    const data = documents.get(reference.path);
    return {
      id: reference.id,
      exists: data !== undefined,
      data: () => data,
    };
  }

  function query(collectionName, filters = [], ordering = null, maximum = Infinity) {
    const chain = {
      where(field, operator, value) {
        return query(collectionName, [...filters, {field, operator, value}], ordering, maximum);
      },
      orderBy(field, direction = 'asc') {
        return query(collectionName, filters, {field, direction}, maximum);
      },
      limit(value) {
        return query(collectionName, filters, ordering, value);
      },
      async get() {
        const prefix = `${collectionName}/`;
        let rows = [...documents.entries()]
          .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
          .map(([path, data]) => ({id: path.slice(prefix.length), data: () => data}));
        for (const filter of filters) {
          rows = rows.filter(document => {
            const actual = comparable(valueAt(document.data(), filter.field));
            const expected = comparable(filter.value);
            if (filter.operator === '==') return actual === expected;
            if (filter.operator === '<=') return actual <= expected;
            throw new Error(`Unsupported fake query operator ${filter.operator}`);
          });
        }
        if (ordering) {
          const multiplier = ordering.direction === 'desc' ? -1 : 1;
          rows.sort((left, right) => multiplier * (
            comparable(valueAt(left.data(), ordering.field))
            - comparable(valueAt(right.data(), ordering.field))
          ));
        }
        return {docs: rows.slice(0, maximum)};
      },
    };
    return chain;
  }

  const db = {
    collection(name) {
      return {
        doc(id) {
          const next = id ?? `${name}-${(counters.get(name) ?? 0) + 1}`;
          if (id == null) counters.set(name, (counters.get(name) ?? 0) + 1);
          const reference = {id: next, path: `${name}/${next}`};
          reference.get = async () => snapshot(reference);
          return reference;
        },
        ...query(name),
      };
    },
    runTransaction(operation) {
      const run = transactionQueue.then(async () => {
        const writes = [];
        const transaction = {
          get: async reference => snapshot(reference),
          create: (reference, data) => writes.push({kind: 'create', reference, data}),
          set: (reference, data) => writes.push({kind: 'set', reference, data}),
        };
        const result = await operation(transaction);
        for (const write of writes) {
          if (write.kind === 'create' && documents.has(write.reference.path)) {
            throw new Error('document already exists');
          }
          documents.set(write.reference.path, write.data);
        }
        return result;
      });
      transactionQueue = run.catch(() => {});
      return run;
    },
  };

  return {
    db,
    document: path => documents.get(path),
    collection: name => [...documents.entries()]
      .filter(([path]) => path.startsWith(`${name}/`))
      .map(([, data]) => data),
  };
}

const fieldValue = Object.freeze({serverTimestamp: () => SERVER_TIMESTAMP});
const Timestamp = Object.freeze({fromDate: date => timestamp(date)});

function digitalOrder(overrides = {}) {
  return {
    sku: 'study-guide',
    name: 'Study Guide',
    amountCents: 4900,
    currency: 'USD',
    orderType: 'digital_product',
    fulfillmentType: 'protected_download',
    customerUid: 'customer-uid',
    customer: {name: 'Ada', email: 'ada@example.test'},
    status: 'pending_payment',
    ...overrides,
  };
}

const RECIPIENT_BINDING = 'a'.repeat(64);

function repositoryFixture(clock = () => new Date('2026-08-29T18:00:00.000Z')) {
  const firestore = createFakeFirestore();
  let claimSequence = 0;
  return {
    firestore,
    repository: createOrderRepository({
      db: firestore.db,
      fieldValue,
      Timestamp,
      clock,
      claimIdFactory: () => `claim-${++claimSequence}`,
    }),
  };
}

test('creates a normalized order once with a stable provider idempotency key and server timestamps', async () => {
  const {firestore, repository} = repositoryFixture();

  const first = await repository.createOrder('order-1', digitalOrder({
    accessToken: 'must-not-be-stored',
    providerPayload: {card: 'must-not-be-stored'},
    customer: {
      name: 'Ada',
      email: 'ada@example.test',
      bankAccount: 'must-not-be-stored',
    },
  }));
  const second = await repository.createOrder('order-1', digitalOrder());

  assert.deepEqual(first, {
    orderId: 'order-1',
    idempotencyKey: 'bk-order-order-1',
    duplicate: false,
  });
  assert.deepEqual(second, {...first, duplicate: true});
  const stored = firestore.document('orders/order-1');
  assert.equal(stored.idempotencyKey, 'bk-order-order-1');
  assert.equal(stored.createdAt, SERVER_TIMESTAMP);
  assert.equal(stored.updatedAt, SERVER_TIMESTAMP);
  assert.equal(stored.accessToken, undefined);
  assert.equal(stored.providerPayload, undefined);
  assert.deepEqual(stored.customer, {name: 'Ada', email: 'ada@example.test'});
  assert.equal(stored.fulfillment.status, 'locked');
  assert.equal(firestore.collection('commerceAudit').length, 1);
  assert.deepEqual(
    Object.keys(firestore.collection('commerceAudit')[0]).sort(),
    ['createdAt', 'event', 'orderId', 'toStatus']
  );
});

test('rejects an idempotent order id reused with different normalized order data', async () => {
  const {repository} = repositoryFixture();
  await repository.createOrder('order-1', digitalOrder());

  await assert.rejects(
    repository.createOrder('order-1', digitalOrder({amountCents: 9900})),
    {code: 'ORDER_IDEMPOTENCY_CONFLICT'}
  );
});

test('gets an existing normalized order and returns null for an unknown order', async () => {
  const {repository} = repositoryFixture();
  await repository.createOrder('order-1', digitalOrder());

  const stored = await repository.getOrder('order-1');

  assert.equal(stored.id, 'order-1');
  assert.equal(stored.sku, 'study-guide');
  assert.equal(await repository.getOrder('order-missing'), null);
});

test('rejects unsafe or non-identifier providerRefs before any write', async () => {
  for (const providerRefs of [
    {accessToken: 'secret'},
    {cardId: 'secret'},
    {bankReference: 'secret'},
    {accountNumber: 'secret'},
    {rawPayload: 'secret'},
    {clientSecret: 'credential-shaped'},
    {refreshCredential: 'credential-shaped'},
    {saleId: 'syntactically-valid-but-unapproved'},
    {paymentReference: 'not-the-task-3-name'},
    {documentNumber: 'not-an-opaque-identifier'},
    {providerPaymentRef: {nested: 'not-normalized'}},
  ]) {
    const {firestore, repository} = repositoryFixture();
    await assert.rejects(
      repository.createOrder('order-unsafe', digitalOrder({providerRefs})),
      {code: 'UNSAFE_PROVIDER_REFS'}
    );
    assert.equal(firestore.document('orders/order-unsafe'), undefined);
  }
});

test('accepts only the provider identifier names required by current commerce interfaces', async () => {
  const {repository} = repositoryFixture();
  await repository.createOrder('order-allowed-refs', digitalOrder({
    providerRefs: {
      realmId: 'realm-7',
      providerPaymentRef: 'payment-7',
      providerOrderRef: 'bk-order-order-allowed-refs',
      invoiceId: 'invoice-7',
      customerId: 'customer-7',
    },
  }));

  assert.deepEqual((await repository.getOrder('order-allowed-refs')).providerRefs, {
    customerId: 'customer-7',
    invoiceId: 'invoice-7',
    providerOrderRef: 'bk-order-order-allowed-refs',
    providerPaymentRef: 'payment-7',
    realmId: 'realm-7',
  });
});

test('only one worker can claim payment verification', async () => {
  const {firestore, repository} = repositoryFixture();
  await repository.createOrder('order-1', digitalOrder());

  const results = await Promise.all([
    repository.claimTransition('order-1', 'payment_verifying', 'worker-a'),
    repository.claimTransition('order-1', 'payment_verifying', 'worker-b'),
  ]);

  assert.equal(results.filter(Boolean).length, 1);
  assert.deepEqual(results[0], {claimId: 'claim-1', revision: 1});
  const stored = firestore.document('orders/order-1');
  assert.equal(stored.status, 'payment_verifying');
  assert.equal(stored.activeTransition.workerId, 'worker-a');
  assert.equal(stored.activeTransition.claimId, 'claim-1');
  assert.equal(stored.activeTransition.claimedAt, SERVER_TIMESTAMP);
});

test('rejects a storage claim that skips the Task 3 transition graph', async () => {
  const {firestore, repository} = repositoryFixture();
  await repository.createOrder('order-1', digitalOrder());

  await assert.rejects(
    repository.claimTransition('order-1', 'fulfilled', 'worker-a'),
    {code: 'INVALID_ORDER_TRANSITION'}
  );
  assert.equal(firestore.document('orders/order-1').status, 'pending_payment');
});

test('permits explicit refund claims from reconciliation-terminal orders', async () => {
  const {repository} = repositoryFixture();
  await repository.createOrder('order-fulfilled', digitalOrder({status: 'fulfilled'}));
  await repository.createOrder('order-review', digitalOrder({status: 'manual_review'}));

  assert.deepEqual(await repository.claimTransition(
    'order-fulfilled', 'refunded', 'refund-worker'
  ), {claimId: 'claim-1', revision: 1});
  assert.deepEqual(await repository.claimTransition(
    'order-review', 'refunded', 'refund-worker'
  ), {claimId: 'claim-2', revision: 1});
});

test('completes only the matching claim and appends a redacted audit receipt', async () => {
  const {firestore, repository} = repositoryFixture();
  await repository.createOrder('order-1', digitalOrder());
  const claim = await repository.claimTransition('order-1', 'payment_verifying', 'worker-a');

  await assert.rejects(
    repository.completeTransition('order-1', 'payment_verifying', 'worker-a', claim.claimId, {
      providerRefs: {accessToken: 'must-not-be-stored'},
    }),
    {code: 'UNSAFE_PROVIDER_REFS'}
  );

  await assert.rejects(
    repository.completeTransition('order-1', 'payment_verifying', 'worker-b', claim.claimId, {
      providerRefs: {providerPaymentRef: 'pay-123'},
    }),
    {code: 'TRANSITION_CLAIM_LOST'}
  );
  assert.equal(await repository.completeTransition(
    'order-1',
    'payment_verifying',
    'worker-a',
    claim.claimId,
    {providerRefs: {providerPaymentRef: 'pay-123', realmId: 'realm-7'}}
  ), true);

  const stored = firestore.document('orders/order-1');
  assert.equal(stored.activeTransition, null);
  assert.deepEqual(stored.providerRefs, {providerPaymentRef: 'pay-123', realmId: 'realm-7'});
  const receipt = firestore.collection('commerceAudit').at(-1);
  assert.equal(receipt.event, 'transition_completed');
  assert.equal(receipt.workerId, 'worker-a');
  assert.equal(receipt.claimId, claim.claimId);
  assert.equal(JSON.stringify(receipt).includes('pay-123'), false);
});

test('records only a safe failure code and restores the pre-claim state for retry', async () => {
  const retryAt = new Date('2026-08-29T18:15:00.000Z');
  const {firestore, repository} = repositoryFixture();
  await repository.createOrder('order-1', digitalOrder());
  const claim = await repository.claimTransition('order-1', 'payment_verifying', 'worker-a');

  assert.equal(await repository.recordFailure(
    'order-1',
    'payment_verifying',
    'worker-a',
    claim.claimId,
    {code: 'provider_timeout', providerPayload: {secret: true}, retryAt}
  ), true);

  const stored = firestore.document('orders/order-1');
  assert.equal(stored.status, 'pending_payment');
  assert.equal(stored.activeTransition, null);
  assert.equal(stored.lastErrorCode, 'provider_timeout');
  assert.equal(stored.reconciliationDueAt.toDate().toISOString(), retryAt.toISOString());
  assert.equal(stored.retry.attemptCount, 1);
  assert.equal(stored.retry.dueAt.toDate().toISOString(), retryAt.toISOString());
  const receipt = firestore.collection('commerceAudit').at(-1);
  assert.equal(receipt.errorCode, 'provider_timeout');
  assert.equal(JSON.stringify(receipt).includes('secret'), false);
});

test('keeps a failed refund from a terminal status reconciliation-visible when due', async () => {
  const retryAt = new Date('2026-08-29T18:15:00.000Z');
  const {firestore, repository} = repositoryFixture();
  await repository.createOrder('order-fulfilled', digitalOrder({status: 'fulfilled'}));
  const claim = await repository.claimTransition(
    'order-fulfilled', 'refunded', 'refund-worker'
  );

  await repository.recordFailure(
    'order-fulfilled',
    'refunded',
    'refund-worker',
    claim.claimId,
    {code: 'provider_timeout', retryAt}
  );

  const stored = firestore.document('orders/order-fulfilled');
  assert.equal(stored.status, 'fulfilled');
  assert.equal(stored.terminal, false);
  assert.deepEqual(await repository.listReconciliationCandidates(
    new Date('2026-08-29T18:14:59.999Z')
  ), []);
  assert.deepEqual(
    (await repository.listReconciliationCandidates(retryAt)).map(order => order.id),
    ['order-fulfilled']
  );
});

test('rejects a delayed result after the same worker releases and reclaims the transition', async () => {
  const {firestore, repository} = repositoryFixture();
  await repository.createOrder('order-1', digitalOrder());
  const firstClaim = await repository.claimTransition(
    'order-1', 'payment_verifying', 'worker-a'
  );
  await repository.recordFailure(
    'order-1',
    'payment_verifying',
    'worker-a',
    firstClaim.claimId,
    {code: 'provider_timeout'}
  );

  const secondClaim = await repository.claimTransition(
    'order-1', 'payment_verifying', 'worker-a'
  );

  assert.notEqual(secondClaim.claimId, firstClaim.claimId);
  assert.equal(secondClaim.revision, 2);
  await assert.rejects(
    repository.completeTransition(
      'order-1', 'payment_verifying', 'worker-a', firstClaim.claimId
    ),
    {code: 'TRANSITION_CLAIM_LOST'}
  );
  assert.equal(firestore.document('orders/order-1').activeTransition.claimId, secondClaim.claimId);
  assert.equal(await repository.completeTransition(
    'order-1', 'payment_verifying', 'worker-a', secondClaim.claimId
  ), true);
});

test('provider references are append-only and identical repeats remain idempotent', async () => {
  const {firestore, repository} = repositoryFixture();
  await repository.createOrder('order-1', digitalOrder({
    providerRefs: {providerOrderRef: 'bk-order-order-1'},
  }));
  const verifyingClaim = await repository.claimTransition(
    'order-1', 'payment_verifying', 'worker-a'
  );
  await repository.completeTransition(
    'order-1',
    'payment_verifying',
    'worker-a',
    verifyingClaim.claimId,
    {providerRefs: {providerOrderRef: 'bk-order-order-1', realmId: 'realm-7'}}
  );
  const paidClaim = await repository.claimTransition('order-1', 'paid', 'worker-a');

  await assert.rejects(
    repository.completeTransition('order-1', 'paid', 'worker-a', paidClaim.claimId, {
      providerRefs: {providerOrderRef: 'different-order'},
    }),
    {code: 'PROVIDER_REF_CONFLICT'}
  );
  assert.deepEqual(firestore.document('orders/order-1').providerRefs, {
    providerOrderRef: 'bk-order-order-1',
    realmId: 'realm-7',
  });
  assert.equal(await repository.completeTransition(
    'order-1',
    'paid',
    'worker-a',
    paidClaim.claimId,
    {
      providerRefs: {
        providerOrderRef: 'bk-order-order-1',
        realmId: 'realm-7',
        providerPaymentRef: 'payment-7',
      },
    }
  ), true);
  assert.deepEqual(firestore.document('orders/order-1').providerRefs, {
    providerOrderRef: 'bk-order-order-1',
    providerPaymentRef: 'payment-7',
    realmId: 'realm-7',
  });
  assert.equal(await repository.completeTransition(
    'order-1',
    'paid',
    'worker-a',
    paidClaim.claimId,
    {
      providerRefs: {
        providerOrderRef: 'bk-order-order-1',
        realmId: 'realm-7',
        providerPaymentRef: 'payment-7',
      },
    }
  ), false);
});

test('keeps a claimed terminal transition discoverable until the claim completes', async () => {
  const {firestore, repository} = repositoryFixture();
  await repository.createOrder('order-1', digitalOrder({status: 'fulfilling'}));
  const claim = await repository.claimTransition('order-1', 'fulfilled', 'worker-a');

  assert.equal(firestore.document('orders/order-1').terminal, false);
  assert.deepEqual(
    (await repository.listReconciliationCandidates(
      new Date('2026-08-29T19:00:00.000Z')
    )).map(order => order.id),
    ['order-1']
  );

  await repository.completeTransition('order-1', 'fulfilled', 'worker-a', claim.claimId);

  assert.equal(firestore.document('orders/order-1').terminal, true);
  assert.deepEqual(await repository.listReconciliationCandidates(
    new Date('2026-08-29T19:00:00.000Z')
  ), []);

  const refundClaim = await repository.claimTransition('order-1', 'refunded', 'worker-a');
  assert.equal(
    firestore.document('orders/order-1').reconciliationDueAt.toDate().toISOString(),
    '2026-08-29T18:00:00.000Z'
  );
  assert.deepEqual(
    (await repository.listReconciliationCandidates(
      new Date('2026-08-29T19:00:00.000Z')
    )).map(order => order.id),
    ['order-1']
  );
  assert.equal(refundClaim.claimId, 'claim-2');
});

test('successful completion clears stale failure and retry metadata', async () => {
  const {firestore, repository} = repositoryFixture();
  await repository.createOrder('order-1', digitalOrder());
  const firstClaim = await repository.claimTransition(
    'order-1', 'payment_verifying', 'worker-a'
  );
  await repository.recordFailure(
    'order-1',
    'payment_verifying',
    'worker-a',
    firstClaim.claimId,
    {code: 'provider_timeout', retryAt: new Date('2026-08-29T18:15:00.000Z')}
  );
  const retryClaim = await repository.claimTransition(
    'order-1', 'payment_verifying', 'worker-a'
  );

  await repository.completeTransition(
    'order-1', 'payment_verifying', 'worker-a', retryClaim.claimId
  );

  const stored = firestore.document('orders/order-1');
  assert.equal(stored.lastErrorCode, null);
  assert.equal(stored.retry, null);
  assert.equal(
    stored.reconciliationDueAt.toDate().toISOString(),
    '2026-08-29T18:00:00.000Z'
  );
});

test('lists due nonterminal reconciliation candidates in due-time order', async () => {
  let current = new Date('2026-08-29T18:00:00.000Z');
  const {repository} = repositoryFixture(() => current);
  await repository.createOrder('order-later', digitalOrder());
  current = new Date('2026-08-29T17:00:00.000Z');
  await repository.createOrder('order-earlier', digitalOrder());
  current = new Date('2026-08-29T16:00:00.000Z');
  await repository.createOrder('order-terminal', digitalOrder({status: 'cancelled'}));
  current = new Date('2026-08-29T15:00:00.000Z');
  await repository.createOrder('order-manual-review', digitalOrder({status: 'manual_review'}));

  const candidates = await repository.listReconciliationCandidates(
    new Date('2026-08-29T19:00:00.000Z'),
    {limit: 10}
  );

  assert.deepEqual(candidates.map(order => order.id), ['order-earlier', 'order-later']);
});

test('atomically reserves one recipient and SKU order with both durable invoice effects', async () => {
  const {firestore, repository} = repositoryFixture();

  const [first, second] = await Promise.all([
    repository.createReservedDigitalOrder({
      recipientBinding: RECIPIENT_BINDING,
      orderId: 'order-a',
      order: digitalOrder(),
    }),
    repository.createReservedDigitalOrder({
      recipientBinding: RECIPIENT_BINDING,
      orderId: 'order-b',
      order: digitalOrder(),
    }),
  ]);

  assert.equal(first.orderId, 'order-a');
  assert.equal(first.duplicate, false);
  assert.equal(second.orderId, 'order-a');
  assert.equal(second.duplicate, true);
  assert.equal(firestore.document('orders/order-a').customerUid, 'customer-uid');
  assert.equal(firestore.document('orders/order-b'), undefined);
  const effects = firestore.collection('commerceEffects');
  assert.equal(effects.length, 2);
  assert.deepEqual(effects.map(effect => effect.effect).sort(), ['invoice_create', 'invoice_send']);
  assert.equal(JSON.stringify(effects).includes(RECIPIENT_BINDING), false);
});

test('fails closed when an existing pilot reservation is owned by another user', async () => {
  const {repository} = repositoryFixture();
  await repository.createReservedDigitalOrder({
    recipientBinding: RECIPIENT_BINDING,
    orderId: 'order-a',
    order: digitalOrder(),
  });

  await assert.rejects(repository.createReservedDigitalOrder({
    recipientBinding: RECIPIENT_BINDING,
    orderId: 'order-b',
    order: digitalOrder({customerUid: 'different-user'}),
  }), {code: 'ORDER_RESERVATION_CONFLICT'});
});

test('allows only one five-minute effect lease claimant', async () => {
  const now = new Date('2026-08-29T18:00:00.000Z');
  const {firestore, repository} = repositoryFixture(() => now);
  await repository.createReservedDigitalOrder({
    recipientBinding: RECIPIENT_BINDING,
    orderId: 'order-a',
    order: digitalOrder(),
  });

  const [first, second] = await Promise.all([
    repository.claimEffect('order-a', 'invoice_create', 'worker-a', now),
    repository.claimEffect('order-a', 'invoice_create', 'worker-b', now),
  ]);

  assert.deepEqual(first, {claimId: 'claim-1'});
  assert.equal(second, false);
  const effect = firestore.document('commerceEffects/order-a-invoice_create');
  assert.equal(effect.claim.workerId, 'worker-a');
  assert.equal(effect.claim.claimId, 'claim-1');
  assert.equal(effect.claim.claimedAt.toDate().toISOString(), now.toISOString());
  assert.equal(
    effect.claim.leaseExpiresAt.toDate().toISOString(),
    '2026-08-29T18:05:00.000Z'
  );
});

test('completes only the exact create claim and keeps Invoice references immutable', async () => {
  const {firestore, repository} = repositoryFixture();
  await repository.createReservedDigitalOrder({
    recipientBinding: RECIPIENT_BINDING,
    orderId: 'order-a',
    order: digitalOrder(),
  });
  const claim = await repository.claimEffect(
    'order-a', 'invoice_create', 'worker-a', new Date('2026-08-29T18:00:00.000Z')
  );
  const providerRefs = {
    realmId: 'realm-1',
    invoiceId: 'invoice-1',
    customerId: 'customer-1',
    providerOrderRef: 'bk-order-order-a',
  };

  await assert.rejects(repository.completeEffect(
    'order-a', 'invoice_create', 'worker-b', claim.claimId, {providerRefs}
  ), {code: 'EFFECT_CLAIM_LOST'});
  assert.equal(await repository.completeEffect(
    'order-a', 'invoice_create', 'worker-a', claim.claimId, {providerRefs}
  ), true);
  assert.equal(await repository.completeEffect(
    'order-a', 'invoice_create', 'worker-a', claim.claimId, {providerRefs}
  ), false);
  assert.deepEqual(firestore.document('orders/order-a').providerRefs, providerRefs);
  assert.equal(firestore.document('commerceEffects/order-a-invoice_create').status, 'completed');

  await assert.rejects(repository.completeEffect(
    'order-a', 'invoice_create', 'worker-a', claim.claimId,
    {providerRefs: {...providerRefs, invoiceId: 'invoice-2'}}
  ), {code: 'PROVIDER_REF_CONFLICT'});
});

test('requires the completed create effect and deterministic order reference before send can be claimed', async () => {
  const {firestore, repository} = repositoryFixture();
  await repository.createReservedDigitalOrder({
    recipientBinding:RECIPIENT_BINDING,orderId:'order-a',order:digitalOrder(),
  });
  firestore.document('orders/order-a').providerRefs = {
    realmId:'realm-1',invoiceId:'invoice-1',customerId:'customer-1',providerOrderRef:'wrong-reference',
  };
  assert.equal(await repository.claimEffect(
    'order-a','invoice_send','worker-a',new Date('2026-08-29T18:00:00.000Z')
  ), false);

  const createClaim = await repository.claimEffect(
    'order-a','invoice_create','worker-a',new Date('2026-08-29T18:00:00.000Z')
  );
  await assert.rejects(repository.completeEffect(
    'order-a','invoice_create','worker-a',createClaim.claimId,
    {providerRefs:{
      realmId:'realm-1',invoiceId:'invoice-1',customerId:'customer-1',providerOrderRef:'wrong-reference',
    }}
  ), {code:'PROVIDER_REF_CONFLICT'});
});

test('stores bounded effect failures without provider payloads or raw recipients', async () => {
  const {firestore, repository} = repositoryFixture();
  await repository.createReservedDigitalOrder({
    recipientBinding: RECIPIENT_BINDING,
    orderId: 'order-a',
    order: digitalOrder(),
  });
  const claim = await repository.claimEffect(
    'order-a', 'invoice_create', 'worker-a', new Date('2026-08-29T18:00:00.000Z')
  );

  await repository.recordEffectFailure(
    'order-a', 'invoice_create', 'worker-a', claim.claimId,
    {code: 'PROVIDER FAILED: ada@example.test', providerPayload: {accessToken: 'secret'}},
    new Date('2026-08-29T18:01:00.000Z')
  );

  const serialized = JSON.stringify({
    effect: firestore.document('commerceEffects/order-a-invoice_create'),
    audits: firestore.collection('commerceAudit'),
  });
  assert.equal(serialized.includes('ada@example.test'), false);
  assert.equal(serialized.includes('accessToken'), false);
  assert.equal(serialized.includes('secret'), false);
  assert.equal(serialized.includes('operation_failed'), true);
});

test('backs off known create failures and will not reclaim before the bounded retry time', async () => {
  const {firestore, repository} = repositoryFixture();
  await repository.createReservedDigitalOrder({
    recipientBinding:RECIPIENT_BINDING,orderId:'order-a',order:digitalOrder(),
  });
  const claim = await repository.claimEffect(
    'order-a','invoice_create','worker-a',new Date('2026-08-29T18:00:00.000Z')
  );
  await repository.recordEffectFailure(
    'order-a','invoice_create','worker-a',claim.claimId,
    {code:'invoice_create_failed'},new Date('2026-08-29T18:01:00.000Z')
  );

  const effect = firestore.document('commerceEffects/order-a-invoice_create');
  assert.equal(effect.attemptCount, 1);
  assert.equal(effect.nextAttemptAt.toDate().toISOString(), '2026-08-29T18:06:00.000Z');
  assert.equal(await repository.claimEffect(
    'order-a','invoice_create','worker-b',new Date('2026-08-29T18:05:59.999Z')
  ), false);
  assert.deepEqual(await repository.claimEffect(
    'order-a','invoice_create','worker-b',new Date('2026-08-29T18:06:00.000Z')
  ), {claimId:'claim-3'});
});

test('rejects crossing either outbound dispatch boundary at or after lease expiry', async () => {
  const {repository} = repositoryFixture();
  await repository.createPilotAuthEmailEffect(RECIPIENT_BINDING);
  const authClaim = await repository.claimPilotAuthEmailEffect(
    RECIPIENT_BINDING,'auth-worker',new Date('2026-08-29T18:00:00.000Z')
  );
  await assert.rejects(repository.markPilotAuthDispatchStarted(
    RECIPIENT_BINDING,'auth-worker',authClaim.claimId,new Date('2026-08-29T18:05:00.000Z')
  ), {code:'EFFECT_LEASE_EXPIRED'});

  await repository.createReservedDigitalOrder({
    recipientBinding:'b'.repeat(64),orderId:'order-a',order:digitalOrder(),
  });
  const createClaim = await repository.claimEffect(
    'order-a','invoice_create','worker-a',new Date('2026-08-29T18:00:00.000Z')
  );
  await repository.completeEffect('order-a','invoice_create','worker-a',createClaim.claimId, {
    providerRefs:{
      realmId:'realm-1',invoiceId:'invoice-1',customerId:'customer-1',providerOrderRef:'bk-order-order-a',
    },
  });
  const sendClaim = await repository.claimEffect(
    'order-a','invoice_send','send-worker',new Date('2026-08-29T18:00:00.000Z')
  );
  await assert.rejects(repository.markEffectDispatchStarted(
    'order-a','invoice_send','send-worker',sendClaim.claimId,new Date('2026-08-29T18:05:00.000Z')
  ), {code:'EFFECT_LEASE_EXPIRED'});
});

test('quarantines an expired invoice-send lease and permanently prevents another send claim', async () => {
  const {firestore, repository} = repositoryFixture();
  await repository.createReservedDigitalOrder({
    recipientBinding: RECIPIENT_BINDING,
    orderId: 'order-a',
    order: digitalOrder(),
  });
  const createClaim = await repository.claimEffect(
    'order-a', 'invoice_create', 'worker-a', new Date('2026-08-29T18:00:00.000Z')
  );
  await repository.completeEffect(
    'order-a', 'invoice_create', 'worker-a', createClaim.claimId,
    {providerRefs: {
      realmId: 'realm-1', invoiceId: 'invoice-1', customerId: 'customer-1',
      providerOrderRef: 'bk-order-order-a',
    }}
  );
  const sendClaim = await repository.claimEffect(
    'order-a', 'invoice_send', 'worker-a', new Date('2026-08-29T18:01:00.000Z')
  );
  await repository.markEffectDispatchStarted(
    'order-a', 'invoice_send', 'worker-a', sendClaim.claimId,
    new Date('2026-08-29T18:01:01.000Z')
  );

  assert.deepEqual(await repository.recoverExpiredEffects(
    new Date('2026-08-29T18:05:59.999Z')
  ), {recoveredCreateOrderIds: [], recoveredPilotAuthBindings: [], manualReviewOrderIds: [], manualReviewPilotAuthBindings: []});
  const recovered = await repository.recoverExpiredEffects(
    new Date('2026-08-29T18:06:00.000Z')
  );

  assert.deepEqual(recovered.manualReviewOrderIds, ['order-a']);
  assert.equal(firestore.document('commerceEffects/order-a-invoice_send').status, 'manual_review');
  assert.equal(firestore.document('orders/order-a').status, 'manual_review');
  assert.equal(firestore.document('orders/order-a').lastErrorCode, 'invoice_send_unknown');
  assert.equal(await repository.claimEffect(
    'order-a', 'invoice_send', 'worker-b', new Date('2026-08-29T18:07:00.000Z')
  ), false);
});

test('creates one protected pilot auth effect and records the one dispatch attempt before delivery', async () => {
  const {firestore, repository} = repositoryFixture();
  assert.equal(await repository.createPilotAuthEmailEffect(RECIPIENT_BINDING), true);
  assert.equal(await repository.createPilotAuthEmailEffect(RECIPIENT_BINDING), false);
  const claim = await repository.claimPilotAuthEmailEffect(
    RECIPIENT_BINDING, 'auth-worker', new Date('2026-08-29T18:00:00.000Z')
  );

  assert.deepEqual(claim, {claimId: 'claim-1'});
  assert.equal(await repository.markPilotAuthDispatchStarted(
    RECIPIENT_BINDING, 'auth-worker', claim.claimId,
    new Date('2026-08-29T18:00:01.000Z')
  ), true);
  const effect = firestore.collection('commerceEffects').find(item => item.effect === 'pilot_auth_email');
  assert.equal(effect.dispatchAttemptCount, 1);
  assert.equal(effect.dispatchStartedAt.toDate().toISOString(), '2026-08-29T18:00:01.000Z');
  assert.equal(await repository.completePilotAuthEmailEffect(
    RECIPIENT_BINDING, 'auth-worker', claim.claimId
  ), true);
  assert.equal(await repository.completePilotAuthEmailEffect(
    RECIPIENT_BINDING, 'auth-worker', claim.claimId
  ), false);
  assert.equal(JSON.stringify(effect).includes(RECIPIENT_BINDING), false);
});

test('recovers only pre-dispatch pilot auth leases and quarantines ambiguous dispatches', async () => {
  const firstBinding = 'a'.repeat(64);
  const secondBinding = 'b'.repeat(64);
  const {firestore, repository} = repositoryFixture();
  await repository.createPilotAuthEmailEffect(firstBinding);
  await repository.createPilotAuthEmailEffect(secondBinding);
  await repository.claimPilotAuthEmailEffect(
    firstBinding, 'auth-worker', new Date('2026-08-29T18:00:00.000Z')
  );
  const ambiguousClaim = await repository.claimPilotAuthEmailEffect(
    secondBinding, 'auth-worker', new Date('2026-08-29T18:00:00.000Z')
  );
  await repository.markPilotAuthDispatchStarted(
    secondBinding, 'auth-worker', ambiguousClaim.claimId,
    new Date('2026-08-29T18:00:01.000Z')
  );

  const recovered = await repository.recoverExpiredEffects(
    new Date('2026-08-29T18:05:00.000Z')
  );

  assert.deepEqual(recovered.recoveredPilotAuthBindings, [firstBinding]);
  assert.deepEqual(recovered.manualReviewPilotAuthBindings, [secondBinding]);
  const authEffects = firestore.collection('commerceEffects')
    .filter(item => item.effect === 'pilot_auth_email');
  assert.deepEqual(authEffects.map(item => item.status).sort(), ['manual_review', 'pending']);
  assert.equal(authEffects.find(item => item.status === 'manual_review').lastErrorCode, 'pilot_auth_email_unknown');
});

test('stores idempotent webhook hints with the exact normalized field allowlist', async () => {
  const {firestore, repository} = repositoryFixture();
  const hint = {
    realmId:'realm-1',entityName:'Invoice',entityId:'invoice-1',operation:'Update',
    lastUpdated:'2026-08-29T18:00:00.000Z',
  };

  assert.equal(await repository.storeWebhookHint('b'.repeat(64), hint), true);
  assert.equal(await repository.storeWebhookHint('b'.repeat(64), hint), false);
  assert.deepEqual(firestore.document(`commerceWebhookHints/${'b'.repeat(64)}`), hint);
  await assert.rejects(repository.storeWebhookHint('c'.repeat(64), {
    ...hint,rawBody:'must-not-be-stored',
  }), {code:'ORDER_INVALID'});
});

test('creates one redacted fulfillment grant for a paid digital order', async () => {
  const {firestore, repository} = repositoryFixture();
  await repository.createReservedDigitalOrder({
    recipientBinding:RECIPIENT_BINDING,
    orderId:'order-a',
    order:digitalOrder({status:'paid'}),
  });

  assert.equal(await repository.grantDigitalFulfillment('order-a'), true);
  assert.equal(await repository.grantDigitalFulfillment('order-a'), false);
  assert.deepEqual(firestore.document('fulfillmentGrants/order-a'), {
    orderId:'order-a',sku:'study-guide',customerUid:'customer-uid',
    fulfillmentType:'protected_download',status:'active',createdAt:SERVER_TIMESTAMP,
  });
});

test('enforces bounded digest-keyed abuse windows without storing raw identifiers', async () => {
  const {firestore, repository} = repositoryFixture();
  const firstWindow = new Date('2026-08-29T18:00:00.000Z');
  const nextWindow = new Date('2026-08-29T18:10:00.000Z');
  const key = 'd'.repeat(64);

  assert.equal(await repository.consumeRateLimit('pilot_auth', key, firstWindow, {limit:2,windowMs:600000}), true);
  assert.equal(await repository.consumeRateLimit('pilot_auth', key, firstWindow, {limit:2,windowMs:600000}), true);
  assert.equal(await repository.consumeRateLimit('pilot_auth', key, firstWindow, {limit:2,windowMs:600000}), false);
  assert.equal(await repository.consumeRateLimit('pilot_auth', key, nextWindow, {limit:2,windowMs:600000}), true);
  const serialized = JSON.stringify(firestore.collection('commerceRateLimits'));
  assert.equal(serialized.includes('approved-pilot@example.test'), false);
});

test('records only bounded redacted operator alerts', async () => {
  const {firestore, repository} = repositoryFixture();
  await repository.recordOperatorAlert({
    code:'invoice_send_unknown',orderId:'order-a',email:'approved-pilot@example.test',link:'https://secret',
  });

  const alert = firestore.collection('commerceAudit').at(-1);
  assert.deepEqual(Object.keys(alert).sort(), ['createdAt','errorCode','event','orderId']);
  assert.equal(alert.event, 'operator_alert');
  assert.equal(alert.errorCode, 'invoice_send_unknown');
  assert.equal(JSON.stringify(alert).includes('approved-pilot'), false);
});
