import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Apliiq transport boundary (Node 22). Official contracts checked 2026-10-17:
 * https://help.apliiq.com/portal/en/kb/articles/create-order
 * https://help.apliiq.com/portal/en/kb/articles/get-order
 * https://help.apliiq.com/portal/en/kb/articles/fulfillment-url
 * The docs spell HMACSHA265; implementation uses HMAC-SHA256, their SHA256
 * authentication scheme. Request signature input is app key + Unix seconds +
 * nonce + base64(exact request body); GET signs an empty body component.
 * No POST retries, redirects, environment reads, logging or account operations.
 * Callers must durably reconcile unknown submissions before submitting again.
 */
const ENDPOINT = 'https://api.apliiq.com/v1/Order';
const MAX_BYTES = 1024 * 1024;
const text = (v, max = 256) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const validId = v => (Number.isSafeInteger(v) && v > 0) || (text(v, 128) && /^[A-Za-z0-9_-]+$/.test(v));
const supplierId = v => (Number.isSafeInteger(v) && v > 0) || (typeof v === 'string' && /^[1-9]\d{0,19}$/.test(v));
const unknown = (reason, httpStatus) => ({status:'unknown', ...(httpStatus === undefined ? {} : {httpStatus}), reason, manualReview:true});

function validateOrder(order) {
  const bad = () => { throw new TypeError('Invalid Apliiq order'); };
  if (!order || typeof order !== 'object' || Array.isArray(order)) bad();
  if (![order.id, order.number, order.order_number].every(validId) || !text(order.name)) bad();
  if (!Array.isArray(order.line_items) || order.line_items.length < 1 || order.line_items.length > 100) bad();
  for (const item of order.line_items) {
    if (!item || !validId(item.id) || (!text(item.title) && !text(item.name)) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000) bad();
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(String(item.price)) || !Number.isFinite(Number(item.price))) bad();
    if (!text(item.sku, 128) || !/^APQ-\d+S\d+A\d+$/.test(item.sku)) bad();
  }
  const address = order.shipping_address;
  if (!address || !['first_name','last_name','address1','city','zip','province','country','country_code'].every(k => text(address[k]))) bad();
  if (!/^[A-Z]{2}$/.test(address.country_code) || (address.country_code === 'US' && !/^[A-Z]{2}$/.test(address.province_code))) bad();
  if (order.shipping_lines !== undefined && (!Array.isArray(order.shipping_lines) || order.shipping_lines.length > 1 || order.shipping_lines.some(s => !s || !['standard','upgraded','rush'].includes(s.code)))) bad();
  let body;
  try { body = JSON.stringify(order); } catch { bad(); }
  if (Buffer.byteLength(body) > MAX_BYTES) bad();
  return body;
}

/**
 * @param {{fetchImpl?: typeof fetch, key:string, secret:string, timeoutMs?:number,
 * now?:()=>number, nonce?:()=>string}} config now returns epoch milliseconds.
 * createOrder returns accepted only for HTTP 200 plus a valid supplier id.
 * getOrder returns {status:'found',supplierOrderId,order,httpStatus:200} for a
 * matching single documented order. Returned order data is server-side only;
 * callers must project/authorize any buyer-facing view. Errors never echo it.
 */
