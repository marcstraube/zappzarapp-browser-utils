/**
 * Intersection Observer Wrapper - Visibility and intersection detection.
 *
 * Features:
 * - Simplified API for common use cases
 * - Automatic cleanup
 * - Lazy loading helpers
 * - Viewport visibility detection
 *
 * **API Pattern:** Stateless utility object with static methods (no instantiation needed).
 * All observer wrappers follow this pattern for consistency.
 *
 * **Recommended Usage:**
 * - Use `observe()` for single element observation (returns cleanup function)
 * - Use `observeAll()` for multiple elements (returns cleanup + observer access)
 * - Use convenience methods like `lazyLoad()`, `onceVisible()` for common patterns
 * - Always call the cleanup function to prevent memory leaks
 *
 * @example
 * ```TypeScript
 * // Basic intersection observation
 * const cleanup = IntersectionObserverWrapper.observe(element, (entry) => {
 *   if (entry.isIntersecting) {
 *     console.log('Element is visible');
 *   }
 * });
 *
 * // Lazy loading images
 * const cleanup = IntersectionObserverWrapper.lazyLoad(
 *   document.querySelectorAll('img[data-src]'),
 *   (img) => {
 *     img.src = img.dataset.src!;
 *   }
 * );
 *
 * // Once visible (auto-disconnects)
 * IntersectionObserverWrapper.onceVisible(element).then(() => {
 *   console.log('Element became visible');
 * });
 * ```
 */
import type { CleanupFn } from '../core/index.js';

export interface IntersectionOptions {
  /**
   * Root element for intersection (default: viewport).
   */
  readonly root?: Element | Document | null;

  /**
   * Margin around root element.
   * @default '0px'
   */
  readonly rootMargin?: string;

  /**
   * Threshold(s) at which to trigger callback.
   * @default 0
   */
  readonly threshold?: number | number[];
}

export interface ObserveResult {
  /**
   * Cleanup function to stop observing.
   */
  readonly cleanup: CleanupFn;

  /**
   * The underlying IntersectionObserver instance.
   * Returns null when IntersectionObserver is not supported.
   */
  readonly observer: IntersectionObserver | null;
}

