async function tokenJson(response, provider) {
  if (!response.ok) throw new Error(`${provider} authorization failed with status ${response.status}`);
  const body = await response.json();
  if (!body.access_token || !body.refresh_token) throw new Error(`${provider} did not return offline access`);
  return {accessToken:body.access_token,refreshToken:body.refresh_token,expiresIn:body.expires_in};
}

export function buildQuickBooksAuthUrl({clientId,redirectUri,state}) {
  const url = new URL('https://appcenter.intuit.com/connect/oauth2');
  url.search = new URLSearchParams({client_id:clientId,response_type:'code',scope:'com.intuit.quickbooks.accounting',redirect_uri:redirectUri,state}).toString();
  return url.toString();
}

export async function exchangeQuickBooksCode({clientId,clientSecret,redirectUri,code},fetchImpl=fetch) {
  const response = await fetchImpl('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method:'POST',
    headers:{authorization:`Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,'content-type':'application/x-www-form-urlencoded',accept:'application/json'},
    body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:redirectUri}),
  });
  return tokenJson(response,'QuickBooks');
}

export function buildMicrosoftAuthUrl({tenantId,clientId,redirectUri,state}) {
  const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize`);
  url.search = new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:redirectUri,response_mode:'query',scope:'openid profile email offline_access Mail.Send',state,prompt:'select_account'}).toString();
  return url.toString();
}

export async function exchangeMicrosoftCode({tenantId,clientId,clientSecret,redirectUri,code},fetchImpl=fetch) {
  const response = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,grant_type:'authorization_code',code,redirect_uri:redirectUri,scope:'openid profile email offline_access Mail.Send'}),
  });
  return tokenJson(response,'Microsoft');
}
