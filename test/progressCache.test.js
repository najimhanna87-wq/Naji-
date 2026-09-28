import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ProgressCache } from '../src/progressCache.js';

async function tmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'progcache-'));
}

test('saves and restores position only', async () => {
  const cache = new ProgressCache(await tmpDir());
  await cache.saveProgress('ep3', 860.5, { durationSeconds: 2600 });
  const got = await cache.getProgress('ep3');
  assert.equal(got.videoId, 'ep3');
  assert.equal(got.positionSeconds, 860.5);
  assert.equal(got.durationSeconds, 2600);
  assert.ok(got.updatedAt > 0);
});

test('refuses to persist stream tokens / urls (Fix A)', async () => {
  const cache = new ProgressCache(await tmpDir());
  await assert.rejects(
    () => cache.saveProgress('ep3', 10, { token: 'abc' }),
    /must never be persisted/,
  );
  await assert.rejects(
    () => cache.saveProgress('ep3', 10, { streamUrl: 'https://cdn/x' }),
    /must never be persisted/,
  );
});

test('getProgress returns null for unknown item', async () => {
  const cache = new ProgressCache(await tmpDir());
  assert.equal(await cache.getProgress('nope'), null);
});

test('corrupt/partial file affects only that item, not the library (Fix B)', async () => {
  const dir = await tmpDir();
  const cache = new ProgressCache(dir);
  await cache.saveProgress('ep1', 100);
  await cache.saveProgress('ep2', 200);

  // Simulate a mid-write power loss leaving a half-written file for ep2.
  await fs.writeFile(path.join(dir, 'ep2.json'), '{ "videoId": "ep2", "positio');

  // ep2 is treated as "no progress" and cleaned up; ep1 is untouched.
  assert.equal(await cache.getProgress('ep2'), null);
  const ep1 = await cache.getProgress('ep1');
  assert.equal(ep1.positionSeconds, 100);
  // Corrupt file was removed.
  await assert.rejects(() => fs.access(path.join(dir, 'ep2.json')));
});

test('writes are atomic — no leftover temp files after save', async () => {
  const dir = await tmpDir();
  const cache = new ProgressCache(dir);
  await cache.saveProgress('ep1', 42);
  const files = await fs.readdir(dir);
  assert.deepEqual(files, ['ep1.json']);
});

test('rejects negative or non-finite positions', async () => {
  const cache = new ProgressCache(await tmpDir());
  await assert.rejects(() => cache.saveProgress('x', -5));
  await assert.rejects(() => cache.saveProgress('x', NaN));
});

test('rejects a future/poisoned timestamp so daily sync is not fooled', async () => {
  const dir = await tmpDir();
  const cache = new ProgressCache(dir);
  // Simulate a power-loss write that persisted a far-future updatedAt.
  await fs.writeFile(
    path.join(dir, 'ep9.json'),
    JSON.stringify({ videoId: 'ep9', positionSeconds: 42, updatedAt: Date.now() + 10 * 864e5 }),
  );
  // Treated as corrupt: dropped, so a clean fetch is forced (self-heal).
  assert.equal(await cache.getProgress('ep9'), null);
  await assert.rejects(() => fs.access(path.join(dir, 'ep9.json')));
});

test('rejects a non-numeric timestamp', async () => {
  const dir = await tmpDir();
  const cache = new ProgressCache(dir);
  await fs.writeFile(
    path.join(dir, 'ep9.json'),
    JSON.stringify({ videoId: 'ep9', positionSeconds: 42, updatedAt: 'soon' }),
  );
  assert.equal(await cache.getProgress('ep9'), null);
});

test('accepts a small clock skew into the future', async () => {
  const cache = new ProgressCache(await tmpDir());
  const rec = await cache.saveProgress('ep1', 10);
  // Saved with a real Date.now(); read back fine.
  const got = await cache.getProgress('ep1');
  assert.equal(got.positionSeconds, 10);
  assert.ok(got.updatedAt <= Date.now() + 5 * 60 * 1000);
  assert.equal(rec.videoId, 'ep1');
});

test('isFresh reflects TTL and resetProgress clears one item', async () => {
  let clock = 1_000_000;
  const cache = new ProgressCache(await tmpDir(), { now: () => clock });
  await cache.saveProgress('ep1', 10);
  const rec = await cache.getProgress('ep1');
  assert.equal(cache.isFresh(rec, 1000), true);
  clock += 5000;
  assert.equal(cache.isFresh(rec, 1000), false);

  await cache.resetProgress('ep1');
  assert.equal(await cache.getProgress('ep1'), null);
});

test('sanitizes videoId into a safe filename', async () => {
  const dir = await tmpDir();
  const cache = new ProgressCache(dir);
  await cache.saveProgress('../../etc/passwd', 5);
  const files = await fs.readdir(dir);
  assert.equal(files.length, 1);
  assert.ok(!files[0].includes('/'));
});
