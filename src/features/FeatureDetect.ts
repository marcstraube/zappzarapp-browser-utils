/**
 * Feature Detection - Check browser capabilities.
 *
 * Features:
 * - Storage APIs (localStorage, sessionStorage, cookies)
 * - Clipboard API
 * - Touch support
 * - Modern APIs (geolocation, notifications, service worker)
 * - WebGL
 *
 * @example
 * ```TypeScript
 * // Check individual features
 * if (FeatureDetect.localStorage()) {
 *   // Use localStorage
 * }
 *
 * // Get all features at once
 * const features = FeatureDetect.all();
 * console.log(features);
 * // { localStorage: true, sessionStorage: true, ... }
 * ```
 */

export interface FeatureReport {
  readonly localStorage: boolean;
  readonly sessionStorage: boolean;
  readonly cookies: boolean;
  readonly clipboard: boolean;
  readonly clipboardRead: boolean;
  readonly touch: boolean;
  readonly geolocation: boolean;
  readonly notifications: boolean;
  readonly serviceWorker: boolean;
  readonly webGL: boolean;
  readonly webGL2: boolean;
  readonly indexedDB: boolean;
  readonly webSocket: boolean;
  readonly fetch: boolean;
  readonly promise: boolean;
  readonly customElements: boolean;
  readonly shadowDOM: boolean;
  readonly intersectionObserver: boolean;
  readonly resizeObserver: boolean;
  readonly mutationObserver: boolean;
}

export const FeatureDetect = {
  // =========================================================================
  // Storage APIs
  // =========================================================================

  /**
   * Check if localStorage is available and functional.
   */
  localStorage(): boolean {
    try {
      const testKey = '__feature_test__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Check if sessionStorage is available and functional.
   */
  sessionStorage(): boolean {
    try {
      const testKey = '__feature_test__';
      sessionStorage.setItem(testKey, '1');
      sessionStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Check if cookies are enabled.
   */
  cookies(): boolean {
    if (typeof document === 'undefined') {
      return false;
    }

    try {
      document.cookie = '__feature_test__=1';
      const enabled = document.cookie.includes('__feature_test__');
      document.cookie = '__feature_test__=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      return enabled;
    } catch {
      return false;
    }
  },

  /**
   * Check if IndexedDB is available.
   */
  indexedDB(): boolean {
    return typeof indexedDB !== 'undefined';
  },

  // =========================================================================
  // Clipboard
  // =========================================================================

  /**
   * Check if Clipboard API is available for writing.
   */
  clipboard(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.clipboard !== 'undefined' &&
      typeof navigator.clipboard.writeText === 'function'
    );
  },

  /**
   * Check if Clipboard API is available for reading.
   * (More restricted than writing)
   */
  clipboardRead(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.clipboard !== 'undefined' &&
      typeof navigator.clipboard.readText === 'function'
    );
  },

  // =========================================================================
  // Input/Interaction
  // =========================================================================

  /**
   * Check if device supports touch events.
   */
  touch(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    return (
      'ontouchstart' in window ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
      (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches)
    );
  },

  // =========================================================================
  // Modern APIs
  // =========================================================================

  /**
   * Check if Geolocation API is available.
   */
  geolocation(): boolean {
    return typeof navigator !== 'undefined' && 'geolocation' in navigator;
  },

  /**
   * Check if Notifications API is available.
   */
  notifications(): boolean {
    return typeof Notification !== 'undefined';
  },

  /**
   * Check if Service Worker is available.
   */
  serviceWorker(): boolean {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  },

  /**
   * Check if WebSocket is available.
   */
  webSocket(): boolean {
    return typeof WebSocket !== 'undefined';
  },

  /**
   * Check if Fetch API is available.
   */
  fetch(): boolean {
    return typeof fetch !== 'undefined';
  },

  /**
   * Check if Promise is available.
   */
  promise(): boolean {
    return typeof Promise !== 'undefined';
  },

  // =========================================================================
  // Graphics
  // =========================================================================

  /**
   * Check if WebGL is available.
   */
  webGL(): boolean {
    if (typeof document === 'undefined') {
      return false;
    }

    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl');
      return gl !== null;
    } catch {
      return false;
    }
  },

  /**
   * Check if WebGL 2 is available.
   */
  webGL2(): boolean {
    if (typeof document === 'undefined') {
      return false;
    }

    try {
      const canvas = document.createElement('canvas');
      return canvas.getContext('webgl2') !== null;
    } catch {
      return false;
    }
  },

  // =========================================================================
  // Web Components
  // =========================================================================

  /**
   * Check if Custom Elements are available.
   */
  customElements(): boolean {
    return typeof customElements !== 'undefined';
  },

  /**
   * Check if Shadow DOM is available.
   */
  shadowDOM(): boolean {
    if (typeof document === 'undefined') {
      return false;
    }

    return typeof document.createElement('div').attachShadow === 'function';
  },

  // =========================================================================
  // Observers
  // =========================================================================

  /**
   * Check if IntersectionObserver is available.
   */
  intersectionObserver(): boolean {
    return typeof IntersectionObserver !== 'undefined';
  },

  /**
   * Check if ResizeObserver is available.
   */
  resizeObserver(): boolean {
    return typeof ResizeObserver !== 'undefined';
  },

  /**
   * Check if MutationObserver is available.
   */
  mutationObserver(): boolean {
    return typeof MutationObserver !== 'undefined';
  },

  // =========================================================================
  // Aggregated Report
  // =========================================================================

  /**
   * Get a complete feature report.
   */
  all(): FeatureReport {
    return {
      localStorage: FeatureDetect.localStorage(),
      sessionStorage: FeatureDetect.sessionStorage(),
      cookies: FeatureDetect.cookies(),
      clipboard: FeatureDetect.clipboard(),
      clipboardRead: FeatureDetect.clipboardRead(),
      touch: FeatureDetect.touch(),
      geolocation: FeatureDetect.geolocation(),
      notifications: FeatureDetect.notifications(),
      serviceWorker: FeatureDetect.serviceWorker(),
      webGL: FeatureDetect.webGL(),
      webGL2: FeatureDetect.webGL2(),
      indexedDB: FeatureDetect.indexedDB(),
      webSocket: FeatureDetect.webSocket(),
      fetch: FeatureDetect.fetch(),
      promise: FeatureDetect.promise(),
      customElements: FeatureDetect.customElements(),
      shadowDOM: FeatureDetect.shadowDOM(),
      intersectionObserver: FeatureDetect.intersectionObserver(),
      resizeObserver: FeatureDetect.resizeObserver(),
      mutationObserver: FeatureDetect.mutationObserver(),
    };
  },
};