export function createApliiqClient({fetchImpl = globalThis.fetch, key, secret, timeoutMs = 10000, now = Date.now, nonce = () => randomBytes(16).toString('hex')} = {}) {
  if (typeof fetchImpl !== 'function' || !text(key,200) || !/^[A-Za-z0-9._-]+$/.test(key) || !text(secret,4096) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000 || typeof now !== 'function' || typeof nonce !== 'function') throw new TypeError('Invalid Apliiq configuration');

  async function request(method, url, body) {
    const millis = now(), state = nonce();
    if (!Number.isFinite(millis) || millis < 0 || !text(state,200) || !/^[A-Za-z0-9_-]+$/.test(state)) throw new TypeError('Invalid Apliiq configuration');
    const timestamp = String(Math.floor(millis / 1000));
    const content = body === undefined ? '' : Buffer.from(body,'utf8').toString('base64');
    const signature = createHmac('sha256',secret).update(key + timestamp + state + content).digest('base64');
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { reject(new Error('deadline')); controller.abort(); }, timeoutMs);
    });
    const work = async () => {
      const response = await fetchImpl(url, {method, headers:{Accept:'application/json', ...(body === undefined ? {} : {'Content-Type':'application/json'}), Authorization:`x-apliiq-auth ${timestamp}:${signature}:${key}:${state}`}, ...(body === undefined ? {} : {body}), signal:controller.signal, redirect:'error'});
      const httpStatus = response.status;
      if (!Number.isInteger(httpStatus)) return unknown('invalid-response');
      if (httpStatus !== 200) {
        if (httpStatus === 202) return unknown('not-processed',httpStatus);
        // Only definite client rejection is known; ambiguous statuses require reconciliation.
        if ([400,401,403,404,405,410,415,422].includes(httpStatus)) return {status:'rejected',httpStatus,reason:'provider-rejected'};
        return unknown('provider-response',httpStatus);
      }
      let raw, payload;
      try {
        // Bound streamed bodies where native fetch exposes a reader; no response data
        // or provider message is copied into an error or log.
        if (response.body?.getReader) {
          const reader = response.body.getReader(); let size = 0; const chunks=[];
          try {
            while (true) { const {done,value} = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BYTES) { await reader.cancel(); return unknown('invalid-response',httpStatus); } chunks.push(Buffer.from(value)); }
          } finally { reader.releaseLock(); }
          raw = Buffer.concat(chunks).toString('utf8');
        } else raw = await response.text();
        if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_BYTES) return unknown('invalid-response',httpStatus);
        payload = JSON.parse(raw);
      } catch { return unknown('invalid-response',httpStatus); }
      return {httpStatus,payload};
    };
    try { return await Promise.race([work(),deadline]); }
    catch { return unknown(controller.signal.aborted ? 'timeout' : 'transport-error'); }
    finally { clearTimeout(timer); }
  }

  return Object.freeze({
    async createOrder(order) {
      const body = validateOrder(order);
      const result = await request('POST',ENDPOINT,body);
      if (!Object.hasOwn(result,'payload')) return result;
      if (!result.payload || Array.isArray(result.payload) || !supplierId(result.payload.id)) return unknown('invalid-response',200);
      return {status:'accepted',supplierOrderId:String(result.payload.id),httpStatus:200};
    },
    async getOrder(orderId) {
      if (!supplierId(orderId)) throw new TypeError('Invalid Apliiq order id');
      const result = await request('GET',`${ENDPOINT}/${encodeURIComponent(String(orderId))}`);
      if (!Object.hasOwn(result,'payload')) return result;
      const rows = result.payload;
      if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || !supplierId(rows[0].OrderId) || String(rows[0].OrderId) !== String(orderId)) return unknown('invalid-response',200);
      return {status:'found',supplierOrderId:String(rows[0].OrderId),order:rows[0],httpStatus:200};
    }
  });
}

/**
 * Verify x-apliiq-hmac against exact raw UTF-8 body bytes. Verification does not
 * establish event freshness or deduplicate fulfillment: Apliiq documents no
 * timestamp in this signature. The receiver must durably dedupe and validate
 * fulfillment/order identifiers before applying any state changes.
 */
export function verifyApliiqWebhook({rawBody, signature, secret} = {}) {
  if ((!Buffer.isBuffer(rawBody) && typeof rawBody !== 'string') || !text(secret,4096) || typeof signature !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const bytes = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody,'utf8');
  if (!bytes.length || bytes.length > MAX_BYTES) return false;
  const supplied = Buffer.from(signature,'base64');
  if (supplied.length !== 32 || supplied.toString('base64') !== signature) return false;
  const expected = createHmac('sha256',secret).update(bytes.toString('base64')).digest();
  return timingSafeEqual(expected,supplied);
}
