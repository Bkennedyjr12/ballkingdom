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
    customer: {name: 'Ada', email: 'ada@example.test'},
    status: 'pending_payment',
    ...overrides,
  };
}

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
