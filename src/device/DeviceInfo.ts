/**
 * Device Info - Device and browser detection utilities.
 *
 * Features:
 * - Device type detection (mobile, tablet, desktop)
 * - OS detection (iOS, Android)
 * - Screen and viewport information
 * - Orientation detection with event handling
 *
 * @example
 * ```TypeScript
 * // Device type
 * if (DeviceInfo.isMobile()) {
 *   // Mobile-specific UI
 * }
 *
 * // Platform detection
 * if (DeviceInfo.isIOS()) {
 *   // iOS-specific behavior
 * }
 *
 * // Screen info
 * const screen = DeviceInfo.screenSize();
 * const viewport = DeviceInfo.viewportSize();
 *
 * // Orientation
 * const cleanup = DeviceInfo.onOrientationChange((state) => {
 *   console.log(state.type, state.angle, state.orientation);
 * });
 * ```
 */

import type { CleanupFn } from '../core/index.js';

/** Minimal User-Agent Client Hints type (Chromium-only as of 2026) */
interface NavigatorUAData {
  readonly platform: string;
}

/**
 * Get platform string via fallback chain:
 * navigator.userAgentData.platform → navigator.platform
 */
function getPlatformString(): string {
  if (typeof navigator === 'undefined') return '';

  const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
  if (uaData !== undefined && uaData.platform !== '') return uaData.platform;

  // noinspection JSDeprecatedSymbols — Fallback for Firefox/Safari (no userAgentData support)
  return navigator.platform;
}

export type Orientation = 'portrait' | 'landscape';

/**
 * Full orientation type from the Screen Orientation API.
 */
export type OrientationType =
  'portrait-primary' | 'portrait-secondary' | 'landscape-primary' | 'landscape-secondary';

/**
 * Orientation lock types supported by the Screen Orientation API.
 */
export type OrientationLockType =
  | 'any'
  | 'natural'
  | 'landscape'
  | 'portrait'
  | 'portrait-primary'
  | 'portrait-secondary'
  | 'landscape-primary'
  | 'landscape-secondary';

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * Immutable snapshot of the device's screen orientation.
 *
 * Combines the full {@link OrientationType} and angle from the Screen
 * Orientation API with a derived {@link Orientation} convenience field.
 */
export interface OrientationState {
  /** Full orientation type, e.g. `'portrait-primary'`. */
  readonly type: OrientationType;
  /** Orientation angle in degrees: `0`, `90`, `180`, or `270`. */
  readonly angle: number;
  /** Derived coarse orientation: `'portrait'` or `'landscape'`. */
  readonly orientation: Orientation;
}

/**
 * Build an immutable {@link OrientationState} from a live `ScreenOrientation`.
 */
function toOrientationState(source: ScreenOrientation): OrientationState {
  return {
    type: source.type,
    angle: source.angle,
    orientation: source.type.startsWith('portrait') ? 'portrait' : 'landscape',
  };
}

