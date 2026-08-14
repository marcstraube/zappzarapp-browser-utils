/**
 * History Manager - Browser History API wrapper.
 *
 * Features:
 * - Type-safe history state
 * - URL validation
 * - Event handlers with cleanup
 * - State serialization safety
 *
 * @example
 * ```TypeScript
 * // Push new state
 * HistoryManager.push('/page/2', { page: 2 });
 *
 * // Replace current state
 * HistoryManager.replace('/page/1', { page: 1 });
 *
 * // Listen for navigation
 * const cleanup = HistoryManager.onPopState((state) => {
 *   console.log('Navigated to:', state);
 * });
 *
 * // Navigate
 * HistoryManager.back();
 * HistoryManager.forward();
 *
 * // Clean up
 * cleanup();
 * ```
 */
import { Validator, ValidationError, UrlError, Result } from '../core/index.js';
import type { CleanupFn } from '../core/index.js';

export interface HistoryState {
  [key: string]: unknown;
}

export const HistoryManager = {
  // =========================================================================
  // Navigation
  // =========================================================================

  /**
   * Push a new entry to history.
   * @param url URL to push (validated for safety)
   * @param state Optional state object
   * @throws {ValidationError} If URL uses dangerous protocol
   */
  push(url: string, state?: HistoryState): void {
    Validator.urlSafe(url);
    HistoryManager.validateState(state);

    if (typeof history === 'undefined') {
      throw UrlError.navigationFailed(new Error('History API not available'));
    }

    history.pushState(state ?? null, '', url);
  },

  /**
   * Push with Result (no exceptions).
   */
  pushResult(url: string, state?: HistoryState): Result<void, ValidationError | UrlError> {
    return HistoryManager.executeHistoryAction(url, state, 'push');
  },

  /**
   * Replace current history entry.
   * @param url URL to replace with (validated for safety)
   * @param state Optional state object
   * @throws {ValidationError} If URL uses dangerous protocol
   */
  replace(url: string, state?: HistoryState): void {
    Validator.urlSafe(url);
    HistoryManager.validateState(state);

    if (typeof history === 'undefined') {
      throw UrlError.navigationFailed(new Error('History API not available'));
    }

    history.replaceState(state ?? null, '', url);
  },

  /**
   * Replace with Result (no exceptions).
   */
  replaceResult(url: string, state?: HistoryState): Result<void, ValidationError | UrlError> {
    return HistoryManager.executeHistoryAction(url, state, 'replace');
  },

  /**
   * Go back one entry.
   */
  back(): void {
    if (typeof history !== 'undefined') {
      history.back();
    }
  },

  /**
   * Go forward one entry.
   */
  forward(): void {
    if (typeof history !== 'undefined') {
      history.forward();
    }
  },

  /**
   * Go to a specific entry relative to current.
   * @param delta Negative for back, positive for forward
   */
  go(delta: number): void {
    if (typeof history !== 'undefined') {
      history.go(delta);
    }
  },

  // =========================================================================
  // State Access
  // =========================================================================

  /**
   * Get current history state.
   */
  currentState<T extends HistoryState = HistoryState>(): T | null {
    if (typeof history === 'undefined') {
      return null;
    }
    return history.state as T | null;
  },

  /**
   * Get history length.
   */
  length(): number {
    if (typeof history === 'undefined') {
      return 0;
    }
    return history.length;
  },

  /**
   * Get scroll restoration mode.
   */
  scrollRestoration(): ScrollRestoration | null {
    if (typeof history === 'undefined') {
      return null;
    }
    return history.scrollRestoration;
  },

  /**
   * Set scroll restoration mode.
   */
  setScrollRestoration(mode: ScrollRestoration): void {
    if (typeof history !== 'undefined') {
      history.scrollRestoration = mode;
    }
  },

  // =========================================================================
  // Event Handlers
  // =========================================================================

  /**
   * Listen for popstate events (browser back/forward).
   * @returns Cleanup function to remove listener
   */
  onPopState<T extends HistoryState = HistoryState>(
    handler: (state: T | null, event: PopStateEvent) => void
  ): CleanupFn {
    if (typeof window === 'undefined') {
      return () => {};
    }

    const listener = (event: PopStateEvent): void => {
      handler(event.state as T | null, event);
    };

    window.addEventListener('popstate', listener);

    return () => {
      window.removeEventListener('popstate', listener);
    };
  },

  /**
   * Listen for hashchange events.
   * @returns Cleanup function to remove listener
   */
  onHashChange(
    handler: (newHash: string, oldHash: string, event: HashChangeEvent) => void
  ): CleanupFn {
    if (typeof window === 'undefined') {
      return () => {};
    }

    const listener = (event: HashChangeEvent): void => {
      const newHash = new URL(event.newURL).hash;
      const oldHash = new URL(event.oldURL).hash;
      handler(newHash, oldHash, event);
    };

    window.addEventListener('hashchange', listener);

    return () => {
      window.removeEventListener('hashchange', listener);
    };
  },

  // =========================================================================
  // Utilities
  // =========================================================================

  /**
   * Check if History API is available.
   */
  isSupported(): boolean {
    return typeof history !== 'undefined' && typeof history.pushState === 'function';
  },

  /**
   * Execute a history action with Result pattern.
   * @internal
   */
  executeHistoryAction(
    url: string,
    state: HistoryState | undefined,
    action: 'push' | 'replace'
  ): Result<void, ValidationError | UrlError> {
    const urlResult = Validator.urlSafeResult(url);
    if (Result.isErr(urlResult)) {
      return urlResult;
    }

    try {
      HistoryManager.validateState(state);
    } catch (e) {
      if (e instanceof UrlError) {
        return Result.err(e);
      }
      return Result.err(UrlError.invalidState((e as Error).message));
    }

    if (typeof history === 'undefined') {
      return Result.err(UrlError.navigationFailed(new Error('History API not available')));
    }

    try {
      if (action === 'push') {
        history.pushState(state ?? null, '', url);
      } else {
        history.replaceState(state ?? null, '', url);
      }
      return Result.ok(undefined);
    } catch (e) {
      return Result.err(UrlError.navigationFailed(e));
    }
  },

  /**
   * Validate state object is serializable.
   * @throws {Error} If state contains non-serializable values
   * @internal
   */
  validateState(state: unknown): void {
    if (state === undefined || state === null) {
      return;
    }

    try {
      // Attempt to serialize to check for circular references
      JSON.stringify(state);
    } catch {
      throw UrlError.invalidState(
        'State object is not serializable (may contain circular references)'
      );
    }
  },
};
