/**
 * ReducedMotion - Reduced motion preference detection.
 *
 * Detects and monitors the user's prefers-reduced-motion media query.
 * Allows applications to respect accessibility motion preferences.
 *
 * @example
 * ```TypeScript
 * // Check current preference
 * if (ReducedMotion.isReduced()) {
 *   // Use simple transitions or no animation
 * }
 *
 * // Listen for changes
 * const cleanup = ReducedMotion.onChange((reduced) => {
 *   console.log('Reduced motion:', reduced);
 * });
 *
 * // Cleanup when done
 * cleanup();
 * ```
 */
import type { CleanupFn } from '../core/index.js';

const MEDIA_QUERY = '(prefers-reduced-motion: reduce)';

// noinspection JSUnusedGlobalSymbols
export const ReducedMotion = {
  /**
   * Check if the user prefers reduced motion.
   *
   * @returns True if prefers-reduced-motion is set to 'reduce'
   */
  isReduced(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(MEDIA_QUERY).matches;
  },

  /**
   * Listen for changes to the reduced motion preference.
   *
   * @param handler - Function called with the new preference (true = reduced)
   * @returns Cleanup function to remove the listener
   */
  onChange(handler: (reduced: boolean) => void): CleanupFn {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return () => {};
    }

    const mql = window.matchMedia(MEDIA_QUERY);
    const listener = (event: MediaQueryListEvent): void => {
      handler(event.matches);
    };

    mql.addEventListener('change', listener);

    return () => {
      mql.removeEventListener('change', listener);
    };
  },
};
