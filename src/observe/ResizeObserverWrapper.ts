/**
 * Resize Observer Wrapper - Element size change detection.
 *
 * Features:
 * - Simplified API with automatic cleanup
 * - Debounced callbacks option
 * - Size breakpoint detection
 * - Content and border box support
 *
 * **API Pattern:** Stateless utility object with static methods (no instantiation needed).
 * All observer wrappers follow this pattern for consistency.
 *
 * **Recommended Usage:**
 * - Use `observe()` for single element observation (returns cleanup function)
 * - Use `observeAll()` for multiple elements (returns cleanup + observer access)
 * - Use `debounce` option for performance-sensitive resize handling
 * - Always call the cleanup function to prevent memory leaks
 *
 * @example
 * ```TypeScript
 * // Basic resize observation
 * const cleanup = ResizeObserverWrapper.observe(element, (entry) => {
 *   console.log('New size:', entry.contentRect.width, entry.contentRect.height);
 * });
 *
 * // With debouncing
 * const cleanup = ResizeObserverWrapper.observe(element, callback, {
 *   debounce: 100
 * });
 *
 * // Track breakpoints
 * const cleanup = ResizeObserverWrapper.onBreakpoint(
 *   element,
 *   [320, 768, 1024],
 *   (breakpoint) => console.log('Current breakpoint:', breakpoint)
 * );
 * ```
 */
import type { CleanupFn } from '../core/index.js';

export type BoxModel = 'content-box' | 'border-box' | 'device-pixel-content-box';

export interface ResizeOptions {
  /**
   * Which box model to observe.
   * @default 'content-box'
   */
  readonly box?: BoxModel;

  /**
   * Debounce delay in milliseconds.
   * @default undefined (no debounce)
   */
  readonly debounce?: number;
}

export interface ObserveResult {
  /**
   * Cleanup function to stop observing.
   */
  readonly cleanup: CleanupFn;

  /**
   * The underlying ResizeObserver instance.
   * Returns null when ResizeObserver is not supported.
   */
  readonly observer: ResizeObserver | null;
}

/**
 * Create a debounced resize callback.
 * @internal
 */
function createResizeCallback(
  callback: (entry: ResizeObserverEntry, observer: ResizeObserver | null) => void,
  debounceMs: number | undefined,
  getTimeoutId: () => ReturnType<typeof setTimeout> | undefined,
  setTimeoutId: (id: ReturnType<typeof setTimeout> | undefined) => void
): (entries: ResizeObserverEntry[], obs: ResizeObserver) => void {
  return (entries: ResizeObserverEntry[], obs: ResizeObserver): void => {
    if (debounceMs !== undefined) {
      const currentId = getTimeoutId();
      if (currentId !== undefined) {
        clearTimeout(currentId);
      }
      setTimeoutId(
        setTimeout(() => {
          for (const entry of entries) {
            callback(entry, obs);
          }
        }, debounceMs)
      );
    } else {
      for (const entry of entries) {
        callback(entry, obs);
      }
    }
  };
}

