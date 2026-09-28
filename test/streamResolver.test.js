import test from 'node:test';
import assert from 'node:assert/strict';

import { StreamResolver, StreamError } from '../src/streamResolver.js';

test('resolveStream always fetches a fresh token when none cached', async () => {
  let calls = 0;
  const r = new StreamResolver({
    fetchStream: async (id) => {
      calls += 1;
      return { url: `https://cdn/${id}?t=${calls}` };
    },
  });
  const a = await r.resolveStream('ep1');
  assert.equal(a.url, 'https://cdn/ep1?t=1');
  // Second call reuses the in-memory (non-expiring) token.
  const b = await r.resolveStream('ep1');
  assert.equal(b.url, a.url);
  assert.equal(calls, 1);
});

test('expired in-memory token triggers a refetch', async () => {
  let clock = 1000;
  let calls = 0;
  const r = new StreamResolver({
    now: () => clock,
    fetchStream: async (id) => {
      calls += 1;
      return { url: `https://cdn/${id}?t=${calls}`, expiresAt: clock + 100 };
    },
  });
  await r.resolveStream('ep1');
  clock = 2000; // past expiry
  const again = await r.resolveStream('ep1');
  assert.equal(again.url, 'https://cdn/ep1?t=2');
  assert.equal(calls, 2);
});

test('playWithRecovery invalidates and refetches on 401 (Fix C)', async () => {
  let fetches = 0;
  const r = new StreamResolver({
    fetchStream: async (id) => {
      fetches += 1;
      return { url: `https://cdn/${id}?token=${fetches}` };
    },
  });

  let plays = 0;
  const result = await r.playWithRecovery('ep1', async (descriptor) => {
    plays += 1;
    if (plays === 1) {
      // First (stale) token is rejected by the CDN.
      throw new StreamError(401, 'expired token');
    }
    return descriptor.url;
  });

  assert.equal(result, 'https://cdn/ep1?token=2');
  assert.equal(fetches, 2, 'should have fetched a fresh token');
  assert.equal(plays, 2);
});

test('playWithRecovery retries on MEDIA_READ_ERROR', async () => {
  const r = new StreamResolver({ fetchStream: async (id) => ({ url: `https://cdn/${id}` }) });
  let plays = 0;
  const out = await r.playWithRecovery('ep1', async (d) => {
    plays += 1;
    if (plays === 1) throw new StreamError('MEDIA_READ_ERROR');
    return 'ok';
  });
  assert.equal(out, 'ok');
  assert.equal(plays, 2);
});

test('non-retryable errors propagate without retry', async () => {
  const r = new StreamResolver({ fetchStream: async (id) => ({ url: `https://cdn/${id}` }) });
  let plays = 0;
  await assert.rejects(
    () =>
      r.playWithRecovery('ep1', async () => {
        plays += 1;
        throw new StreamError(500, 'server error');
      }),
    /server error/,
  );
  assert.equal(plays, 1);
});

test('gives up after maxRetries', async () => {
  const r = new StreamResolver({
    maxRetries: 2,
    fetchStream: async (id) => ({ url: `https://cdn/${id}` }),
  });
  let plays = 0;
  await assert.rejects(
    () =>
      r.playWithRecovery('ep1', async () => {
        plays += 1;
        throw new StreamError(403);
      }),
    /403/,
  );
  assert.equal(plays, 3); // initial + 2 retries
});
