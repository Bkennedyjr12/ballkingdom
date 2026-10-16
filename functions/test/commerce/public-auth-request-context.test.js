import test from 'node:test';
import assert from 'node:assert/strict';
import {publicAuthRequestContext} from '../../src/commerce/public-auth-request-context.js';

const app = Object.freeze({appId:'web-app'});

function request({forwardedFor, socketAddress = '10.0.0.17', ip = '203.0.113.250'} = {}) {
  return {
    app,
    rawRequest:{
      ip,
      socket:{remoteAddress:socketAddress},
      headers:{'x-forwarded-for':forwardedFor},
    },
  };
}

test('derives the public-auth IP digest from the second-from-right client suffix element, not the socket peer', () => {
  const context = publicAuthRequestContext(request({
    forwardedFor:'198.51.100.8, 203.0.113.99',socketAddress:'fd00::17',
  }));

  assert.equal(context.app, app);
  assert.match(context.ipDigest, /^[a-f0-9]{64}$/);
  assert.notEqual(context.ipDigest, publicAuthRequestContext(request({
    forwardedFor:'198.51.100.9, 203.0.113.99',socketAddress:'192.0.2.17',
  })).ipDigest);
});

test('uses the final client and forwarding-rule suffix across attacker-prepended rotations', () => {
  const direct = publicAuthRequestContext(request({
    forwardedFor:'198.51.100.8, 203.0.113.99',
  }));
  const rotated = publicAuthRequestContext(request({
    forwardedFor:'unknown, attacker-controlled, 198.51.100.8, 203.0.113.99',
  }));

  assert.equal(rotated.ipDigest, direct.ipDigest);
});

test('accepts IPv6 client and forwarding-rule suffixes', () => {
  const direct = publicAuthRequestContext(request({
    forwardedFor:'2001:db8::8, 2001:db8:feed::99',
  }));
  const rotated = publicAuthRequestContext(request({
    forwardedFor:'unknown, not-an-ip, 2001:db8::8, 2001:db8:feed::99',socketAddress:'198.51.100.17',
  }));

  assert.match(direct.ipDigest, /^[a-f0-9]{64}$/);
  assert.equal(rotated.ipDigest, direct.ipDigest);
});

test('fails closed for missing, short, or malformed forwarded chains and never uses Express req.ip', () => {
  for (const input of [
    request(),
    request({forwardedFor:'198.51.100.8'}),
    request({forwardedFor:'unknown, 203.0.113.99'}),
    request({forwardedFor:'198.51.100.8, not-an-ip'}),
    request({forwardedFor:'198.51.100.8,, 203.0.113.99'}),
  ]) {
    assert.deepEqual(publicAuthRequestContext(input), {app});
  }
});

test('direct Functions ingress accepts its single platform-appended client IP', () => {
  const context = publicAuthRequestContext(request({forwardedFor:'198.51.100.8'}), {ingress:'cloud-functions'});
  assert.match(context.ipDigest, /^[a-f0-9]{64}$/);
});

test('direct Functions ingress ignores attacker-controlled prefixes consistently', () => {
  const options={ingress:'cloud-functions'};
  const direct=publicAuthRequestContext(request({forwardedFor:'198.51.100.8'}), options);
  for(const forwardedFor of ['203.0.113.99, 198.51.100.8','unknown, attacker-controlled, 198.51.100.8']) {
    assert.equal(publicAuthRequestContext(request({forwardedFor}), options).ipDigest,direct.ipDigest);
  }
  assert.notEqual(publicAuthRequestContext(request({forwardedFor:'198.51.100.9'}), options).ipDigest,direct.ipDigest);
});

test('direct Functions ingress fails closed for missing or invalid final IP', () => {
  for(const forwardedFor of [undefined,'','198.51.100.8, unknown','198.51.100.8,']) {
    assert.deepEqual(publicAuthRequestContext(request({forwardedFor}), {ingress:'cloud-functions'}), {app});
  }
});