export const ResizeObserverWrapper = {
  // =========================================================================
  // Core API
  // =========================================================================

  /**
   * Check if ResizeObserver is supported.
   */
  isSupported(): boolean {
    return typeof ResizeObserver !== 'undefined';
  },

  /**
   * Observe a single element for size changes.
   * @param element Element to observe
   * @param callback Called when size changes
   * @param options Observer options
   * @returns Cleanup function
   */
  observe(
    element: Element,
    callback: (entry: ResizeObserverEntry, observer: ResizeObserver | null) => void,
    options?: ResizeOptions
  ): CleanupFn {
    if (!ResizeObserverWrapper.isSupported()) {
      // Fallback: call once with current size
      const entry = ResizeObserverWrapper.createFallbackEntry(element);
      callback(entry, null);
      return (): void => {};
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const debounceMs = options?.debounce;

    const wrappedCallback = createResizeCallback(
      callback,
      debounceMs,
      () => timeoutId,
      (id) => {
        timeoutId = id;
      }
    );

    const observer = new ResizeObserver(wrappedCallback);

    observer.observe(element, {
      box: options?.box ?? 'content-box',
    });

    return (): void => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      observer.unobserve(element);
      observer.disconnect();
    };
  },

  /**
   * Observe multiple elements with a single observer.
   * @param elements Elements to observe
   * @param callback Called for each size change
   * @param options Observer options
   * @returns Object with cleanup function and observer instance
   */
  observeAll(
    elements: Iterable<Element>,
    callback: (entry: ResizeObserverEntry, observer: ResizeObserver | null) => void,
    options?: ResizeOptions
  ): ObserveResult {
    if (!ResizeObserverWrapper.isSupported()) {
      // Fallback: call once per element with current size
      for (const element of elements) {
        const entry = ResizeObserverWrapper.createFallbackEntry(element);
        callback(entry, null);
      }
      return {
        cleanup: (): void => {},
        observer: null,
      };
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const debounceMs = options?.debounce;

    const wrappedCallback = createResizeCallback(
      callback,
      debounceMs,
      () => timeoutId,
      (id) => {
        timeoutId = id;
      }
    );

    const observer = new ResizeObserver(wrappedCallback);

    for (const element of elements) {
      observer.observe(element, {
        box: options?.box ?? 'content-box',
      });
    }

    return {
      cleanup: (): void => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
        observer.disconnect();
      },
      observer,
    };
  },

  // =========================================================================
  // Convenience Methods
  // =========================================================================

  /**
   * Track width breakpoints of an element.
   * @param element Element to observe
   * @param breakpoints Width breakpoints in pixels (sorted ascending)
   * @param callback Called when breakpoint changes
   * @param options Observer options
   * @returns Cleanup function
   */
  onBreakpoint(
    element: Element,
    breakpoints: readonly number[],
    callback: (currentBreakpoint: number | null, width: number) => void,
    options?: ResizeOptions
  ): CleanupFn {
    const sortedBreakpoints = [...breakpoints].sort((a, b) => a - b);
    let currentBreakpoint: number | null = null;

    return ResizeObserverWrapper.observe(
      element,
      (entry) => {
        const width = entry.contentRect.width;
        let newBreakpoint: number | null = null;

        for (let i = sortedBreakpoints.length - 1; i >= 0; i--) {
          if (width >= sortedBreakpoints[i]!) {
            newBreakpoint = sortedBreakpoints[i]!;
            break;
          }
        }

        if (newBreakpoint !== currentBreakpoint) {
          currentBreakpoint = newBreakpoint;
          callback(newBreakpoint, width);
        }
      },
      options
    );
  },

  /**
   * Get current size of an element.
   * @param element Element to measure
   * @param box Box model to use
   * @returns Current dimensions
   */
  getSize(
    element: Element,
    box: BoxModel = 'content-box'
  ): { readonly width: number; readonly height: number } {
    if (box === 'border-box') {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }

    // content-box (default)
    if (element instanceof HTMLElement) {
      return { width: element.clientWidth, height: element.clientHeight };
    }

    // Fallback for non-HTML elements
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  },

  /**
   * Watch for size changes and get width/height directly.
   * @param element Element to observe
   * @param callback Called with width and height
   * @param options Observer options
   * @returns Cleanup function
   */
  onResize(
    element: Element,
    callback: (width: number, height: number) => void,
    options?: ResizeOptions
  ): CleanupFn {
    return ResizeObserverWrapper.observe(
      element,
      (entry) => {
        callback(entry.contentRect.width, entry.contentRect.height);
      },
      options
    );
  },

  // =========================================================================
  // Internal
  // =========================================================================

  /**
   * Create a fallback entry for browsers without ResizeObserver support.
   * @internal
   */
  createFallbackEntry(target: Element): ResizeObserverEntry {
    const rect = target.getBoundingClientRect();
    const contentRect = {
      x: 0,
      y: 0,
      width: rect.width,
      height: rect.height,
      top: 0,
      right: rect.width,
      bottom: rect.height,
      left: 0,
      toJSON: (): object => ({ width: rect.width, height: rect.height }),
    };

    return {
      target,
      contentRect: contentRect,
      borderBoxSize: [{ blockSize: rect.height, inlineSize: rect.width }],
      contentBoxSize: [{ blockSize: rect.height, inlineSize: rect.width }],
      devicePixelContentBoxSize: [{ blockSize: rect.height, inlineSize: rect.width }],
    };
  },
};
