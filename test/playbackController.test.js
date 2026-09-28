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
