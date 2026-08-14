/**
 * Geolocation Manager - Promise-based Geolocation API wrapper.
 *
 * Features:
 * - Promise-based API for getCurrentPosition
 * - Result-based API for explicit error handling
 * - Watch position with cleanup function
 *
 * @example
 * ```TypeScript
 * // Check support
 * if (GeolocationManager.isSupported()) {
 *   // Get current position (throws on error)
 *   try {
 *     const position = await GeolocationManager.getCurrentPosition();
 *     console.log(position.coords.latitude, position.coords.longitude);
 *   } catch (error) {
 *     if (error instanceof GeolocationError) {
 *       console.error(error.code, error.message);
 *     }
 *   }
 *
 *   // Get current position (Result-based)
 *   const result = await GeolocationManager.getCurrentPositionResult();
 *   if (Result.isOk(result)) {
 *     console.log(result.value.coords.latitude);
 *   } else {
 *     console.error(result.error.code);
 *   }
 *
 *   // Watch position
 *   const cleanup = GeolocationManager.watchPosition((position) => {
 *     console.log(position.coords.latitude, position.coords.longitude);
 *   });
 *
 *   // Later: stop watching
 *   cleanup();
 * }
 * ```
 */
import { Result, GeolocationError, type CleanupFn } from '../core/index.js';

/**
 * Options for geolocation requests.
 */
export interface GeolocationOptions {
  /**
   * Enable high accuracy mode.
   * May result in slower response times or higher power consumption.
   */
  readonly enableHighAccuracy?: boolean;

  /**
   * Maximum time in milliseconds to wait for a position.
   */
  readonly timeout?: number;

  /**
   * Maximum age in milliseconds of a cached position.
   */
  readonly maximumAge?: number;
}

export const GeolocationManager = {
  // =========================================================================
  // Support
  // =========================================================================

  /**
   * Check if Geolocation API is supported.
   */
  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'geolocation' in navigator;
  },

  // =========================================================================
  // Get Current Position
  // =========================================================================

  /**
   * Get current position as a Promise.
   * Throws GeolocationError on failure.
   *
   * @param options - Geolocation options
   * @returns Promise resolving to GeolocationPosition
   * @throws {GeolocationError} When geolocation fails
   */
  getCurrentPosition(options?: GeolocationOptions): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!GeolocationManager.isSupported()) {
        reject(GeolocationError.notSupported());
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => resolve(position),
        (error) => reject(GeolocationError.fromPositionError(error)),
        options
      );
    });
  },

  /**
   * Get current position with Result-based error handling.
   *
   * @param options - Geolocation options
   * @returns Promise resolving to Result with position or error
   */
  async getCurrentPositionResult(
    options?: GeolocationOptions
  ): Promise<Result<GeolocationPosition, GeolocationError>> {
    try {
      const position = await GeolocationManager.getCurrentPosition(options);
      return Result.ok(position);
    } catch (error) {
      if (error instanceof GeolocationError) {
        return Result.err(error);
      }
      return Result.err(GeolocationError.positionUnavailable(error));
    }
  },

  // =========================================================================
  // Watch Position
  // =========================================================================

  /**
   * Watch position changes.
   * Returns a cleanup function to stop watching.
   *
   * @param handler - Callback invoked with new positions
   * @param options - Geolocation options
   * @returns Cleanup function to stop watching
   */
  watchPosition(
    handler: (position: GeolocationPosition) => void,
    options?: GeolocationOptions
  ): CleanupFn {
    if (!GeolocationManager.isSupported()) {
      // Return no-op cleanup if not supported
      return () => {};
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => handler(position),
      // Error handler is required but we silently ignore errors in watch mode
      // Use getCurrentPositionResult for explicit error handling
      () => {},
      options
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  },

  /**
   * Watch position changes with error handling.
   * Returns a cleanup function to stop watching.
   *
   * @param handler - Callback invoked with new positions
   * @param errorHandler - Callback invoked on errors
   * @param options - Geolocation options
   * @returns Cleanup function to stop watching
   */
  watchPositionWithError(
    handler: (position: GeolocationPosition) => void,
    errorHandler: (error: GeolocationError) => void,
    options?: GeolocationOptions
  ): CleanupFn {
    if (!GeolocationManager.isSupported()) {
      // Notify about unsupported API
      errorHandler(GeolocationError.notSupported());
      return () => {};
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => handler(position),
      (error) => errorHandler(GeolocationError.fromPositionError(error)),
      options
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  },
};
