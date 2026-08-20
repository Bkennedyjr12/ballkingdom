import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMicrosoftAuthUrl, buildQuickBooksAuthUrl, exchangeMicrosoftCode, exchangeQuickBooksCode} from '../src/providers/oauth.js';

test('QuickBooks authorization URL has accounting scope and state', () => {
  const url = new URL(buildQuickBooksAuthUrl({clientId:'client',redirectUri:'https://example.com/qbo',state:'state-1'}));
  assert.equal(url.searchParams.get('scope'),'com.intuit.quickbooks.accounting');
  assert.equal(url.searchParams.get('state'),'state-1');
});

test('Microsoft authorization URL requests delegated offline mail access', () => {
  const url = new URL(buildMicrosoftAuthUrl({tenantId:'tenant',clientId:'client',redirectUri:'https://example.com/ms',state:'state-2'}));
  assert.match(url.searchParams.get('scope'),/offline_access/);
  assert.match(url.searchParams.get('scope'),/Mail.Send/);
  assert.equal(url.searchParams.get('prompt'),'select_account');
});

test('OAuth exchanges return refresh tokens without exposing credentials', async () => {
  const calls=[];
  const fetchMock=async (url,options)=>{calls.push({url:String(url),options});return new Response(JSON.stringify({access_token:'access',refresh_token:'refresh'}),{status:200,headers:{'content-type':'application/json'}});};
  assert.equal((await exchangeQuickBooksCode({clientId:'c',clientSecret:'s',redirectUri:'https://e/q',code:'code'},fetchMock)).refreshToken,'refresh');
  assert.equal((await exchangeMicrosoftCode({tenantId:'t',clientId:'c',clientSecret:'s',redirectUri:'https://e/m',code:'code'},fetchMock)).refreshToken,'refresh');
  assert.equal(calls.length,2);
});
