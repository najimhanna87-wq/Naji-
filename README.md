# Naji- — VOD Playback Sync

Reference implementation of the non-breaking fixes for the **VOD Stream Lock
& Cache Desync** issue: episodes/movies becoming unplayable for 24–48h after a
power loss during playback.

## The problem (recap)

A mid-stream power loss persisted an invalid/incomplete stream token or signed
CDN URL into the cache. On reopen, the app reused that saved (now invalid) host
link instead of requesting a fresh token, so the item stayed locked until the
CDN TTL expired (24–48h) and forced a clean fetch. Only the active item was
affected because progress/session data is keyed per content item.

## The fixes

Each recommended solution from the report maps to code here:

| Report fix | Where |
|---|---|
| **A. Separate progress cache from stream tokens** — cache `videoId` + position only; always fetch the stream URL dynamically | `src/progressCache.js` (rejects any token/URL field) + `src/streamResolver.js` (tokens live in memory only) |
| **B. Atomic cache writes** — temp-write → rename to avoid partial-write corruption | `src/progressCache.js` (`saveProgress`: unique temp file, `fsync`, atomic `rename`; per-item files isolate corruption; corrupt reads self-clean) |
| **C. Fallback on stream error (auto-invalidation)** — on 401/403/read error, invalidate the token for that item and refetch immediately | `src/streamResolver.js` (`playWithRecovery`) |

`src/playbackController.js` wires them into the load flow:

1. Read **only** the saved playhead position from the cache.
2. Resolve a **fresh** stream token (never reuse a saved one).
3. Play with auto-invalidation + refetch on 401 / 403 / media read error.
4. Persist position periodically (position only, written atomically).

## Usage

```js
import { ProgressCache, StreamResolver, PlaybackController } from './src/index.js';

const progressCache = new ProgressCache('/var/lib/app/progress');
const streamResolver = new StreamResolver({
  // Your call to the host/backend for a fresh signed URL.
  fetchStream: (videoId) => api.getSignedStream(videoId),
});
const controller = new PlaybackController({ progressCache, streamResolver });

// On open: resumes from saved position with a fresh token, auto-recovering
// from a stale/zombie token.
await controller.openVideo('episode-3', async ({ url, resumeAt }) => {
  player.load(url);
  player.seek(resumeAt);
  return player.play(); // reject with a StreamError(401/403/'MEDIA_READ_ERROR') on failure
});

// On the 5–10s auto-save timer / on pause:
await controller.recordPosition('episode-3', player.currentTime, {
  durationSeconds: player.duration,
});
```

## Tests

```
npm test   # node --test
```

Covers token/progress separation, refusal to persist tokens, atomic writes,
per-item corruption isolation, expiry-driven refetch, and the full
crash-recovery scenario (zombie 403 → auto-invalidate → fresh token → resume).
