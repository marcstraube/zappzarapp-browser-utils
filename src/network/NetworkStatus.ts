/**
 * Network Status - Online/offline detection and monitoring.
 *
 * Features:
 * - Check online/offline status
 * - Connection type detection (when available)
 * - Event handlers with cleanup
 *
 * @example
 * ```TypeScript
 * // Check current status
 * if (NetworkStatus.isOnline()) {
 *   await fetchData();
 * }
 *
 * // Listen for changes
 * const cleanup = NetworkStatus.onStatusChange((online) => {
 *   console.log(online ? 'Back online!' : 'Gone offline');
 * });
 *
 * // Listen for specific events
 * const cleanupOnline = NetworkStatus.onOnline(() => {
 *   syncPendingData();
 * });
 * ```
 */

import type { CleanupFn } from '../core/index.js';

export type ConnectionType =
  'wifi' | 'cellular' | 'ethernet' | 'bluetooth' | 'wimax' | 'other' | 'none' | 'unknown';

export interface NetworkInfo {
  readonly online: boolean;
  readonly type: ConnectionType;
  readonly effectiveType?: '2g' | '3g' | '4g' | 'slow-2g';
  readonly downlink?: number;
  readonly rtt?: number;
  readonly saveData?: boolean;
}

/**
 * Network Information API interface (not available in all browsers).
 * @see https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation
 */
export interface NetworkInformation extends EventTarget {
  readonly type?: string;
  readonly effectiveType?: string;
  readonly downlink?: number;
  readonly rtt?: number;
  readonly saveData?: boolean;
}

declare global {
  interface Navigator {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  }
}

export const NetworkStatus = {
  // =========================================================================
  // Status Checks
  // =========================================================================

  /**
   * Check if browser reports being online.
   */
  isOnline(): boolean {
    if (typeof navigator === 'undefined') {
      return true; // Assume online in non-browser environments
    }
    return navigator.onLine;
  },

  /**
   * Check if browser reports being offline.
   */
  isOffline(): boolean {
    return !NetworkStatus.isOnline();
  },

  /**
   * Get connection type if available.
   * Uses Network Information API (limited browser support).
   */
  connectionType(): ConnectionType {
    const connection = NetworkStatus.getConnection();

    if (connection === null) {
      return 'unknown';
    }

    const type = connection.type;

    if (type === undefined) {
      return 'unknown';
    }

    // Map browser values to our ConnectionType
    const typeMap: Record<string, ConnectionType> = {
      wifi: 'wifi',
      cellular: 'cellular',
      ethernet: 'ethernet',
      bluetooth: 'bluetooth',
      wimax: 'wimax',
      other: 'other',
      none: 'none',
      unknown: 'unknown',
    };

    return typeMap[type] ?? 'unknown';
  },

  /**
   * Get full network information.
   */
  getInfo(): NetworkInfo {
    const connection = NetworkStatus.getConnection();

    const info: NetworkInfo = {
      online: NetworkStatus.isOnline(),
      type: NetworkStatus.connectionType(),
    };

    if (connection !== null) {
      return {
        ...info,
        effectiveType: connection.effectiveType as NetworkInfo['effectiveType'],
        downlink: connection.downlink,
        rtt: connection.rtt,
        saveData: connection.saveData,
      };
    }

    return info;
  },

  // =========================================================================
  // Event Handlers
  // =========================================================================

  /**
   * Listen for online/offline status changes.
   * @param handler Called with true (online) or false (offline)
   * @returns Cleanup function
   */
  onStatusChange(handler: (online: boolean) => void): CleanupFn {
    if (typeof window === 'undefined') {
      return () => {};
    }

    const onlineHandler = (): void => handler(true);
    const offlineHandler = (): void => handler(false);

    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);

    return () => {
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
    };
  },

  /**
   * Listen for coming back online.
   * @returns Cleanup function
   */
  onOnline(handler: () => void): CleanupFn {
    if (typeof window === 'undefined') {
      return () => {};
    }

    window.addEventListener('online', handler);

    return () => {
      window.removeEventListener('online', handler);
    };
  },

  /**
   * Listen for going offline.
   * @returns Cleanup function
   */
  onOffline(handler: () => void): CleanupFn {
    if (typeof window === 'undefined') {
      return () => {};
    }

    window.addEventListener('offline', handler);

    return () => {
      window.removeEventListener('offline', handler);
    };
  },

  /**
   * Listen for connection type changes.
   * Requires Network Information API support.
   * @returns Cleanup function
   */
  onConnectionChange(handler: (info: NetworkInfo) => void): CleanupFn {
    const connection = NetworkStatus.getConnection();

    if (connection === null) {
      return () => {};
    }

    const changeHandler = (): void => {
      handler(NetworkStatus.getInfo());
    };

    connection.addEventListener('change', changeHandler);

    return () => {
      connection.removeEventListener('change', changeHandler);
    };
  },

  // =========================================================================
  // Support Detection
  // =========================================================================

  /**
   * Check if Network Information API is supported.
   */
  isNetworkInfoSupported(): boolean {
    return NetworkStatus.getConnection() !== null;
  },

  // =========================================================================
  // Internal
  // =========================================================================

  /**
   * Get the NetworkInformation object if available.
   * @internal
   */
  getConnection(): NetworkInformation | null {
    if (typeof navigator === 'undefined') {
      return null;
    }

    return navigator.connection ?? navigator.mozConnection ?? navigator.webkitConnection ?? null;
  },
};
