/**
 * Fullscreen - Fullscreen API wrapper.
 *
 * Features:
 * - Cross-browser support (webkit, moz prefixes)
 * - Promise-based API with Result type
 * - Event handlers with cleanup
 * - Toggle functionality
 *
 * @example
 * ```TypeScript
 * // Request fullscreen
 * const result = await Fullscreen.request(element);
 * if (Result.isErr(result)) {
 *   console.error('Failed to enter fullscreen:', result.error);
 * }
 *
 * // Exit fullscreen
 * await Fullscreen.exit();
 *
 * // Toggle fullscreen
 * await Fullscreen.toggle(element);
 *
 * // Listen for changes
 * const cleanup = Fullscreen.onChange((isFullscreen) => {
 *   console.log(isFullscreen ? 'Entered fullscreen' : 'Exited fullscreen');
 * });
 * ```
 */
import { Result, FullscreenError } from '../core/index.js';
import type { CleanupFn } from '../core/types.js';

// Extend Element and Document for vendor-prefixed APIs
interface FullscreenElement extends Element {
  webkitRequestFullscreen?: () => Promise<void>;
  mozRequestFullScreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
}

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
  mozCancelFullScreen?: () => Promise<void>;
  msExitFullscreen?: () => Promise<void>;
  webkitFullscreenEnabled?: boolean;
  mozFullScreenEnabled?: boolean;
  msFullscreenEnabled?: boolean;
}

export const Fullscreen = {
  // =========================================================================
  // Actions
  // =========================================================================

  /**
   * Request fullscreen for an element.
   * Defaults to document.documentElement if no element provided.
   */
  async request(element?: Element): Promise<Result<void, FullscreenError>> {
    if (!Fullscreen.isSupported()) {
      return Result.err(FullscreenError.notSupported());
    }

    const targetElement = (element ?? document.documentElement) as FullscreenElement;

    try {
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition -- Browser vendor prefixes
      if (targetElement.requestFullscreen) {
        await targetElement.requestFullscreen();
      } else if (targetElement.webkitRequestFullscreen) {
        await targetElement.webkitRequestFullscreen();
      } else if (targetElement.mozRequestFullScreen) {
        await targetElement.mozRequestFullScreen();
      } else if (targetElement.msRequestFullscreen) {
        await targetElement.msRequestFullscreen();
      }

      return Result.ok(undefined);
    } catch (e) {
      return Result.err(FullscreenError.requestFailed(e));
    }
  },

  /**
   * Exit fullscreen mode.
   */
  async exit(): Promise<Result<void, FullscreenError>> {
    if (!Fullscreen.isSupported()) {
      return Result.err(FullscreenError.notSupported());
    }

    if (!Fullscreen.isFullscreen()) {
      return Result.err(FullscreenError.notActive());
    }

    const doc = document as FullscreenDocument;

    try {
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition -- Browser vendor prefixes
      if (doc.exitFullscreen) {
        await doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      } else if (doc.mozCancelFullScreen) {
        await doc.mozCancelFullScreen();
      } else if (doc.msExitFullscreen) {
        await doc.msExitFullscreen();
      }

      return Result.ok(undefined);
    } catch (e) {
      return Result.err(FullscreenError.exitFailed(e));
    }
  },

  /**
   * Toggle fullscreen mode.
   */
  async toggle(element?: Element): Promise<Result<void, FullscreenError>> {
    if (Fullscreen.isFullscreen()) {
      return Fullscreen.exit();
    }
    return Fullscreen.request(element);
  },

  // =========================================================================
  // State
  // =========================================================================

  /**
   * Check if currently in fullscreen mode.
   */
  isFullscreen(): boolean {
    return Fullscreen.element() !== null;
  },

  /**
   * Get the current fullscreen element.
   */
  element(): Element | null {
    if (typeof document === 'undefined') {
      return null;
    }

    const doc = document as FullscreenDocument;

    return (
      doc.fullscreenElement ??
      doc.webkitFullscreenElement ??
      doc.mozFullScreenElement ??
      doc.msFullscreenElement ??
      null
    );
  },

  /**
   * Check if fullscreen is supported.
   */
  isSupported(): boolean {
    if (typeof document === 'undefined') {
      return false;
    }

    const doc = document as FullscreenDocument;

    return (
      doc.fullscreenEnabled ||
      doc.webkitFullscreenEnabled === true ||
      doc.mozFullScreenEnabled === true ||
      doc.msFullscreenEnabled === true ||
      typeof document.documentElement.requestFullscreen === 'function'
    );
  },

  // =========================================================================
  // Events
  // =========================================================================

  /**
   * Listen for fullscreen changes.
   * @returns Cleanup function
   */
  onChange(handler: (isFullscreen: boolean, element: Element | null) => void): CleanupFn {
    if (typeof document === 'undefined') {
      return () => {};
    }

    const eventHandler = (): void => {
      handler(Fullscreen.isFullscreen(), Fullscreen.element());
    };

    // Add listeners for all vendor prefixes
    document.addEventListener('fullscreenchange', eventHandler);
    document.addEventListener('webkitfullscreenchange', eventHandler);
    document.addEventListener('mozfullscreenchange', eventHandler);
    document.addEventListener('MSFullscreenChange', eventHandler);

    return () => {
      document.removeEventListener('fullscreenchange', eventHandler);
      document.removeEventListener('webkitfullscreenchange', eventHandler);
      document.removeEventListener('mozfullscreenchange', eventHandler);
      document.removeEventListener('MSFullscreenChange', eventHandler);
    };
  },

  /**
   * Listen for fullscreen errors.
   * @returns Cleanup function
   */
  onError(handler: (event: Event) => void): CleanupFn {
    if (typeof document === 'undefined') {
      return () => {};
    }

    // Add listeners for all vendor prefixes
    document.addEventListener('fullscreenerror', handler);
    document.addEventListener('webkitfullscreenerror', handler);
    document.addEventListener('mozfullscreenerror', handler);
    document.addEventListener('MSFullscreenError', handler);

    return () => {
      document.removeEventListener('fullscreenerror', handler);
      document.removeEventListener('webkitfullscreenerror', handler);
      document.removeEventListener('mozfullscreenerror', handler);
      document.removeEventListener('MSFullscreenError', handler);
    };
  },
};
