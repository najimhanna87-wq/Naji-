/**
 * Central guard against opening multiple player instances when a user
 * presses the same (or a different) item repeatedly in quick
 * succession — most noticeable on TV remotes, where a fast double/triple
 * press on OK is easy to do by accident. Without this, each press could
 * trigger its own `router.push('/player', ...)` before the first
 * navigation finishes, stacking several player screens on top of each
 * other.
 *
 * Usage: call `openPlayerOnce(() => router.push({ pathname: '/player', ... }))`
 * instead of calling router.push directly. The lock releases automatically
 * after a short cooldown, or immediately when the player screen itself
 * unmounts (call `releasePlayerLock()` from player.tsx's cleanup).
 */

let isNavigatingToPlayer = false;
let releaseTimeoutId: ReturnType<typeof setTimeout> | null = null;

const LOCK_COOLDOWN_MS = 1200;

export function openPlayerOnce(navigate: () => void) {
  if (isNavigatingToPlayer) return;
  isNavigatingToPlayer = true;
  navigate();

  // Safety-net release in case the player screen's own cleanup doesn't
  // fire for some reason (e.g. navigation was cancelled or failed) —
  // never leave the app permanently unable to open the player again.
  if (releaseTimeoutId) clearTimeout(releaseTimeoutId);
  releaseTimeoutId = setTimeout(() => {
    isNavigatingToPlayer = false;
  }, LOCK_COOLDOWN_MS);
}

export function releasePlayerLock() {
  isNavigatingToPlayer = false;
  if (releaseTimeoutId) {
    clearTimeout(releaseTimeoutId);
    releaseTimeoutId = null;
  }
}
