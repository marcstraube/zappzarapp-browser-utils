/**
 * Clipboard Manager - Modern clipboard API wrapper with fallbacks.
 *
 * Features:
 * - Async Clipboard API support
 * - Fallback to execCommand for older browsers
 * - Permission checking
 * - Text length validation (prevents memory issues)
 * - Result-based error handling
 *
 * @example
 * ```TypeScript
 * // Write text to clipboard
 * const result = await ClipboardManager.writeText('Hello, World!');
 * if (Result.isOk(result)) {
 *   console.log('Copied!');
 * }
 *
 * // Read text from clipboard
 * const readResult = await ClipboardManager.readText();
 * if (Result.isOk(readResult)) {
 *   console.log('Clipboard:', readResult.value);
 * }
 *
 * // Check support
 * if (ClipboardManager.isWriteSupported()) {
 *   // Can write to clipboard
 * }
 * ```
 */
import { Result, ClipboardError, Validator, ValidationError } from '../core/index.js';

export const ClipboardManager = {
  // =========================================================================
  // Write Operations
  // =========================================================================

  /**
   * Write text to clipboard.
   * Uses modern Clipboard API with execCommand fallback.
   */
  async writeText(text: string): Promise<Result<void, ClipboardError | ValidationError>> {
    // Validate text length
    const textResult = Validator.clipboardTextResult(text);
    if (Result.isErr(textResult)) {
      return textResult;
    }

    // Try modern API first
    if (ClipboardManager.isWriteSupported()) {
      try {
        await navigator.clipboard.writeText(text);
        return Result.ok(undefined);
      } catch (e) {
        // Check if permission denied
        if (e instanceof Error && e.name === 'NotAllowedError') {
          return Result.err(ClipboardError.permissionDenied('writeText'));
        }
        return Result.err(ClipboardError.writeFailed(e));
      }
    }

    // Fallback to execCommand
    return ClipboardManager.writeTextFallback(text);
  },

  /**
   * Write arbitrary data to clipboard.
   * @param data ClipboardItem or array of ClipboardItems
   */
  async write(data: ClipboardItem | ClipboardItem[]): Promise<Result<void, ClipboardError>> {
    if (!ClipboardManager.isWriteSupported()) {
      return Result.err(ClipboardError.notSupported('write'));
    }

    try {
      const items = Array.isArray(data) ? data : [data];
      await navigator.clipboard.write(items);
      return Result.ok(undefined);
    } catch (e) {
      if (e instanceof Error && e.name === 'NotAllowedError') {
        return Result.err(ClipboardError.permissionDenied('write'));
      }
      return Result.err(ClipboardError.writeFailed(e));
    }
  },

  // =========================================================================
  // Read Operations
  // =========================================================================

  /**
   * Read text from clipboard.
   * Requires permission (browser will prompt if needed).
   */
  async readText(): Promise<Result<string, ClipboardError>> {
    if (!ClipboardManager.isReadSupported()) {
      return Result.err(ClipboardError.notSupported('readText'));
    }

    try {
      const text = await navigator.clipboard.readText();
      return Result.ok(text);
    } catch (e) {
      if (e instanceof Error && e.name === 'NotAllowedError') {
        return Result.err(ClipboardError.permissionDenied('readText'));
      }
      return Result.err(ClipboardError.readFailed(e));
    }
  },

  /**
   * Read arbitrary data from clipboard.
   * Returns array of ClipboardItems.
   */
  async read(): Promise<Result<ClipboardItems, ClipboardError>> {
    if (!ClipboardManager.isReadSupported()) {
      return Result.err(ClipboardError.notSupported('read'));
    }

    try {
      const items = await navigator.clipboard.read();
      return Result.ok(items);
    } catch (e) {
      if (e instanceof Error && e.name === 'NotAllowedError') {
        return Result.err(ClipboardError.permissionDenied('read'));
      }
      return Result.err(ClipboardError.readFailed(e));
    }
  },

  // =========================================================================
  // Support Detection
  // =========================================================================

  /**
   * Check if clipboard API is supported at all.
   */
  isSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.clipboard !== 'undefined';
  },

  /**
   * Check if writing to clipboard is supported.
   */
  isWriteSupported(): boolean {
    return ClipboardManager.isSupported() && typeof navigator.clipboard.writeText === 'function';
  },

  /**
   * Check if reading from clipboard is supported.
   */
  isReadSupported(): boolean {
    return ClipboardManager.isSupported() && typeof navigator.clipboard.readText === 'function';
  },

  /**
   * Check clipboard-write permission status.
   * @returns 'granted' | 'denied' | 'prompt' | 'unsupported'
   */
  async checkWritePermission(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
    if (typeof navigator === 'undefined' || typeof navigator.permissions === 'undefined') {
      return 'unsupported';
    }

    try {
      // clipboard-write is usually auto-granted in secure contexts
      const result = await navigator.permissions.query({
        name: 'clipboard-write' as PermissionName,
      });
      return result.state;
    } catch {
      // Some browsers don't support clipboard-write permission query
      return 'unsupported';
    }
  },

  /**
   * Check clipboard-read permission status.
   * @returns 'granted' | 'denied' | 'prompt' | 'unsupported'
   */
  async checkReadPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
    if (typeof navigator === 'undefined' || typeof navigator.permissions === 'undefined') {
      return 'unsupported';
    }

    try {
      const result = await navigator.permissions.query({
        name: 'clipboard-read' as PermissionName,
      });
      return result.state;
    } catch {
      return 'unsupported';
    }
  },

  // =========================================================================
  // Fallback Implementation
  // =========================================================================

  /**
   * Fallback using execCommand for older browsers.
   * @internal
   */
  writeTextFallback(text: string): Result<void, ClipboardError> {
    if (typeof document === 'undefined') {
      return Result.err(ClipboardError.notSupported('writeText'));
    }

    try {
      // Create temporary textarea
      const textarea = document.createElement('textarea');
      textarea.value = text;

      // Avoid scrolling to bottom
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';

      document.body.appendChild(textarea);

      try {
        textarea.focus();
        textarea.select();

        // noinspection JSDeprecatedSymbols - Legacy fallback for older browsers
        const success = document.execCommand('copy');

        if (!success) {
          return Result.err(ClipboardError.writeFailed(new Error('execCommand returned false')));
        }

        return Result.ok(undefined);
      } finally {
        document.body.removeChild(textarea);
      }
    } catch (e) {
      return Result.err(ClipboardError.writeFailed(e));
    }
  },
};
