/**
 * Media Query - Responsive design utilities.
 *
 * Features:
 * - Check media query matches
 * - Listen for media query changes
 * - Prefers-* detection (dark mode, reduced motion)
 * - Responsive breakpoint detection
 *
 * @example
 * ```TypeScript
 * // Check media query
 * if (MediaQuery.matches('(min-width: 768px)')) {
 *   // Desktop layout
 * }
 *
 * // Listen for changes
 * const cleanup = MediaQuery.onChange('(prefers-color-scheme: dark)', (matches) => {
 *   console.log(matches ? 'Dark mode' : 'Light mode');
 * });
 *
 * // Dark mode detection
 * if (MediaQuery.prefersDarkMode()) {
 *   applyDarkTheme();
 * }
 *
 * // Breakpoints
 * const bp = MediaQuery.breakpoint();
 * console.log(bp); // 'xs' | 'sm' | 'md' | 'lg' | 'xl'
 * ```
 */

import type { CleanupFn } from '../core/types.js';

export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/**
 * Default breakpoints (can be customized).
 */
const DEFAULT_BREAKPOINTS = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

export const MediaQuery = {
  // =========================================================================
  // Core API
  // =========================================================================

  /**
   * Check if a media query matches.
   */
  matches(query: string): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') {
      return false;
    }

    return window.matchMedia(query).matches;
  },

  /**
   * Listen for media query changes.
   * @returns Cleanup function
   */
  onChange(query: string, handler: (matches: boolean) => void): CleanupFn {
    if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') {
      return () => {};
    }

    const mediaQuery = window.matchMedia(query);

    const listener = (event: MediaQueryListEvent): void => {
      handler(event.matches);
    };

    // Modern API
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition -- Legacy browser compatibility
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', listener);
      return (): void => mediaQuery.removeEventListener('change', listener);
    }

    // Legacy API (Safari < 14)
    // noinspection JSDeprecatedSymbols
    mediaQuery.addListener(listener);
    // noinspection JSDeprecatedSymbols
    return () => mediaQuery.removeListener(listener);
  },

  // =========================================================================
  // User Preferences
  // =========================================================================

  /**
   * Check if user prefers dark color scheme.
   */
  prefersDarkMode(): boolean {
    return MediaQuery.matches('(prefers-color-scheme: dark)');
  },

  /**
   * Check if user prefers light color scheme.
   */
  prefersLightMode(): boolean {
    return MediaQuery.matches('(prefers-color-scheme: light)');
  },

  /**
   * Check if user prefers reduced motion.
   */
  prefersReducedMotion(): boolean {
    return MediaQuery.matches('(prefers-reduced-motion: reduce)');
  },

  /**
   * Check if user prefers reduced transparency.
   */
  prefersReducedTransparency(): boolean {
    return MediaQuery.matches('(prefers-reduced-transparency: reduce)');
  },

  /**
   * Check if user prefers high contrast.
   */
  prefersHighContrast(): boolean {
    return (
      MediaQuery.matches('(prefers-contrast: more)') ||
      MediaQuery.matches('(-ms-high-contrast: active)')
    );
  },

  /**
   * Listen for dark mode changes.
   * @returns Cleanup function
   */
  onDarkModeChange(handler: (isDark: boolean) => void): CleanupFn {
    return MediaQuery.onChange('(prefers-color-scheme: dark)', handler);
  },

  /**
   * Listen for reduced motion preference changes.
   * @returns Cleanup function
   */
  onReducedMotionChange(handler: (prefersReduced: boolean) => void): CleanupFn {
    return MediaQuery.onChange('(prefers-reduced-motion: reduce)', handler);
  },

  // =========================================================================
  // Device Type
  // =========================================================================

  /**
   * Check if device appears to be mobile (based on width and touch).
   */
  isMobile(): boolean {
    return MediaQuery.matches('(max-width: 767px)');
  },

  /**
   * Check if device appears to be tablet.
   */
  isTablet(): boolean {
    return MediaQuery.matches('(min-width: 768px) and (max-width: 1023px)');
  },

  /**
   * Check if device appears to be desktop.
   */
  isDesktop(): boolean {
    return MediaQuery.matches('(min-width: 1024px)');
  },

  /**
   * Check if screen is in portrait orientation.
   */
  isPortrait(): boolean {
    return MediaQuery.matches('(orientation: portrait)');
  },

  /**
   * Check if screen is in landscape orientation.
   */
  isLandscape(): boolean {
    return MediaQuery.matches('(orientation: landscape)');
  },

  // =========================================================================
  // Breakpoints
  // =========================================================================

  /**
   * Get current breakpoint name.
   */
  breakpoint(breakpoints: Record<string, number> = DEFAULT_BREAKPOINTS): Breakpoint {
    if (typeof window === 'undefined') {
      return 'md';
    }

    const width = window.innerWidth;
    const entries = Object.entries(breakpoints).sort(([, a], [, b]) => b - a);

    for (const [name, minWidth] of entries) {
      if (width >= minWidth) {
        return name as Breakpoint;
      }
    }

    return 'xs';
  },

  /**
   * Check if current width is at or above breakpoint.
   */
  isAtLeast(
    breakpoint: Breakpoint,
    breakpoints: Record<string, number> = DEFAULT_BREAKPOINTS
  ): boolean {
    const minWidth = breakpoints[breakpoint];
    if (minWidth === undefined) return false;
    return MediaQuery.matches(`(min-width: ${minWidth}px)`);
  },

  /**
   * Check if current width is below breakpoint.
   */
  isBelow(
    breakpoint: Breakpoint,
    breakpoints: Record<string, number> = DEFAULT_BREAKPOINTS
  ): boolean {
    const minWidth = breakpoints[breakpoint];
    if (minWidth === undefined) return true;
    return MediaQuery.matches(`(max-width: ${minWidth - 1}px)`);
  },

  /**
   * Listen for breakpoint changes.
   * @returns Cleanup function
   */
  onBreakpointChange(
    handler: (breakpoint: Breakpoint) => void,
    breakpoints: Record<string, number> = DEFAULT_BREAKPOINTS
  ): CleanupFn {
    if (typeof window === 'undefined') {
      return () => {};
    }

    let currentBreakpoint = MediaQuery.breakpoint(breakpoints);

    const checkBreakpoint = (): void => {
      const newBreakpoint = MediaQuery.breakpoint(breakpoints);
      if (newBreakpoint !== currentBreakpoint) {
        currentBreakpoint = newBreakpoint;
        handler(newBreakpoint);
      }
    };

    window.addEventListener('resize', checkBreakpoint);

    return () => {
      window.removeEventListener('resize', checkBreakpoint);
    };
  },

  // =========================================================================
  // Display Features
  // =========================================================================

  /**
   * Check if device supports hover.
   */
  hasHover(): boolean {
    return MediaQuery.matches('(hover: hover)');
  },

  /**
   * Check if device has coarse pointer (touch).
   */
  hasCoarsePointer(): boolean {
    return MediaQuery.matches('(pointer: coarse)');
  },

  /**
   * Check if device has fine pointer (mouse).
   */
  hasFinePointer(): boolean {
    return MediaQuery.matches('(pointer: fine)');
  },

  /**
   * Check if device is in standalone mode (PWA installed).
   */
  isStandalone(): boolean {
    return (
      MediaQuery.matches('(display-mode: standalone)') ||
      (typeof navigator !== 'undefined' &&
        (navigator as unknown as { standalone?: boolean }).standalone === true)
    );
  },
};
