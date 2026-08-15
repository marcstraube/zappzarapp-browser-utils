/**
 * Scroll Utilities - Scroll management and detection.
 *
 * Features:
 * - Smooth scrolling
 * - Scroll locking (prevent body scroll)
 * - Scroll position tracking
 * - Viewport detection
 * - Throttled scroll events
 *
 * @example
 * ```TypeScript
 * // Smooth scroll to element
 * ScrollUtils.scrollIntoView(element, { behavior: 'smooth' });
 *
 * // Scroll to top
 * ScrollUtils.scrollToTop({ behavior: 'smooth' });
 *
 * // Lock scroll (for modals)
 * const unlock = ScrollUtils.lock();
 * // ... modal open ...
 * unlock(); // Restore scrolling
 *
 * // Check if element is in viewport
 * if (ScrollUtils.isInViewport(element)) {
 *   // Element is visible
 * }
 *
 * // Listen for scroll events (throttled)
 * const cleanup = ScrollUtils.onScroll(() => {
 *   console.log('Scrolled');
 * }, { throttle: 100 });
 * ```
 */
import { throttle, type ThrottledFunction } from '../core/index.js';
import type { CleanupFn } from '../core/index.js';

export interface ScrollToOptions {
  /** Scroll behavior */
  behavior?: ScrollBehavior;
  /** Vertical position: 'start', 'center', 'end', 'nearest' */
  block?: ScrollLogicalPosition;
  /** Horizontal position: 'start', 'center', 'end', 'nearest' */
  inline?: ScrollLogicalPosition;
}

export interface ScrollPosition {
  x: number;
  y: number;
}