export const IntersectionObserverWrapper = {
  // =========================================================================
  // Core API
  // =========================================================================

  /**
   * Check if IntersectionObserver is supported.
   */
  isSupported(): boolean {
    return typeof IntersectionObserver !== 'undefined';
  },

  /**
   * Observe a single element for intersection changes.
   * @param element Element to observe
   * @param callback Called when intersection changes
   * @param options Observer options
   * @returns Cleanup function
   */
  observe(
    element: Element,
    callback: (entry: IntersectionObserverEntry, observer: IntersectionObserver | null) => void,
    options?: IntersectionOptions
  ): CleanupFn {
    if (!IntersectionObserverWrapper.isSupported()) {
      // Fallback: assume element is visible
      const entry = IntersectionObserverWrapper.createFallbackEntry(element, true);
      callback(entry, null);
      return () => {};
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          callback(entry, obs);
        }
      },
      {
        root: options?.root,
        rootMargin: options?.rootMargin ?? '0px',
        threshold: options?.threshold ?? 0,
      }
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
      observer.disconnect();
    };
  },

  /**
   * Observe multiple elements with a single observer.
   * @param elements Elements to observe
   * @param callback Called for each intersection change
   * @param options Observer options
   * @returns Object with cleanup function and observer instance
   */
  observeAll(
    elements: Iterable<Element>,
    callback: (entry: IntersectionObserverEntry, observer: IntersectionObserver | null) => void,
    options?: IntersectionOptions
  ): ObserveResult {
    if (!IntersectionObserverWrapper.isSupported()) {
      // Fallback: assume all elements are visible
      for (const element of elements) {
        const entry = IntersectionObserverWrapper.createFallbackEntry(element, true);
        callback(entry, null);
      }
      return {
        cleanup: (): void => {},
        observer: null,
      };
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          callback(entry, obs);
        }
      },
      {
        root: options?.root,
        rootMargin: options?.rootMargin ?? '0px',
        threshold: options?.threshold ?? 0,
      }
    );

    for (const element of elements) {
      observer.observe(element);
    }

    return {
      cleanup: () => observer.disconnect(),
      observer,
    };
  },

  // =========================================================================
  // Convenience Methods
  // =========================================================================

  /**
   * Wait until element becomes visible (resolves once, then disconnects).
   * @param element Element to watch
   * @param options Observer options
   * @returns Promise that resolves when element is visible
   */
  onceVisible(element: Element, options?: IntersectionOptions): Promise<IntersectionObserverEntry> {
    return new Promise((resolve) => {
      if (!IntersectionObserverWrapper.isSupported()) {
        // Fallback: resolve immediately
        resolve(IntersectionObserverWrapper.createFallbackEntry(element, true));
        return;
      }

      const observer = new IntersectionObserver(
        (entries, obs) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              obs.disconnect();
              resolve(entry);
              return;
            }
          }
        },
        {
          root: options?.root,
          rootMargin: options?.rootMargin ?? '0px',
          threshold: options?.threshold ?? 0,
        }
      );

      observer.observe(element);
    });
  },

  /**
   * Lazy load elements when they become visible.
   * Calls the loader function once per element, then unobserves it.
   *
   * @param elements Elements to lazy load
   * @param loader Function to call when element becomes visible
   * @param options Observer options (default: 50px rootMargin for preloading)
   * @returns Cleanup function
   */
  lazyLoad<T extends Element>(
    elements: Iterable<T>,
    loader: (element: T) => void,
    options?: IntersectionOptions
  ): CleanupFn {
    if (!IntersectionObserverWrapper.isSupported()) {
      // Fallback: load all immediately
      for (const element of elements) {
        loader(element);
      }
      return () => {};
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            loader(entry.target as T);
            obs.unobserve(entry.target);
          }
        }
      },
      {
        root: options?.root,
        rootMargin: options?.rootMargin ?? '50px', // Preload slightly before visible
        threshold: options?.threshold ?? 0,
      }
    );

    for (const element of elements) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  },

  /**
   * Track visibility percentage of an element.
   * @param element Element to track
   * @param callback Called with visibility ratio (0-1)
   * @param steps Number of threshold steps (default: 10)
   * @returns Cleanup function
   */
  trackVisibility(
    element: Element,
    callback: (ratio: number, entry: IntersectionObserverEntry) => void,
    steps = 10
  ): CleanupFn {
    const thresholds = Array.from({ length: steps + 1 }, (_, i) => i / steps);

    return IntersectionObserverWrapper.observe(
      element,
      (entry) => {
        callback(entry.intersectionRatio, entry);
      },
      { threshold: thresholds }
    );
  },

  /**
   * Infinite scroll helper - calls callback when sentinel element is visible.
   * @param sentinel Element that triggers loading more content
   * @param loadMore Function to load more content
   * @param options Observer options (default: 100px rootMargin)
   * @returns Cleanup function
   */
  infiniteScroll(
    sentinel: Element,
    loadMore: () => void | Promise<void>,
    options?: IntersectionOptions
  ): CleanupFn {
    let loading = false;

    return IntersectionObserverWrapper.observe(
      sentinel,
      (entry) => {
        if (entry.isIntersecting && !loading) {
          loading = true;
          void Promise.resolve(loadMore()).finally(() => {
            loading = false;
          });
        }
      },
      {
        root: options?.root,
        rootMargin: options?.rootMargin ?? '100px',
        threshold: options?.threshold ?? 0,
      }
    );
  },

  // =========================================================================
  // Internal
  // =========================================================================

  /**
   * Create a fallback entry for browsers without IntersectionObserver support.
   * @internal
   */
  createFallbackEntry(target: Element, isIntersecting: boolean): IntersectionObserverEntry {
    const rect = target.getBoundingClientRect();
    return {
      target,
      isIntersecting,
      intersectionRatio: isIntersecting ? 1 : 0,
      boundingClientRect: rect,
      intersectionRect: isIntersecting ? rect : new DOMRect(),
      rootBounds: null,
      time: performance.now(),
    };
  },
};
