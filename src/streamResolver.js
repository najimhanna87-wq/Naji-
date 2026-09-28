// streamResolver.js
//
// Fix A + Fix C from the VOD Stream Lock & Cache Desync report.
//
// The stream URL / signed token is ALWAYS fetched fresh at load time and
// held only in memory (never written to the progress cache). This is what
// breaks the "reuse the saved, invalid host link" behavior that leaves an
// item locked for 24-48h.
//
// Fix C (Fallback Handling / Auto-Invalidation): if a resolved stream fails
// with 401 / 403 or a media read error, the cached-in-memory token for that
// specific videoId is invalidated and a fresh one is fetched immediately,
// instead of blocking the stream until the CDN TTL expires.

// Error codes we treat as "stale/invalid token" — safe to invalidate and retry.
export const RETRYABLE_STREAM_ERRORS = new Set([401, 403]);

/** Thrown by the fetcher (or player) to signal a stream failure. */
export class StreamError extends Error {
  /**
   * @param {number|string} code HTTP status (401/403/...) or 'MEDIA_READ_ERROR'.
   * @param {string} [message]
   */
  constructor(code, message) {
    super(message || `Stream failed with ${code}`);
    this.name = 'StreamError';
    this.code = code;
  }
}

function isRetryable(code) {
  return code === 'MEDIA_READ_ERROR' || RETRYABLE_STREAM_ERRORS.has(code);
}

export class StreamResolver {
  /**
   * @param {object} opts
   * @param {(videoId: string) => Promise<{url: string, expiresAt?: number}>} opts.fetchStream
   *   Requests a fresh signed stream descriptor from the host/backend.
   * @param {number} [opts.maxRetries=1] How many auto-invalidate + refetch
   *   attempts to make on a retryable error.
   * @param {() => number} [opts.now] Clock injection for testing.
   */
  constructor({ fetchStream, maxRetries = 1, now = Date.now } = {}) {
    if (typeof fetchStream !== 'function') {
      throw new Error('StreamResolver requires a fetchStream(videoId) function');
    }
    this.fetchStream = fetchStream;
    this.maxRetries = maxRetries;
    this.now = now;
    // In-memory only. Nothing here is ever handed to the progress cache.
    this._live = new Map(); // videoId -> { url, expiresAt }
  }

  /** Drop the in-memory token for one item so the next resolve refetches. */
  invalidate(videoId) {
    this._live.delete(videoId);
  }

  /** Drop all in-memory tokens. */
  invalidateAll() {
    this._live.clear();
  }

  /**
   * Resolve a playable stream descriptor for an item. Always returns a fresh
   * token when none is cached in memory or the cached one has expired.
   * @param {string} videoId
   * @param {object} [opts]
   * @param {boolean} [opts.forceFresh=false] Ignore any in-memory token.
   */
  async resolveStream(videoId, { forceFresh = false } = {}) {
    if (!forceFresh) {
      const cached = this._live.get(videoId);
      if (cached && (cached.expiresAt === undefined || cached.expiresAt > this.now())) {
        return cached;
      }
      // Expired — drop it before refetching.
      if (cached) this._live.delete(videoId);
    }

    const descriptor = await this.fetchStream(videoId);
    if (!descriptor || typeof descriptor.url !== 'string') {
      throw new StreamError('RESOLVE_FAILED', `fetchStream returned no url for ${videoId}`);
    }
    this._live.set(videoId, descriptor);
    return descriptor;
  }

  /**
   * Resolve and play with auto-invalidation. `play` receives the stream
   * descriptor and should reject with a StreamError (or an object carrying a
   * numeric/`MEDIA_READ_ERROR` `code`) on failure. On a retryable failure the
   * token is invalidated and a fresh one is fetched before retrying.
   *
   * @param {string} videoId
   * @param {(descriptor: {url: string}) => Promise<any>} play
   */
  async playWithRecovery(videoId, play) {
    let attempt = 0;
    // First attempt may reuse an in-memory token; retries force a fresh one.
    let forceFresh = false;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const descriptor = await this.resolveStream(videoId, { forceFresh });
      try {
        return await play(descriptor);
      } catch (err) {
        const code = err && err.code;
        if (isRetryable(code) && attempt < this.maxRetries) {
          // Fix C: the saved/live token for THIS item is invalid. Clear it
          // and refetch instead of blocking on the zombie session's TTL.
          this.invalidate(videoId);
          attempt += 1;
          forceFresh = true;
          continue;
        }
        throw err;
      }
    }
  }
}

export default StreamResolver;
