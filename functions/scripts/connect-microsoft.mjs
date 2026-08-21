import {createServer} from 'node:http';
import {execFileSync, spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';

const project = 'the-ballers-kingdom';
const redirectUri = 'http://localhost:8787/callback';

function readSecret(name) {
  return execFileSync('firebase', ['functions:secrets:access', name, '--project', project], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function storeSecret(name, value) {
  const result = spawnSync('firebase', ['functions:secrets:set', name, '--project', project, '--data-file', '-', '--force'], {
    input: value,
    encoding: 'utf8',
    stdio: ['pipe', 'ignore', 'inherit'],
  });
  if (result.status !== 0) throw new Error(`Could not store ${name}`);
}

const tenantId = readSecret('MS_TENANT_ID');
const clientId = readSecret('MS_CLIENT_ID');
const clientSecret = readSecret('MS_CLIENT_SECRET');
const state = randomBytes(24).toString('hex');
const authorizeUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
authorizeUrl.search = new URLSearchParams({
  client_id: clientId,
  response_type: 'code',
  redirect_uri: redirectUri,
  response_mode: 'query',
  scope: 'openid profile email offline_access User.Read Mail.Send',
  state,
  login_hint: 'info@ballkingdom.com',
  prompt: 'login',
}).toString();

const server = createServer(async (request, response) => {
  try {
    const callback = new URL(request.url, redirectUri);
    if (callback.pathname !== '/callback') return response.writeHead(404).end();
    if (callback.searchParams.get('state') !== state) throw new Error('OAuth state mismatch');
    const code = callback.searchParams.get('code');
    if (!code) throw new Error(callback.searchParams.get('error_description') || 'Authorization code missing');

    const tokenResponse = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: {'content-type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code, redirect_uri: redirectUri, scope: 'openid profile email offline_access User.Read Mail.Send'}),
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.access_token || !tokens.refresh_token) throw new Error('Microsoft token exchange failed');

    const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
      headers: {authorization: `Bearer ${tokens.access_token}`},
    });
    const profile = await profileResponse.json();
    const mailbox = String(profile.mail || profile.userPrincipalName || '').toLowerCase();
    if (!profileResponse.ok || mailbox !== 'info@ballkingdom.com') throw new Error(`Connected mailbox is ${mailbox || 'unknown'}, not info@ballkingdom.com`);

    storeSecret('MS_REFRESH_TOKEN', tokens.refresh_token);
    response.writeHead(200, {'content-type': 'text/html; charset=utf-8'}).end('<h1>Microsoft 365 connected</h1><p>You can close this window.</p>');
    console.log('Microsoft 365 connected and mailbox verified.');
    server.close();
  } catch (error) {
    response.writeHead(400, {'content-type': 'text/plain; charset=utf-8'}).end('Microsoft connection failed. Return to the terminal.');
    console.error(error.message);
    server.close(() => process.exitCode = 1);
  }
});

server.listen(8787, '127.0.0.1', () => {
  execFileSync('open', [authorizeUrl.toString()]);
  console.log('Microsoft authorization opened in your browser.');
});
