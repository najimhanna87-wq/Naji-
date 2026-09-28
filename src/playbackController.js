// playbackController.js
//
// Wires the two fixes together into the flow the report describes:
//
//   openVideo(videoId):
//     1. Read ONLY the saved playhead position from the progress cache.
//     2. Resolve a FRESH stream token (never reuse a saved one).
//     3. Play with auto-invalidation on 401/403/read errors.
//     4. Periodically persist position (position only, atomically).
//
// This removes the "reuse saved invalid host link" step that caused the
// 24-48h lock, while keeping resume-from-position working.

import { StreamResolver } from './streamResolver.js';

export class PlaybackController {
  /**
   * @param {object} opts
   * @param {import('./progressCache.js').ProgressCache} opts.progressCache
   * @param {StreamResolver} opts.streamResolver
   * @param {number} [opts.saveIntervalMs=5000] Progress auto-save cadence.
   */
  constructor({ progressCache, streamResolver, cloudProgress, saveIntervalMs = 5000 }) {
    if (!progressCache) throw new Error('progressCache is required');
    if (!(streamResolver instanceof StreamResolver)) {
      throw new Error('streamResolver must be a StreamResolver');
    }
    if (cloudProgress && typeof cloudProgress !== 'function') {
      throw new Error('cloudProgress must be a function (videoId) => Promise<number|null>');
    }
    this.progressCache = progressCache;
    this.streamResolver = streamResolver;
    // Optional: fetch the last known-good position from the cloud. Used only
    // as a fallback when local progress is missing or was dropped as corrupt.
    this.cloudProgress = cloudProgress || null;
    this.saveIntervalMs = saveIntervalMs;
  }

  /**
   * Prepare an item for playback.
   * @param {string} videoId
   * @param {(descriptor: {url: string}) => Promise<any>} play Player hook.
   * @returns {Promise<{resumeAt: number, source: string, result: any}>}
   */
  async openVideo(videoId, play) {
    // 1. Position only. Never a token. A corrupt local entry returns null
    //    (it self-cleans), so we fall back to the cloud last-good point
    //    rather than losing the user's place entirely.
    let resumeAt = 0;
    let source = 'start';
    const saved = await this.progressCache.getProgress(videoId);
    if (saved) {
      resumeAt = saved.positionSeconds;
      source = 'local';
    } else if (this.cloudProgress) {
      try {
        const cloudPos = await this.cloudProgress(videoId);
        if (Number.isFinite(cloudPos) && cloudPos >= 0) {
          resumeAt = cloudPos;
          source = 'cloud';
        }
      } catch {
        // Cloud unavailable — resume from start rather than failing the open.
      }
    }

    // 2 + 3. Fresh token, with auto-invalidation retry.
    const result = await this.streamResolver.playWithRecovery(videoId, (descriptor) =>
      play({ ...descriptor, resumeAt }),
    );

    return { resumeAt, source, result };
  }

  /**
   * User-facing "reset progress for this episode only" action.
   * @param {string} videoId
   */
  async resetProgress(videoId) {
    return this.progressCache.resetProgress(videoId);
  }

  /**
   * Persist the current playhead. Call this on the auto-save timer and on
   * pause/close. Stores position only, atomically.
   * @param {string} videoId
   * @param {number} positionSeconds
   * @param {object} [extra] Optional { durationSeconds }.
   */
  async recordPosition(videoId, positionSeconds, extra) {
    return this.progressCache.saveProgress(videoId, positionSeconds, extra);
  }
}

export default PlaybackController;
