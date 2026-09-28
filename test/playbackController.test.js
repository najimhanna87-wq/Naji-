import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ProgressCache } from '../src/progressCache.js';
import { StreamResolver, StreamError } from '../src/streamResolver.js';
import { PlaybackController } from '../src/playbackController.js';

async function build() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pbc-'));
  const progressCache = new ProgressCache(dir);
  let fetches = 0;
  const streamResolver = new StreamResolver({
    fetchStream: async (id) => {
      fetches += 1;
      return { url: `https://cdn/${id}?token=${fetches}` };
    },
  });
  const controller = new PlaybackController({ progressCache, streamResolver });
  return { controller, progressCache, streamResolver, getFetches: () => fetches };
}

test('openVideo resumes from saved position with a fresh token', async () => {
  const { controller } = await build();
  await controller.recordPosition('ep3', 860, { durationSeconds: 2600 });

  let played;
  const { resumeAt } = await controller.openVideo('ep3', async (d) => {
    played = d;
    return 'playing';
  });

  assert.equal(resumeAt, 860);
  assert.equal(played.resumeAt, 860);
  assert.equal(played.url, 'https://cdn/ep3?token=1');
});

test('the full crash-recovery scenario self-heals immediately', async () => {
  // Reproduces the report: power loss during playback of ep3.
  const { controller, getFetches } = await build();
  await controller.recordPosition('ep3', 500);

  let plays = 0;
  const { resumeAt } = await controller.openVideo('ep3', async (d) => {
    plays += 1;
    if (plays === 1) {
      // Zombie session rejects the first attempt.
      throw new StreamError(403, 'zombie session lock');
    }
    return d.url;
  });

  // Position preserved, token refetched, playback restored without a
  // 24-48h wait.
  assert.equal(resumeAt, 500);
  assert.equal(plays, 2);
  assert.equal(getFetches(), 2);
});

test('falls back to cloud last-good position when local is missing/corrupt', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pbc-'));
  const progressCache = new ProgressCache(dir);
  const streamResolver = new StreamResolver({
    fetchStream: async (id) => ({ url: `https://cdn/${id}` }),
  });
  const controller = new PlaybackController({
    progressCache,
    streamResolver,
    cloudProgress: async (id) => (id === 'ep3' ? 720 : null),
  });

  const { resumeAt, source } = await controller.openVideo('ep3', async () => 'ok');
  assert.equal(resumeAt, 720);
  assert.equal(source, 'cloud');
});

test('local progress wins over cloud', async () => {
  const { controller } = await build();
  const withCloud = new PlaybackController({
    progressCache: controller.progressCache,
    streamResolver: controller.streamResolver,
    cloudProgress: async () => 999,
  });
  await withCloud.recordPosition('ep3', 120);
  const { resumeAt, source } = await withCloud.openVideo('ep3', async () => 'ok');
  assert.equal(resumeAt, 120);
  assert.equal(source, 'local');
});

test('resetProgress clears that item only', async () => {
  const { controller } = await build();
  await controller.recordPosition('ep3', 300);
  await controller.resetProgress('ep3');
  const { resumeAt, source } = await controller.openVideo('ep3', async () => 'ok');
  assert.equal(resumeAt, 0);
  assert.equal(source, 'start');
});
