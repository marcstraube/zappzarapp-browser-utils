/**
 * VisibilityManager - Page Visibility API wrapper.
 *
 * Features:
 * - Check document visibility state
 * - Listen for visibility changes
 * - Convenient handlers for visible/hidden states
 * - Automatic cleanup with CleanupFn
 *
 * @example
 * ```TypeScript
 * // Check current state
 * if (VisibilityManager.isVisible()) {
 *   console.log('Page is visible');
 * }
 *
 * // Listen for changes
 * const cleanup = VisibilityManager.onChange((state) => {
 *   console.log('Visibility changed to:', state);
 * });
 *
 * // Listen for specific states
 * const cleanupVisible = VisibilityManager.onVisible(() => {
 *   console.log('Page became visible');
 * });
 *
 * const cleanupHidden = VisibilityManager.onHidden(() => {
 *   console.log('Page became hidden');
 * });
 *
 * // Cleanup when done
 * cleanup();
 * cleanupVisible();
 * cleanupHidden();
 * ```
 */
import type { CleanupFn } from '../core/index.js';

export const VisibilityManager = {
  // =========================================================================
  // State
  // =========================================================================

  /**
   * Check if the document is currently visible.
   * @returns True if the document visibility state is 'visible'
   */
  isVisible(): boolean {
    if (typeof document === 'undefined') {
      return false;
    }
    return document.visibilityState === 'visible';
  },

  /**
   * Check if the document is currently hidden.
   * @returns True if the document visibility state is 'hidden'
   */
  isHidden(): boolean {
    if (typeof document === 'undefined') {
      return true;
    }
    return document.visibilityState === 'hidden';
  },

  /**
   * Get the current document visibility state.
   * @returns The current visibility state ('visible' or 'hidden')
   */
  getState(): DocumentVisibilityState {
    if (typeof document === 'undefined') {
      return 'hidden';
    }
    return document.visibilityState;
  },

  // =========================================================================
  // Events
  // =========================================================================

  /**
   * Listen for visibility state changes.
   * @param handler - Function called with the new visibility state
   * @returns Cleanup function to remove the listener
   */
  onChange(handler: (state: DocumentVisibilityState) => void): CleanupFn {
    if (typeof document === 'undefined') {
      return () => {};
    }

    const eventHandler = (): void => {
      handler(document.visibilityState);
    };

    document.addEventListener('visibilitychange', eventHandler);

    return () => {
      document.removeEventListener('visibilitychange', eventHandler);
    };
  },

  /**
   * Listen for when the document becomes visible.
   * @param handler - Function called when the document becomes visible
   * @returns Cleanup function to remove the listener
   */
  onVisible(handler: () => void): CleanupFn {
    if (typeof document === 'undefined') {
      return () => {};
    }

    const eventHandler = (): void => {
      if (document.visibilityState === 'visible') {
        handler();
      }
    };

    document.addEventListener('visibilitychange', eventHandler);

    return () => {
      document.removeEventListener('visibilitychange', eventHandler);
    };
  },

  /**
   * Listen for when the document becomes hidden.
   * @param handler - Function called when the document becomes hidden
   * @returns Cleanup function to remove the listener
   */
  onHidden(handler: () => void): CleanupFn {
    if (typeof document === 'undefined') {
      return () => {};
    }

    const eventHandler = (): void => {
      if (document.visibilityState === 'hidden') {
        handler();
      }
    };

    document.addEventListener('visibilitychange', eventHandler);

    return () => {
      document.removeEventListener('visibilitychange', eventHandler);
    };
  },
};
