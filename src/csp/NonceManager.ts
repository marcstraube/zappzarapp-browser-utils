/**
 * Nonce Manager - Manages CSP nonce rotation with event-based notifications.
 *
 * Provides a secure way to manage CSP nonces with automatic or manual rotation.
 * Uses cryptographic randomness for nonce generation.
 *
 * @example Basic usage
 * ```TypeScript
 * const nonceManager = NonceManager.create();
 *
 * // Get current nonce for script tags
 * const nonce = nonceManager.getCurrentNonce();
 * script.nonce = nonce;
 *
 * // Set CSP header: script-src 'nonce-${nonce}'
 * ```
 *
 * @example Auto-rotation with event handling
 * ```TypeScript
 * const nonceManager = NonceManager.create({
 *   autoRotate: true,
 *   rotationInterval: 60000, // Rotate every minute
 * });
 *
 * // Subscribe to rotation events
 * const cleanup = nonceManager.onRotation((newNonce, oldNonce) => {
 *   console.log(`Nonce rotated from ${oldNonce} to ${newNonce}`);
 *   // Update script tags, CSP headers, etc.
 * });
 *
 * // Later: stop receiving events
 * cleanup();
 *
 * // Cleanup when done
 * nonceManager.destroy();
 * ```
 *
 * @example Manual rotation
 * ```TypeScript
 * const nonceManager = NonceManager.create();
 *
 * // Rotate on demand (e.g., after navigation)
 * nonceManager.rotateNonce();
 * ```
 */
import { type CleanupFn, ValidationError, CspError } from '../core/index.js';
import { CspUtils } from './CspUtils.js';

/**
 * Nonce rotation callback function.
 * Called when the nonce is rotated.
 *
 * @param newNonce - The newly generated nonce
 * @param oldNonce - The previous nonce that was replaced
 */
export type NonceRotationHandler = (newNonce: string, oldNonce: string) => void;

/**
 * Configuration options for NonceManager.
 */
export interface NonceManagerConfig {
  /**
   * Enable automatic nonce rotation.
   * @default false
   */
  readonly autoRotate?: boolean;

  /**
   * Rotation interval in milliseconds (when autoRotate is true).
   * @default 60000 (1 minute)
   */
  readonly rotationInterval?: number;

  /**
   * Nonce length in bytes.
   * Higher values provide more security but longer nonce strings.
   * @default 16 (produces 22 chars base64)
   */
  readonly nonceLength?: number;
}

/**
 * NonceManager instance interface.
 */
export interface NonceManagerInstance {
  /**
   * Get the current nonce value.
   * @returns The current nonce string
   */
  getCurrentNonce(): string;

  /**
   * Generate a new nonce (without rotation).
   * Creates a new nonce but does not update the current nonce.
   * @returns A new nonce string
   */
  generateNonce(): string;

  /**
   * Rotate to a new nonce.
   * Generates a new nonce, updates the current nonce, and emits rotation event.
   * @returns The new nonce string
   */
  rotateNonce(): string;

  /**
   * Subscribe to nonce rotation events.
   * @param handler - Callback function called on each rotation
   * @returns Cleanup function to unsubscribe
   */
  onRotation(handler: NonceRotationHandler): CleanupFn;

  /**
   * Check if auto-rotation is enabled.
   * @returns True if auto-rotation is active
   */
  isAutoRotating(): boolean;

  /**
   * Start auto-rotation (if not already running).
   * Uses the interval specified in config or default.
   */
  startAutoRotation(): void;

  /**
   * Stop auto-rotation.
   */
  stopAutoRotation(): void;

  /**
   * Clean up resources (stop auto-rotation, remove handlers).
   * Call this when the manager is no longer needed.
   */
  destroy(): void;
}

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG = {
  autoRotate: false,
  rotationInterval: 60000,
  nonceLength: 16,
} as const satisfies NonceManagerConfig;

