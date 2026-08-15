/**
 * WakeLock - Screen Wake Lock API wrapper.
 *
 * Prevents the screen from dimming or locking during video playback,
 * presentations, or other long-running foreground tasks.
 *
 * Features:
 * - Promise-based API with Result type
 * - Automatic re-acquisition after the page returns to the foreground
 *   (the browser silently releases the lock whenever the document is hidden)
 * - Handle with `release()` cleanup and an `active` state flag
 * - `isSupported()` capability check
 *
 * @example
 * ```TypeScript
 * const result = await WakeLock.request();
 * if (Result.isOk(result)) {
 *   const lock = result.value;
 *   // ... later, when the lock is no longer needed:
 *   await lock.release();
 * }
 * ```
 */
import { Result, WakeLockError } from '../core/index.js';

/**
 * Options for {@link WakeLock.request}.
 */
export interface WakeLockOptions {
  /**
   * Re-acquire the wake lock automatically when the document becomes visible
   * again. The browser always releases a screen wake lock while the page is
   * hidden, so this keeps the lock effective across tab switches.
   *
   * Defaults to `true`.
   */
  readonly reacquireOnVisible?: boolean;
}

/**
 * A handle to an acquired screen wake lock.
 */
export interface WakeLockHandle {
  /**
   * Release the wake lock and stop automatic re-acquisition.
   * Safe to call multiple times; best-effort (never rejects).
   */
  release(): Promise<void>;

  /**
   * Whether the underlying wake lock is currently held.
   */
  readonly active: boolean;
}

/**
 * Release a sentinel without surfacing failures. A failed release still leaves
 * the lock for the browser to reclaim, so there is nothing the caller can do.
 */
async function safeRelease(sentinel: WakeLockSentinel): Promise<void> {
  try {
    await sentinel.release();
  } catch {
    // Best-effort cleanup.
  }
}

export const WakeLock = {
  /**
   * Check whether the Screen Wake Lock API is supported.
   */
  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  },

  /**
   * Request a screen wake lock.
   *
   * On success, returns a {@link WakeLockHandle}. By default the lock is
   * re-acquired automatically whenever the page returns to the foreground.
   */
  async request(options?: WakeLockOptions): Promise<Result<WakeLockHandle, WakeLockError>> {
    if (!WakeLock.isSupported()) {
      return Result.err(WakeLockError.notSupported());
    }

    let sentinel: WakeLockSentinel;
    try {
      sentinel = await navigator.wakeLock.request('screen');
    } catch (e) {
      return Result.err(WakeLockError.requestFailed(e));
    }

    const reacquireOnVisible = options?.reacquireOnVisible ?? true;
    const canObserveVisibility = reacquireOnVisible && typeof document !== 'undefined';
    let manuallyReleased = false;

    const reacquire = async (): Promise<void> => {
      try {
        const next = await navigator.wakeLock.request('screen');
        if (manuallyReleased) {
          // Released while the request was in flight — discard the new lock.
          await safeRelease(next);
        } else {
          sentinel = next;
        }
      } catch {
        // Re-acquisition is best-effort: on failure the lock simply stays
        // unheld until the next visibility change.
      }
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible' && sentinel.released) {
        void reacquire();
      }
    };

    if (canObserveVisibility) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return Result.ok({
      get active(): boolean {
        return !sentinel.released;
      },

      async release(): Promise<void> {
        manuallyReleased = true;

        if (canObserveVisibility) {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        }

        if (!sentinel.released) {
          await safeRelease(sentinel);
        }
      },
    });
  },
};
