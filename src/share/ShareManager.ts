/**
 * Share Manager - Web Share API wrapper with clipboard fallback.
 *
 * Features:
 * - Promise-based API with Result type
 * - `isSupported()` and `canShare(data)` capability checks
 * - File sharing support (validated via `canShare`)
 * - Optional clipboard fallback when the Web Share API is unavailable
 *   (e.g. desktop Firefox); the result reports which method was used
 *
 * @example
 * ```TypeScript
 * const result = await ShareManager.share(
 *   { title: 'Example', url: 'https://example.com' },
 *   { fallbackToClipboard: true }
 * );
 * if (Result.isOk(result)) {
 *   if (result.value.method === 'clipboard') {
 *     // Tell the user the link was copied instead of shared
 *   }
 * } else if (result.error.code === 'SHARE_ABORTED') {
 *   // User dismissed the share sheet — usually nothing to do
 * }
 * ```
 */
import { Result, ShareError, type ClipboardError, type ValidationError } from '../core/index.js';
import { ClipboardManager } from '../clipboard/index.js';

/**
 * How the data was delivered: via the native share sheet or copied to
 * the clipboard by the fallback.
 */
export type ShareMethod = 'share' | 'clipboard';

/**
 * Successful outcome of {@link ShareManager.share}.
 */
export interface ShareSuccess {
  /**
   * The method that delivered the data.
   */
  readonly method: ShareMethod;
}

/**
 * Options for {@link ShareManager.share}.
 */
export interface ShareOptions {
  /**
   * Copy the textual share data (title, text, url — joined by newlines)
   * to the clipboard when the Web Share API is unavailable. Files cannot
   * be copied and are ignored by the fallback. Like the native share
   * path, the url is resolved against the document base and must be
   * http(s) — anything else is rejected as invalid data.
   *
   * Defaults to `false`.
   */
  readonly fallbackToClipboard?: boolean;
}

/**
 * Map a `navigator.share()` rejection to a ShareError.
 */
function mapShareException(e: unknown): ShareError {
  if (e instanceof Error) {
    if (e.name === 'AbortError') {
      return ShareError.aborted(e);
    }
    if (e.name === 'NotAllowedError') {
      return ShareError.permissionDenied(e);
    }
    if (e.name === 'TypeError' || e.name === 'DataError') {
      return ShareError.invalidData(e);
    }
  }
  return ShareError.shareFailed(e);
}

/**
 * Deliver the textual parts of the share data via the clipboard.
 */
/**
 * Resolve a share URL the way the native share path would: relative URLs
 * resolve against the document base, and only http(s) results are shareable
 * (never javascript:/data: URLs). Returns null when the URL is not shareable.
 */
function resolveShareUrl(url: string): string | null {
  let resolved: URL;
  try {
    resolved = typeof document === 'undefined' ? new URL(url) : new URL(url, document.baseURI);
  } catch {
    return null;
  }
  return resolved.protocol === 'http:' || resolved.protocol === 'https:' ? resolved.href : null;
}

async function shareViaClipboard(
  data: ShareData
): Promise<Result<ShareSuccess, ShareError | ClipboardError | ValidationError>> {
  let url: string | undefined;
  if (typeof data.url === 'string') {
    const resolved = resolveShareUrl(data.url);
    if (resolved === null) {
      return Result.err(ShareError.invalidData());
    }
    url = resolved;
  }

  const text = [data.title, data.text, url]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('\n');

  if (text.length === 0) {
    // Nothing the clipboard can represent (e.g. files-only payload).
    return Result.err(ShareError.invalidData());
  }

  const written = await ClipboardManager.writeText(text);
  if (Result.isErr(written)) {
    return written;
  }

  return Result.ok({ method: 'clipboard' });
}

export const ShareManager = {
  /**
   * Check whether the Web Share API is supported.
   */
  isSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  },

  /**
   * Check whether the given data can be shared on this platform.
   *
   * Returns `false` when the Web Share API is unavailable. When the
   * browser does not implement `navigator.canShare`, the data is assumed
   * to be shareable and `share()` will surface any rejection.
   */
  canShare(data: ShareData): boolean {
    if (!ShareManager.isSupported()) {
      return false;
    }
    if (typeof navigator.canShare === 'function') {
      return navigator.canShare(data);
    }
    return true;
  },

  /**
   * Share data via the native share sheet.
   *
   * With `fallbackToClipboard` enabled, the textual parts of the data are
   * copied to the clipboard instead when the Web Share API is unavailable;
   * the success value reports which {@link ShareMethod} was used.
   *
   * Must be called from a user gesture (transient activation) — browsers
   * reject programmatic share calls with `SHARE_PERMISSION_DENIED`.
   */
  async share(
    data: ShareData,
    options?: ShareOptions
  ): Promise<Result<ShareSuccess, ShareError | ClipboardError | ValidationError>> {
    if (!ShareManager.isSupported()) {
      if (options?.fallbackToClipboard === true) {
        return shareViaClipboard(data);
      }
      return Result.err(ShareError.notSupported());
    }

    if (!ShareManager.canShare(data)) {
      return Result.err(ShareError.invalidData());
    }

    try {
      await navigator.share(data);
      return Result.ok({ method: 'share' });
    } catch (e) {
      return Result.err(mapShareException(e));
    }
  },
};