export const NonceManager = {
  /**
   * Create a NonceManager instance.
   *
   * @param config - Configuration options
   * @returns NonceManager instance
   *
   * @example Basic usage
   * ```TypeScript
   * const manager = NonceManager.create();
   * const nonce = manager.getCurrentNonce();
   *
   * // Use nonce in script tag
   * const script = document.createElement('script');
   * script.nonce = nonce;
   * script.textContent = 'console.log("Hello")';
   * document.head.appendChild(script);
   * ```
   *
   * @example With auto-rotation
   * ```TypeScript
   * const manager = NonceManager.create({
   *   autoRotate: true,
   *   rotationInterval: 30000, // 30 seconds
   * });
   *
   * manager.onRotation((newNonce, oldNonce) => {
   *   // Update your application's nonce usage
   *   updateCspHeader(newNonce);
   * });
   * ```
   *
   * @example Custom nonce length
   * ```TypeScript
   * const manager = NonceManager.create({
   *   nonceLength: 32, // 256 bits of entropy
   * });
   * ```
   */
  create(config: NonceManagerConfig = {}): NonceManagerInstance {
    const options = { ...DEFAULT_CONFIG, ...config };

    // Validate configuration
    if (options.rotationInterval <= 0) {
      throw ValidationError.invalidFormat(
        'rotationInterval',
        String(options.rotationInterval),
        'positive number'
      );
    }
    if (options.nonceLength <= 0) {
      throw ValidationError.invalidFormat(
        'nonceLength',
        String(options.nonceLength),
        'positive number'
      );
    }

    // Internal state
    let currentNonce = CspUtils.generateNonce(options.nonceLength);
    let rotationTimer: ReturnType<typeof setInterval> | null = null;
    let isDestroyed = false;

    // Event handlers
    const rotationHandlers = new Set<NonceRotationHandler>();

    /**
     * Generate a new nonce without updating current.
     */
    const generateNonce = (): string => {
      if (isDestroyed) {
        throw CspError.alreadyDestroyed();
      }
      return CspUtils.generateNonce(options.nonceLength);
    };

    /**
     * Rotate to a new nonce and notify handlers.
     */
    const rotateNonce = (): string => {
      if (isDestroyed) {
        throw CspError.alreadyDestroyed();
      }

      const oldNonce = currentNonce;
      const newNonce = CspUtils.generateNonce(options.nonceLength);
      currentNonce = newNonce;

      // Notify all handlers
      rotationHandlers.forEach((handler) => {
        try {
          handler(newNonce, oldNonce);
        } catch {
          // Silently ignore handler errors to prevent breaking rotation
        }
      });

      return newNonce;
    };

    /**
     * Start auto-rotation timer.
     */
    const startAutoRotation = (): void => {
      if (isDestroyed) {
        throw CspError.alreadyDestroyed();
      }

      if (rotationTimer !== null) {
        return; // Already running
      }

      rotationTimer = setInterval(() => {
        rotateNonce();
      }, options.rotationInterval);
    };

    /**
     * Stop auto-rotation timer.
     */
    const stopAutoRotation = (): void => {
      if (rotationTimer !== null) {
        clearInterval(rotationTimer);
        rotationTimer = null;
      }
    };

    /**
     * Clean up all resources.
     */
    const destroy = (): void => {
      if (isDestroyed) {
        return;
      }

      stopAutoRotation();
      rotationHandlers.clear();
      isDestroyed = true;
    };

    // Start auto-rotation if configured
    if (options.autoRotate) {
      startAutoRotation();
    }

    return {
      getCurrentNonce(): string {
        if (isDestroyed) {
          throw CspError.alreadyDestroyed();
        }
        return currentNonce;
      },

      generateNonce,

      rotateNonce,

      onRotation(handler: NonceRotationHandler): CleanupFn {
        if (isDestroyed) {
          throw CspError.alreadyDestroyed();
        }

        rotationHandlers.add(handler);
        return () => rotationHandlers.delete(handler);
      },

      isAutoRotating(): boolean {
        return rotationTimer !== null;
      },

      startAutoRotation,

      stopAutoRotation,

      destroy,
    };
  },
};