export const ScrollUtils = {
  // =========================================================================
  // Scroll To
  // =========================================================================

  /**
   * Scroll to a specific position.
   * @param options Scroll position and behavior
   * @param options.top Vertical scroll position
   * @param options.left Horizontal scroll position
   * @param options.behavior Scroll behavior ('auto' or 'smooth')
   */
  scrollTo(options: { top?: number; left?: number; behavior?: ScrollBehavior }): void {
    if (typeof window === 'undefined') return;

    window.scrollTo({
      top: options.top,
      left: options.left,
      behavior: options.behavior ?? 'auto',
    });
  },

  /**
   * Scroll to the top of the page.
   */
  scrollToTop(options?: { behavior?: ScrollBehavior }): void {
    ScrollUtils.scrollTo({
      top: 0,
      behavior: options?.behavior,
    });
  },

  /**
   * Scroll to the bottom of the page.
   */
  scrollToBottom(options?: { behavior?: ScrollBehavior }): void {
    if (typeof document === 'undefined') return;

    const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);

    ScrollUtils.scrollTo({
      top: height,
      behavior: options?.behavior,
    });
  },

  /**
   * Scroll an element into view.
   */
  scrollIntoView(element: Element, options?: ScrollToOptions): void {
    element.scrollIntoView({
      behavior: options?.behavior ?? 'auto',
      block: options?.block ?? 'start',
      inline: options?.inline ?? 'nearest',
    });
  },

  /**
   * Scroll to a specific element by selector.
   * @returns true if element was found and scrolled to
   */
  scrollToElement(selector: string, options?: ScrollToOptions): boolean {
    if (typeof document === 'undefined') return false;

    const element = document.querySelector(selector);

    if (element === null) {
      return false;
    }

    ScrollUtils.scrollIntoView(element, options);
    return true;
  },

  // =========================================================================
  // Scroll Lock
  // =========================================================================

  /**
   * Lock body scrolling.
   * Useful when opening modals or overlays.
   * @returns Cleanup function to unlock scrolling
   */
  lock(): CleanupFn {
    if (typeof document === 'undefined') return () => {};

    const scrollY = window.scrollY;
    const body = document.body;
    const html = document.documentElement;

    // Save current styles
    const originalBodyOverflow = body.style.overflow;
    const originalBodyPosition = body.style.position;
    const originalBodyTop = body.style.top;
    const originalBodyWidth = body.style.width;
    const originalHtmlOverflow = html.style.overflow;

    // Calculate scrollbar width
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    // Apply lock styles
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    html.style.overflow = 'hidden';

    // Compensate for scrollbar
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      // Restore styles
      body.style.overflow = originalBodyOverflow;
      body.style.position = originalBodyPosition;
      body.style.top = originalBodyTop;
      body.style.width = originalBodyWidth;
      body.style.paddingRight = '';
      html.style.overflow = originalHtmlOverflow;

      // Restore scroll position
      window.scrollTo(0, scrollY);
    };
  },

  // =========================================================================
  // Scroll Position
  // =========================================================================

  /**
   * Get current scroll position.
   */
  getScrollPosition(): ScrollPosition {
    if (typeof window === 'undefined') {
      return { x: 0, y: 0 };
    }

    /* eslint-disable @typescript-eslint/no-unnecessary-condition -- pageXOffset/pageYOffset for older browsers */
    return {
      x: window.scrollX ?? window.pageXOffset ?? 0,
      y: window.scrollY ?? window.pageYOffset ?? 0,
    };
    /* eslint-enable @typescript-eslint/no-unnecessary-condition */
  },

  /**
   * Get scroll position as percentage (0-100).
   */
  getScrollPercentage(): { x: number; y: number } {
    if (typeof document === 'undefined') {
      return { x: 0, y: 0 };
    }

    const position = ScrollUtils.getScrollPosition();
    const maxX = document.documentElement.scrollWidth - window.innerWidth;
    const maxY = document.documentElement.scrollHeight - window.innerHeight;

    return {
      x: maxX > 0 ? (position.x / maxX) * 100 : 0,
      y: maxY > 0 ? (position.y / maxY) * 100 : 0,
    };
  },

  /**
   * Get maximum scroll values.
   */
  getMaxScroll(): { x: number; y: number } {
    if (typeof document === 'undefined') {
      return { x: 0, y: 0 };
    }

    return {
      x: document.documentElement.scrollWidth - window.innerWidth,
      y: document.documentElement.scrollHeight - window.innerHeight,
    };
  },

  // =========================================================================
  // Viewport Detection
  // =========================================================================

  /**
   * Check if an element is in the viewport.
   * @param element Element to check
   * @param threshold Percentage of element that must be visible (0-1)
   */
  isInViewport(element: Element, threshold = 0): boolean {
    if (typeof window === 'undefined') return false;

    const rect = element.getBoundingClientRect();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Older browsers may use clientHeight
    const viewHeight = window.innerHeight ?? document.documentElement.clientHeight;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Older browsers may use clientWidth
    const viewWidth = window.innerWidth ?? document.documentElement.clientWidth;

    // Calculate visible area
    const visibleHeight = Math.min(rect.bottom, viewHeight) - Math.max(rect.top, 0);
    const visibleWidth = Math.min(rect.right, viewWidth) - Math.max(rect.left, 0);

    if (visibleHeight <= 0 || visibleWidth <= 0) {
      return false;
    }

    if (threshold === 0) {
      return true;
    }

    // Check if enough of element is visible
    const visibleArea = visibleHeight * visibleWidth;
    const totalArea = rect.height * rect.width;

    return totalArea > 0 && visibleArea / totalArea >= threshold;
  },

  /**
   * Check if an element is fully in the viewport.
   */
  isFullyInViewport(element: Element): boolean {
    if (typeof window === 'undefined') return false;

    const rect = element.getBoundingClientRect();

    /* eslint-disable @typescript-eslint/no-unnecessary-condition -- Older browsers may use clientHeight/clientWidth */
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight ?? document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth ?? document.documentElement.clientWidth)
    );
    /* eslint-enable @typescript-eslint/no-unnecessary-condition */
  },

  /**
   * Check if element is above the viewport.
   */
  isAboveViewport(element: Element): boolean {
    const rect = element.getBoundingClientRect();
    return rect.bottom < 0;
  },

  /**
   * Check if element is below the viewport.
   */
  isBelowViewport(element: Element): boolean {
    if (typeof window === 'undefined') return false;

    const rect = element.getBoundingClientRect();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Older browsers may use clientHeight
    return rect.top > (window.innerHeight ?? document.documentElement.clientHeight);
  },

  // =========================================================================
  // Scroll Events
  // =========================================================================

  /**
   * Listen for scroll events with optional throttling.
   * @param handler Scroll event handler
   * @param options Event options
   * @param options.throttle Throttle delay in milliseconds
   * @param options.passive Use passive event listener
   * @returns Cleanup function
   */
  onScroll(
    handler: (event: Event) => void,
    options?: { throttle?: number; passive?: boolean }
  ): CleanupFn {
    if (typeof window === 'undefined') return () => {};

    const { throttle: throttleMs = 0, passive = true } = options ?? {};

    let actualHandler: EventListener;
    let throttledHandler: ThrottledFunction<typeof handler> | null = null;

    if (throttleMs > 0) {
      throttledHandler = throttle(handler, throttleMs);
      actualHandler = throttledHandler;
    } else {
      actualHandler = handler;
    }

    window.addEventListener('scroll', actualHandler, { passive });

    return () => {
      window.removeEventListener('scroll', actualHandler);

      // Cancel throttled handler if applicable
      if (throttledHandler !== null) {
        throttledHandler.cancel();
      }
    };
  },

  /**
   * Listen for scroll direction changes.
   * @returns Cleanup function
   */
  onScrollDirection(
    handler: (direction: 'up' | 'down') => void,
    options?: { threshold?: number; throttle?: number }
  ): CleanupFn {
    if (typeof window === 'undefined') return () => {};

    const { threshold = 10, throttle: throttleMs = 100 } = options ?? {};

    let lastScrollY = window.scrollY;
    let lastDirection: 'up' | 'down' | null = null;

    const scrollHandler = (): void => {
      const currentScrollY = window.scrollY;
      const diff = currentScrollY - lastScrollY;

      if (Math.abs(diff) < threshold) {
        return;
      }

      const direction = diff > 0 ? 'down' : 'up';

      if (direction !== lastDirection) {
        lastDirection = direction;
        handler(direction);
      }

      lastScrollY = currentScrollY;
    };

    let actualHandler: EventListener;
    let throttledScrollHandler: ThrottledFunction<typeof scrollHandler> | null = null;

    if (throttleMs > 0) {
      throttledScrollHandler = throttle(scrollHandler, throttleMs);
      actualHandler = throttledScrollHandler;
    } else {
      actualHandler = scrollHandler;
    }

    window.addEventListener('scroll', actualHandler, { passive: true });

    return () => {
      window.removeEventListener('scroll', actualHandler);

      if (throttledScrollHandler !== null) {
        throttledScrollHandler.cancel();
      }
    };
  },
};