export const DeviceInfo = {
  // =========================================================================
  // Device Type
  // =========================================================================

  /**
   * Check if device supports touch events.
   */
  isTouchDevice(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches)
    );
  },

  /**
   * Check if device appears to be mobile.
   * Uses combination of screen size, touch, and user agent.
   */
  isMobile(): boolean {
    if (typeof navigator === 'undefined') {
      return false;
    }

    // Check user agent
    const ua = navigator.userAgent.toLowerCase();
    const mobileKeywords = [
      'android',
      'webos',
      'iphone',
      'ipad',
      'ipod',
      'blackberry',
      'windows phone',
    ];

    if (mobileKeywords.some((keyword) => ua.includes(keyword))) {
      return true;
    }

    // Check screen width
    return typeof window !== 'undefined' && window.innerWidth < 768;
  },

  /**
   * Check if device appears to be a tablet.
   */
  isTablet(): boolean {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') {
      return false;
    }

    const ua = navigator.userAgent.toLowerCase();

    // iPad detection (including iPadOS 13+)
    if (ua.includes('ipad') || (ua.includes('macintosh') && DeviceInfo.isTouchDevice())) {
      return true;
    }

    // Android tablet detection
    if (ua.includes('android') && !ua.includes('mobile')) {
      return true;
    }

    // Size-based detection
    const width = window.innerWidth;
    const height = window.innerHeight;
    const minDimension = Math.min(width, height);
    const maxDimension = Math.max(width, height);

    return minDimension >= 600 && maxDimension <= 1366 && DeviceInfo.isTouchDevice();
  },

  /**
   * Check if device appears to be desktop.
   */
  isDesktop(): boolean {
    return !DeviceInfo.isMobile() && !DeviceInfo.isTablet();
  },

  // =========================================================================
  // OS Detection
  // =========================================================================

  /**
   * Check if device is running iOS.
   */
  isIOS(): boolean {
    if (typeof navigator === 'undefined') {
      return false;
    }

    const ua = navigator.userAgent;

    // Standard iOS detection
    if (/iPad|iPhone|iPod/.test(ua)) {
      return true;
    }

    // iPadOS 13+ detection (reports as Macintosh)
    return ua.includes('Macintosh') && DeviceInfo.isTouchDevice();
  },

  /**
   * Check if device is running Android.
   */
  isAndroid(): boolean {
    if (typeof navigator === 'undefined') {
      return false;
    }

    return /android/i.test(navigator.userAgent);
  },

  /**
   * Check if device is running Windows.
   */
  isWindows(): boolean {
    return /win/i.test(getPlatformString());
  },

  /**
   * Check if device is running macOS.
   */
  isMacOS(): boolean {
    return /mac/i.test(getPlatformString()) && !DeviceInfo.isIOS();
  },

  /**
   * Check if device is running Linux.
   */
  isLinux(): boolean {
    return /linux/i.test(getPlatformString()) && !DeviceInfo.isAndroid();
  },

  // =========================================================================
  // Screen & Viewport
  // =========================================================================

  /**
   * Get screen size (physical screen dimensions).
   */
  screenSize(): Size {
    if (typeof screen === 'undefined') {
      return { width: 0, height: 0 };
    }

    return {
      width: screen.width,
      height: screen.height,
    };
  },

  /**
   * Get viewport size (visible area).
   */
  viewportSize(): Size {
    if (typeof window === 'undefined') {
      return { width: 0, height: 0 };
    }

    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  },

  /**
   * Get available screen size (excluding taskbar, etc.).
   */
  availableScreenSize(): Size {
    if (typeof screen === 'undefined') {
      return { width: 0, height: 0 };
    }

    return {
      width: screen.availWidth,
      height: screen.availHeight,
    };
  },

  /**
   * Get device pixel ratio.
   */
  pixelRatio(): number {
    if (typeof window === 'undefined') {
      return 1;
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Older browsers may not have this property
    return window.devicePixelRatio ?? 1;
  },

  // =========================================================================
  // Orientation
  // =========================================================================

  /**
   * Check if the Screen Orientation API is supported.
   *
   * Baseline: Safari/iOS 16.4+ (March 2023) — available in all current
   * evergreen browsers.
   * @returns true if the Screen Orientation API is available
   */
  isOrientationSupported(): boolean {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- screen.orientation is absent on unsupported engines
    return typeof screen !== 'undefined' && !!screen.orientation;
  },

  /**
   * Get an immutable snapshot of the current orientation.
   * @returns The current {@link OrientationState}, or `undefined` when the
   *   Screen Orientation API is unsupported.
   */
  getOrientation(): OrientationState | undefined {
    if (!DeviceInfo.isOrientationSupported()) {
      return undefined;
    }

    return toOrientationState(screen.orientation);
  },

  /**
   * Listen for orientation changes.
   *
   * The handler receives an immutable {@link OrientationState} on every change.
   * When the Screen Orientation API is unsupported the listener is a no-op and
   * the returned cleanup does nothing.
   * @param handler - Called with the new state whenever the orientation changes
   * @returns Cleanup function that removes the listener
   */
  onOrientationChange(handler: (state: OrientationState) => void): CleanupFn {
    if (!DeviceInfo.isOrientationSupported()) {
      return () => {};
    }

    const { orientation } = screen;
    const onChange = (): void => {
      handler(toOrientationState(orientation));
    };

    orientation.addEventListener('change', onChange);
    return () => {
      orientation.removeEventListener('change', onChange);
    };
  },

  /**
   * Lock orientation to a specific type.
   * @param orientation - The orientation to lock to
   * @throws Error if orientation lock is not supported or fails
   */
  async lockOrientation(orientation: OrientationLockType): Promise<void> {
    if (!DeviceInfo.isOrientationSupported()) {
      throw new Error('Screen Orientation API is not supported');
    }

    // The lock method exists but may not be in TypeScript's default types
    await (
      screen.orientation as ScreenOrientation & { lock: (orientation: string) => Promise<void> }
    ).lock(orientation);
  },

  /**
   * Unlock orientation.
   */
  unlockOrientation(): void {
    if (DeviceInfo.isOrientationSupported()) {
      screen.orientation.unlock();
    }
  },

  // =========================================================================
  // Browser Features
  // =========================================================================

  /**
   * Get preferred language(s).
   */
  languages(): readonly string[] {
    if (typeof navigator === 'undefined') {
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Older browsers may not have navigator.languages
    return navigator.languages ?? [navigator.language].filter(Boolean);
  },

  /**
   * Get preferred language.
   */
  language(): string {
    if (typeof navigator === 'undefined') {
      return 'en';
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Older browsers may not have navigator.language
    return navigator.language ?? 'en';
  },

  /**
   * Check if online.
   */
  isOnline(): boolean {
    if (typeof navigator === 'undefined') {
      return true;
    }

    return navigator.onLine;
  },

  /**
   * Get hardware concurrency (number of logical processors).
   */
  hardwareConcurrency(): number {
    if (typeof navigator === 'undefined') {
      return 1;
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Older browsers may not have this
    return navigator.hardwareConcurrency ?? 1;
  },

  /**
   * Get device memory (if available, in GB).
   */
  deviceMemory(): number | null {
    if (typeof navigator === 'undefined') {
      return null;
    }

    return (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null;
  },
};
