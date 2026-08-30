import {createHash} from 'node:crypto';

const PROD_ROOT = 'https://quickbooks.api.intuit.com/v3/company';
const SANDBOX_ROOT = 'https://sandbox-quickbooks.api.intuit.com/v3/company';
const MINOR_VERSION = '75';

function qboString(value) {
  return String(value).replace(/'/g, "\\'");
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function isCurrency(value) {
  return isNonEmptyString(value) && /^[A-Z]{3}$/.test(value);
}

function unusable(entity) {
  return new Error(`QuickBooks ${entity} evidence is unusable`);
}

function invalidResponse(operation) {
  return new Error(`QuickBooks ${operation} response was invalid`);
}

async function expectJson(response, operation) {
  if (!response.ok) throw new Error(`${operation} failed with provider status ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw invalidResponse(operation);
  }
}

function providerMoneyToCents(value, entity) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw unusable(entity);
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(value - cents / 100) > 1e-9) throw unusable(entity);
  return cents;
}

function requireProviderId(value, entity) {
  if (!isNonEmptyString(value)) throw unusable(entity);
  return value;
}

function hasVoidedMarker(entity) {
  return typeof entity?.PrivateNote === 'string' && /^Voided(?:\s|$)/.test(entity.PrivateNote);
}

function assertPresentProviderEntity(entity, entityName, expectedId) {
  if (!entity || typeof entity !== 'object' || Array.isArray(entity)) throw unusable(entityName);
  const id = requireProviderId(entity.Id, entityName);
  if (expectedId !== undefined && id !== expectedId) throw unusable(entityName);
  if (Object.hasOwn(entity, 'status') || hasVoidedMarker(entity)) throw unusable(entityName);
  return id;
}

function deterministicRequestId(providerOrderRef) {
  if (providerOrderRef.length <= 50) return providerOrderRef;
  const digest = createHash('sha256').update(providerOrderRef).digest('hex').slice(0, 16);
  return `${providerOrderRef.slice(0, 33)}-${digest}`;
}

function normalizeCommerceOrder(order) {
  const orderId = order?.id ?? order?.orderId;
  const itemName = order?.name ?? order?.itemName;
  const customerName = order?.customer?.name ?? order?.customerName;
  const customerEmail = order?.customer?.email ?? order?.customerEmail;
  const {amountCents, currency} = order ?? {};
  if (
    !isNonEmptyString(orderId) ||
    !isNonEmptyString(itemName) ||
    !isNonEmptyString(customerName) ||
    !isNonEmptyString(customerEmail) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    !isCurrency(currency)
  ) {
    throw new Error('Commerce invoice order is invalid');
  }
  return {orderId,itemName,customerName,customerEmail,amountCents,currency};
}

function normalizePaymentEntity(payment, expectedId) {
  const providerPaymentRef = assertPresentProviderEntity(payment, 'Payment', expectedId);
  const totalAmountCents = providerMoneyToCents(payment.TotalAmt, 'Payment');
  const unappliedAmountCents = providerMoneyToCents(payment.UnappliedAmt, 'Payment');
  if (totalAmountCents <= 0 || unappliedAmountCents > totalAmountCents || !Array.isArray(payment.Line)) {
    throw unusable('Payment');
  }

  const applications = [];
  let appliedAmountCents = 0;
  for (const line of payment.Line) {
    if (!line || typeof line !== 'object' || Array.isArray(line) || !Array.isArray(line.LinkedTxn) || line.LinkedTxn.length !== 1) {
      throw unusable('Payment');
    }
    const amountCents = providerMoneyToCents(line.Amount, 'Payment');
    const linked = line.LinkedTxn[0];
    if (!linked || typeof linked !== 'object' || Array.isArray(linked)) throw unusable('Payment');
    const linkedTxnId = requireProviderId(linked.TxnId, 'Payment');
    const linkedTxnType = requireProviderId(linked.TxnType, 'Payment');
    appliedAmountCents += amountCents;
    if (!Number.isSafeInteger(appliedAmountCents)) throw unusable('Payment');
    applications.push({linkedTxnId,linkedTxnType,amountCents});
  }
  if (appliedAmountCents + unappliedAmountCents !== totalAmountCents) throw unusable('Payment');

  return {
    providerPaymentRef,
    entityState:'present',
    totalAmountCents,
    unappliedAmountCents,
    applications,
  };
}

function normalizeInvoiceEntity(invoice, expectedId) {
  const invoiceId = assertPresentProviderEntity(invoice, 'Invoice', expectedId);
  if (
    !isNonEmptyString(invoice.PrivateNote) ||
    !invoice.PrivateNote.startsWith('bk-order-') ||
    invoice.PrivateNote.length === 'bk-order-'.length
  ) {
    throw unusable('Invoice');
  }
  const providerOrderRef = invoice.PrivateNote;
  const totalAmountCents = providerMoneyToCents(invoice.TotalAmt, 'Invoice');
  const balanceCents = providerMoneyToCents(invoice.Balance, 'Invoice');
  const currency = invoice.CurrencyRef?.value;
  if (totalAmountCents <= 0 || balanceCents > totalAmountCents || !isCurrency(currency)) throw unusable('Invoice');

  const linkedTransactions = invoice.LinkedTxn ?? [];
  if (!Array.isArray(linkedTransactions)) throw unusable('Invoice');
  const paymentIds = [];
  for (const linked of linkedTransactions) {
    if (!linked || typeof linked !== 'object' || Array.isArray(linked)) throw unusable('Invoice');
    const linkedTxnId = requireProviderId(linked.TxnId, 'Invoice');
    const linkedTxnType = requireProviderId(linked.TxnType, 'Invoice');
    if (linkedTxnType === 'Payment' && !paymentIds.includes(linkedTxnId)) paymentIds.push(linkedTxnId);
  }

  let paymentState = 'unknown';
  if (paymentIds.length > 0 && balanceCents === 0) paymentState = 'paid';
  if (paymentIds.length > 0 && balanceCents > 0 && balanceCents < totalAmountCents) paymentState = 'partially_paid';
  if (paymentIds.length === 0 && balanceCents === totalAmountCents) paymentState = 'unpaid';
  if (paymentState === 'unknown') throw unusable('Invoice');

  return {
    invoice:{
      invoiceId,
      providerOrderRef,
      totalAmountCents,
      balanceCents,
      currency,
      entityState:'present',
      paymentState,
    },
    paymentIds,
  };
}

function normalizeDocumentNumber(value) {
  if (value == null) return null;
  if (!isNonEmptyString(value)) throw invalidResponse('Invoice create');
  return value;
}

function assertCommerceInvoiceReadback(providerInvoice, normalizedInvoice, expected) {
  const salesLines = Array.isArray(providerInvoice?.Line)
    ? providerInvoice.Line.filter(line => line?.DetailType === 'SalesItemLineDetail')
    : [];
  const line = salesLines[0];
  const detail = line?.SalesItemLineDetail;
  if (
    salesLines.length !== 1 ||
    providerInvoice.CustomerRef?.value !== expected.customerId ||
    normalizedInvoice.providerOrderRef !== expected.providerOrderRef ||
    normalizedInvoice.totalAmountCents !== expected.amountCents ||
    normalizedInvoice.balanceCents !== expected.amountCents ||
    normalizedInvoice.currency !== expected.currency ||
    normalizedInvoice.entityState !== 'present' ||
    normalizedInvoice.paymentState !== 'unpaid' ||
    detail?.ItemRef?.value !== expected.itemId ||
    detail.Qty !== 1 ||
    providerMoneyToCents(line.Amount, 'Invoice') !== expected.amountCents ||
    providerMoneyToCents(detail.UnitPrice, 'Invoice') !== expected.amountCents
  ) {
    throw invalidResponse('Invoice create readback');
  }
}

function normalizeCdcResponse(data, realmId) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.CDCResponse)) {
    throw invalidResponse('change data capture');
  }
  const changes = [];
  const seen = new Set();
  for (const cdcGroup of data.CDCResponse) {
    if (!cdcGroup || typeof cdcGroup !== 'object' || !Array.isArray(cdcGroup.QueryResponse)) {
      throw invalidResponse('change data capture');
    }
    for (const queryResponse of cdcGroup.QueryResponse) {
      if (!queryResponse || typeof queryResponse !== 'object' || Array.isArray(queryResponse)) {
        throw invalidResponse('change data capture');
      }
      for (const entityType of ['Invoice','Payment']) {
        const entities = queryResponse[entityType];
        if (entities === undefined) continue;
        if (!Array.isArray(entities)) throw invalidResponse('change data capture');
        for (const entity of entities) {
          if (!entity || typeof entity !== 'object' || Array.isArray(entity) || !isNonEmptyString(entity.Id)) {
            throw invalidResponse('change data capture');
          }
          let operation = 'refetch';
          if (Object.hasOwn(entity, 'status')) {
            if (entity.status !== 'Deleted') throw invalidResponse('change data capture');
            operation = 'deleted';
          }
          const key = `${entityType}:${entity.Id}:${operation}`;
          if (!seen.has(key)) {
            seen.add(key);
            changes.push({entityType,entityId:entity.Id,operation});
          }
        }
      }
    }
  }
  return {realmId:String(realmId),changes};
}

function isDocumentedInvoiceSendResult(invoice, invoiceId, customerEmail) {
  return (
    invoice !== null &&
    typeof invoice === 'object' &&
    !Array.isArray(invoice) &&
    invoice.Id === invoiceId &&
    invoice.EmailStatus === 'EmailSent' &&
    invoice.BillEmail !== null &&
    typeof invoice.BillEmail === 'object' &&
    !Array.isArray(invoice.BillEmail) &&
    invoice.BillEmail.Address === customerEmail &&
    invoice.DeliveryInfo !== null &&
    typeof invoice.DeliveryInfo === 'object' &&
    !Array.isArray(invoice.DeliveryInfo) &&
    invoice.DeliveryInfo.DeliveryType === 'Email' &&
    isNonEmptyString(invoice.DeliveryInfo.DeliveryTime) &&
    !Number.isNaN(Date.parse(invoice.DeliveryInfo.DeliveryTime)) &&
    !Object.hasOwn(invoice.DeliveryInfo, 'DeliveryErrorType')
  );
}

export async function refreshQuickBooksAccessToken({clientId,clientSecret,refreshToken} = {},fetchImpl=fetch) {
  if (![clientId,clientSecret,refreshToken].every(isNonEmptyString)) {
    throw new TypeError('QuickBooks authentication configuration is invalid');
  }
  const credentials=Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response=await fetchImpl('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',{
    method:'POST',
    headers:{authorization:`Basic ${credentials}`,'content-type':'application/x-www-form-urlencoded',accept:'application/json'},
    body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken}),
  });
  let result;
  try { result=await response.json(); } catch { result=null; }
  if (!response.ok) {
    const error=new Error('QuickBooks authentication was rejected');
    if (result?.error === 'invalid_grant') error.code='invalid_grant';
    throw error;
  }
  if (!isNonEmptyString(result?.access_token) || !isNonEmptyString(result?.refresh_token)) {
    throw new Error('QuickBooks authentication response was invalid');
  }
  return {accessToken:result.access_token,refreshToken:result.refresh_token,expiresIn:Number(result.expires_in)};
}

export function createQuickBooksClient(config, fetchImpl = fetch) {
  const root = config.sandbox ? SANDBOX_ROOT : PROD_ROOT;
  let cachedAccessToken = null;

  async function accessToken() {
    if (config.accessTokenProvider?.getAccessToken) {
      return config.accessTokenProvider.getAccessToken();
    }
    if (cachedAccessToken) return cachedAccessToken;
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    const response = await fetchImpl('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method:'POST',
      headers:{authorization:`Basic ${credentials}`,'content-type':'application/x-www-form-urlencoded',accept:'application/json'},
      body:new URLSearchParams({grant_type:'refresh_token',refresh_token:config.refreshToken}),
    });
    const result = await expectJson(response, 'QuickBooks authentication');
    if (!result.access_token) throw new Error('QuickBooks authentication returned no access token');
    if (result.refresh_token && config.onRefreshToken) await config.onRefreshToken(result.refresh_token);
    cachedAccessToken = result.access_token;
    return cachedAccessToken;
  }

  async function request(path, {method='GET', body, accept='application/json', contentType='application/json'} = {}) {
    const token = await accessToken();
    const response = await fetchImpl(`${root}/${encodeURIComponent(config.realmId)}${path}`, {
      method,
      headers:{authorization:`Bearer ${token}`,accept,'content-type':contentType},
      body:body == null ? undefined : contentType === 'application/json' ? JSON.stringify(body) : body,
    });
    if (!response.ok) throw new Error(`QuickBooks request failed with provider status ${response.status}`);
    return response;
  }

  async function requestJson(path, options, operation) {
    const response = await request(path, options);
    return expectJson(response, operation);
  }

  async function query(entity, field, value) {
    const statement = `select * from ${entity} where ${field} = '${qboString(value)}' maxresults 1`;
    const data = await requestJson(
      `/query?query=${encodeURIComponent(statement)}&minorversion=${MINOR_VERSION}`,
      undefined,
      `${entity} query`,
    );
    if (!data?.QueryResponse || typeof data.QueryResponse !== 'object' || Array.isArray(data.QueryResponse)) {
      throw invalidResponse(`${entity} query`);
    }
    const matches = data.QueryResponse[entity];
    if (matches === undefined) return null;
    if (!Array.isArray(matches)) throw invalidResponse(`${entity} query`);
    return matches[0] ?? null;
  }

  async function ensureCustomer({customerName, customerEmail}) {
    const existing = await query('Customer', 'PrimaryEmailAddr', customerEmail);
    if (existing) return existing;
    const data = await requestJson(
      `/customer?minorversion=${MINOR_VERSION}`,
      {method:'POST',body:{DisplayName:customerName,PrimaryEmailAddr:{Address:customerEmail}}},
      'Customer create',
    );
    if (!data?.Customer || typeof data.Customer !== 'object' || Array.isArray(data.Customer)) {
      throw invalidResponse('Customer create');
    }
    return data.Customer;
  }

  async function readPayment(paymentId) {
    if (!isNonEmptyString(paymentId)) throw unusable('Payment');
    const data = await requestJson(
      `/payment/${encodeURIComponent(paymentId)}?minorversion=${MINOR_VERSION}`,
      undefined,
      'Payment read',
    );
    return normalizePaymentEntity(data?.Payment, paymentId);
  }

  async function readInvoiceEntity(invoiceId) {
    const data = await requestJson(
      `/invoice/${encodeURIComponent(invoiceId)}?minorversion=${MINOR_VERSION}`,
      undefined,
      'Invoice read',
    );
    const normalized = normalizeInvoiceEntity(data?.Invoice, invoiceId);
    return {providerInvoice:data.Invoice,...normalized};
  }

  return {
    async createInvoice({customerName, customerEmail, itemName, description, amount, useCatalogPrice, appointmentId}) {
      const customer = await ensureCustomer({customerName, customerEmail});
      const item = await query('Item', 'Name', itemName);
      if (!item) throw new Error(`QuickBooks service item is not configured: ${itemName}`);
      const lineAmount = useCatalogPrice ? Number(item.UnitPrice) : Number(amount);
      if (!Number.isFinite(lineAmount) || lineAmount <= 0) throw new Error('Invoice amount is invalid');
      const payload = {
        CustomerRef:{value:customer.Id},
        CustomerMemo:{value:`Appointment ${appointmentId}`},
        PrivateNote:`Ballers Kingdom appointment ${appointmentId}`,
        Line:[{
          DetailType:'SalesItemLineDetail',
          Amount:lineAmount,
          Description:description,
          SalesItemLineDetail:{ItemRef:{value:item.Id,name:item.Name},Qty:1,UnitPrice:lineAmount},
        }],
      };
      const requestId = encodeURIComponent(`bk-${appointmentId}`.slice(0, 50));
      const response = await request(`/invoice?minorversion=${MINOR_VERSION}&requestid=${requestId}`, {method:'POST', body:payload});
      const result = await response.json();
      return {id:result.Invoice.Id, number:result.Invoice.DocNumber, raw:result.Invoice};
    },

    async getInvoicePdf(invoiceId) {
      const response = await request(`/invoice/${encodeURIComponent(invoiceId)}/pdf`, {accept:'application/pdf'});
      return Buffer.from(await response.arrayBuffer());
    },

    async createCommerceInvoice(order) {
      const normalizedOrder = normalizeCommerceOrder(order);
      const providerOrderRef = `bk-order-${normalizedOrder.orderId}`;
      const customer = await ensureCustomer(normalizedOrder);
      if (!customer || !isNonEmptyString(customer.Id)) throw invalidResponse('Customer read/create');
      const item = await query('Item', 'Name', normalizedOrder.itemName);
      if (!item || !isNonEmptyString(item.Id)) {
        throw new Error(`QuickBooks commerce item is not configured: ${normalizedOrder.itemName}`);
      }
      const amount = normalizedOrder.amountCents / 100;
      const payload = {
        CustomerRef:{value:customer.Id},
        CurrencyRef:{value:normalizedOrder.currency},
        CustomerMemo:{value:`Order ${normalizedOrder.orderId}`},
        PrivateNote:providerOrderRef,
        Line:[{
          DetailType:'SalesItemLineDetail',
          Amount:amount,
          Description:normalizedOrder.itemName,
          SalesItemLineDetail:{ItemRef:{value:item.Id,name:item.Name},Qty:1,UnitPrice:amount},
        }],
      };
      const requestId = encodeURIComponent(deterministicRequestId(providerOrderRef));
      const data = await requestJson(
        `/invoice?minorversion=${MINOR_VERSION}&requestid=${requestId}`,
        {method:'POST',body:payload},
        'Invoice create',
      );
      if (!data?.Invoice || !isNonEmptyString(data.Invoice.Id)) {
        throw invalidResponse('Invoice create');
      }
      const documentNumber = normalizeDocumentNumber(data.Invoice.DocNumber);
      try {
        const readback = await readInvoiceEntity(data.Invoice.Id);
        assertCommerceInvoiceReadback(readback.providerInvoice, readback.invoice, {
          customerId:customer.Id,
          itemId:item.Id,
          providerOrderRef,
          amountCents:normalizedOrder.amountCents,
          currency:normalizedOrder.currency,
        });
      } catch {
        throw new Error('QuickBooks Invoice create readback was invalid');
      }
      return {
        customerId:customer.Id,
        invoiceId:data.Invoice.Id,
        documentNumber,
      };
    },

    async sendInvoice({invoiceId, customerEmail} = {}) {
      if (!isNonEmptyString(invoiceId) || !isNonEmptyString(customerEmail)) {
        throw new Error('QuickBooks Invoice send input is invalid');
      }
      const queryParams = new URLSearchParams({sendTo:customerEmail,minorversion:MINOR_VERSION});
      const data = await requestJson(
        `/invoice/${encodeURIComponent(invoiceId)}/send?${queryParams}`,
        {method:'POST',contentType:'application/octet-stream'},
        'Invoice send',
      );
      if (!isDocumentedInvoiceSendResult(data?.Invoice, invoiceId, customerEmail)) {
        throw invalidResponse('Invoice send');
      }
      return {invoiceId,sendAccepted:true};
    },

    async getInvoice(invoiceId) {
      if (!isNonEmptyString(invoiceId)) throw unusable('Invoice');
      const normalized = await readInvoiceEntity(invoiceId);
      const payments = [];
      for (const paymentId of normalized.paymentIds) payments.push(await readPayment(paymentId));
      return {realmId:String(config.realmId),invoice:normalized.invoice,payments};
    },

    async getPayment(paymentId) {
      return readPayment(paymentId);
    },

    async getAccountingChanges({changedSince} = {}) {
      if (!isNonEmptyString(changedSince) || Number.isNaN(Date.parse(changedSince))) {
        throw new Error('QuickBooks change data capture input is invalid');
      }
      const queryParams = new URLSearchParams({entities:'Invoice,Payment',changedSince});
      const data = await requestJson(
        `/cdc?${queryParams}`,
        {contentType:'text/plain'},
        'change data capture',
      );
      return normalizeCdcResponse(data, config.realmId);
    },
  };
}
