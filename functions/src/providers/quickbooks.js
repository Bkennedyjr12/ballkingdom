const PROD_ROOT = 'https://quickbooks.api.intuit.com/v3/company';
const SANDBOX_ROOT = 'https://sandbox-quickbooks.api.intuit.com/v3/company';

function qboString(value) {
  return String(value).replace(/'/g, "\\'");
}

async function expectJson(response, operation) {
  if (!response.ok) throw new Error(`${operation} failed with provider status ${response.status}`);
  return response.json();
}

export function createQuickBooksClient(config, fetchImpl = fetch) {
  const root = config.sandbox ? SANDBOX_ROOT : PROD_ROOT;
  let cachedAccessToken = null;

  async function accessToken() {
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

  async function request(path, {method='GET', body, accept='application/json'} = {}) {
    const token = await accessToken();
    const response = await fetchImpl(`${root}/${encodeURIComponent(config.realmId)}${path}`, {
      method,
      headers:{authorization:`Bearer ${token}`,accept,'content-type':'application/json'},
      body:body == null ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`QuickBooks request failed with provider status ${response.status}`);
    return response;
  }

  async function query(entity, field, value) {
    const statement = `select * from ${entity} where ${field} = '${qboString(value)}' maxresults 1`;
    const response = await request(`/query?query=${encodeURIComponent(statement)}&minorversion=75`);
    const data = await response.json();
    return data.QueryResponse?.[entity]?.[0] ?? null;
  }

  async function ensureCustomer({customerName, customerEmail}) {
    const existing = await query('Customer', 'PrimaryEmailAddr', customerEmail);
    if (existing) return existing;
    const response = await request('/customer?minorversion=75', {
      method:'POST', body:{DisplayName:customerName,PrimaryEmailAddr:{Address:customerEmail}},
    });
    return (await response.json()).Customer;
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
      const response = await request(`/invoice?minorversion=75&requestid=${requestId}`, {method:'POST', body:payload});
      const result = await response.json();
      return {id:result.Invoice.Id, number:result.Invoice.DocNumber, raw:result.Invoice};
    },
    async getInvoicePdf(invoiceId) {
      const response = await request(`/invoice/${encodeURIComponent(invoiceId)}/pdf`, {accept:'application/pdf'});
      return Buffer.from(await response.arrayBuffer());
    },
  };
}
