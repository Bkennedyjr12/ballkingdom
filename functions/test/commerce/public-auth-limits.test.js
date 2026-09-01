import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicAuthLimiter} from '../../src/commerce/public-auth-limits.js';

function memoryLimits(initial = {}) {
  const calls = [];
  const counts = {
    email:initial.emailCount ?? 0,
    ip:initial.ipCount ?? 0,
    app:initial.appCount ?? 0,
    global:initial.globalCount ?? 0,
  };
  return {
    calls,
    async consumePublicAuthLimits(input) {
      calls.push(structuredClone(input));
      if (counts.email >= input.emailLimit || counts.ip >= input.ipLimit
        || counts.app >= input.appLimit || counts.global >= input.globalLimit) return false;
      counts.email += 1;
      counts.ip += 1;
      counts.app += 1;
      counts.global += 1;
      return true;
    },
  };
}

test('allows bounded distinct public recipients without an allowlist', async () => {
  const repository = memoryLimits();
  const limiter = createPublicAuthLimiter({repository,clock:() => new Date(0)});

  assert.equal(await limiter.consume({
    emailDigest:'a'.repeat(64),ipDigest:'b'.repeat(64),appId:'web',
  }), true);
  assert.equal(await limiter.consume({
    emailDigest:'c'.repeat(64),ipDigest:'b'.repeat(64),appId:'web',
  }), true);
  assert.deepEqual(repository.calls[0], {
    emailDigest:'a'.repeat(64),ipDigest:'b'.repeat(64),appId:'web',now:new Date(0),
    windowMs:600000,emailLimit:5,ipLimit:20,appLimit:100,globalLimit:250,
  });
});

test('fails closed on email, IP, device, or global send-volume exhaustion', async () => {
  for (const initial of [
    {emailCount:5},{ipCount:20},{appCount:100},{globalCount:250},
  ]) {
    const limiter = createPublicAuthLimiter({repository:memoryLimits(initial),clock:() => new Date(0)});
    assert.equal(await limiter.consume({
      emailDigest:'a'.repeat(64),ipDigest:'b'.repeat(64),appId:'web',
    }), false);
  }
});

test('requires the transactional public-auth limit repository', () => {
  assert.throws(() => createPublicAuthLimiter(), /Public auth limiter repository is required/);
});
