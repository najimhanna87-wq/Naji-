// progressCache.js
//
// Fix A (partial) + Fix B from the VOD Stream Lock & Cache Desync report.
//
// Stores ONLY playback progress: { videoId, positionSeconds, updatedAt }.
// It deliberately does NOT store stream URLs, host session IDs, or signed
// tokens. Those are volatile and, if persisted mid-crash, produce the
// "zombie session" desync described in the report.
//
// Corruption resistance (Fix B — Atomic Cache Writes):
//   * Each content item is written to its own file, so a partial write to
//     one episode can never corrupt the rest of the library.
//   * Writes go to a temp file, are flushed to disk, then atomically renamed
//     over the target. A power loss leaves either the old file or the new
//     file intact — never a half-written one.
//   * Reads that hit a corrupt/partial file (e.g. a temp file that survived
//     a crash) drop that single entry instead of throwing, so the rest of
//     the library keeps working.

import fs from 'node:fs/promises';
import path from 'node:path';

// Fields we are willing to persist. Anything else (tokens, URLs, session
// ids) is stripped on write so a caller can never accidentally cache it.
const ALLOWED_FIELDS = ['videoId', 'positionSeconds', 'durationSeconds', 'updatedAt'];

// Fields that must NEVER be persisted. Presence of any of these is a bug in
// the caller; we throw so it is caught in development rather than silently
// writing a token to disk.
const FORBIDDEN_FIELDS = ['streamUrl', 'token', 'signedUrl', 'sessionId', 'hostSession'];

export class ProgressCache {
  /**
   * @param {string} dir Directory that holds one JSON file per content item.
   */
  constructor(dir) {
    if (!dir) throw new Error('ProgressCache requires a directory path');
    this.dir = dir;
  }

  /** Sanitize a videoId into a safe, flat filename. */
  #fileFor(videoId) {
    if (typeof videoId !== 'string' || videoId.length === 0) {
      throw new Error('videoId must be a non-empty string');
    }
    const safe = videoId.replace(/[^a-zA-Z0-9_.-]/g, '_');
    return path.join(this.dir, `${safe}.json`);
  }

  async #ensureDir() {
    await fs.mkdir(this.dir, { recursive: true });
  }

  /**
   * Persist playback progress for a single item atomically.
   * @param {string} videoId
   * @param {number} positionSeconds Current playhead position.
   * @param {object} [extra] Optional { durationSeconds }.
   */
  async saveProgress(videoId, positionSeconds, extra = {}) {
    for (const field of FORBIDDEN_FIELDS) {
      if (field in extra) {
        throw new Error(
          `Refusing to cache "${field}": stream tokens/URLs must never be persisted (see Fix A).`,
        );
      }
    }
    if (!Number.isFinite(positionSeconds) || positionSeconds < 0) {
      throw new Error('positionSeconds must be a non-negative number');
    }

    const record = {};
    const source = { videoId, positionSeconds, updatedAt: Date.now(), ...extra };
    for (const key of ALLOWED_FIELDS) {
      if (source[key] !== undefined) record[key] = source[key];
    }

    await this.#ensureDir();
    const target = this.#fileFor(videoId);
    // Unique temp name so concurrent saves for different items never collide.
    const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const payload = JSON.stringify(record);
    let handle;
    try {
      handle = await fs.open(tmp, 'w');
      await handle.writeFile(payload, 'utf8');
      // Flush data to physical storage before the rename so the atomic swap
      // can never expose an empty/partial file after a power loss.
      await handle.sync();
    } finally {
      if (handle) await handle.close();
    }

    // Atomic on POSIX: the target is either the old file or the fully
    // written new one, never a mix.
    await fs.rename(tmp, target);
    return record;
  }

  /**
   * Read progress for a single item. Returns null if there is no valid
   * saved progress. A corrupt/partial file is treated as "no progress"
   * (and cleaned up) rather than crashing the whole library.
   * @param {string} videoId
   */
  async getProgress(videoId) {
    const target = this.#fileFor(videoId);
    let raw;
    try {
      raw = await fs.readFile(target, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }

    try {
      const record = JSON.parse(raw);
      if (
        record &&
        typeof record === 'object' &&
        typeof record.videoId === 'string' &&
        Number.isFinite(record.positionSeconds)
      ) {
        return record;
      }
      // Parsed but not a valid progress record — treat as corrupt.
      throw new Error('invalid progress record shape');
    } catch {
      // Corrupt or partially written file. Drop just this entry so the
      // rest of the library is unaffected, then report "no progress".
      await fs.rm(target, { force: true });
      return null;
    }
  }

  /** Remove saved progress for a single item (e.g. finished watching). */
  async clearProgress(videoId) {
    await fs.rm(this.#fileFor(videoId), { force: true });
  }
}

export default ProgressCache;
