/**
 * Share Error for Web Share API operations.
 *
 * Returned (via Result) when sharing fails due to:
 * - Not supported (Web Share API unavailable and no fallback possible)
 * - Aborted (the user dismissed the share sheet)
 * - Permission denied (no transient activation, disallowed by policy)
 * - Invalid data (payload empty or not shareable on this platform)
 * - Share failed (any other runtime failure)
 *
 * @example
 * ```TypeScript
 * const result = await ShareManager.share({ url: 'https://example.com' });
 * if (Result.isErr(result)) {
 *   if (result.error.code === 'SHARE_ABORTED') {
 *     // User cancelled — usually not an error worth surfacing
 *   }
 * }
 * ```
 */
import { BrowserUtilsError } from './BrowserUtilsError.js';

export type ShareErrorCode =
  | 'SHARE_NOT_SUPPORTED'
  | 'SHARE_ABORTED'
  | 'SHARE_PERMISSION_DENIED'
  | 'SHARE_INVALID_DATA'
  | 'SHARE_FAILED';

export class ShareError extends BrowserUtilsError {
  readonly code: ShareErrorCode;

  constructor(code: ShareErrorCode, message: string, cause?: unknown) {
    super(message, cause);
    this.code = code;
  }

  // =========================================================================
  // Factory Methods
  // =========================================================================

  /**
   * Web Share API is not supported.
   */
  static notSupported(): ShareError {
    return new ShareError('SHARE_NOT_SUPPORTED', 'Web Share API is not supported');
  }

  /**
   * The user dismissed the share sheet without completing the share.
   */
  static aborted(cause?: unknown): ShareError {
    return new ShareError('SHARE_ABORTED', 'Share was aborted by the user', cause);
  }

  /**
   * Sharing was not allowed (e.g. missing transient activation or
   * blocked by permissions policy).
   */
  static permissionDenied(cause?: unknown): ShareError {
    return new ShareError('SHARE_PERMISSION_DENIED', 'Sharing is not allowed', cause);
  }

  /**
   * The share data is empty or cannot be shared on this platform.
   */
  static invalidData(cause?: unknown): ShareError {
    return new ShareError('SHARE_INVALID_DATA', 'Share data is invalid or not shareable', cause);
  }

  /**
   * Sharing failed for another reason.
   */
  static shareFailed(cause?: unknown): ShareError {
    return new ShareError('SHARE_FAILED', 'Failed to share', cause);
  }
}
