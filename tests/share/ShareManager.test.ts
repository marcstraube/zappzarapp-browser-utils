import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { ShareManager } from '../../src/share/index.js';
import { Result, ShareError, ClipboardError } from '../../src/core/index.js';

// ===========================================================================
// Mock helpers
// ===========================================================================

function defineNavigatorProperty(name: string, value: unknown): void {
  Object.defineProperty(navigator, name, {
    value,
    configurable: true,
    writable: true,
  });
}

function deleteNavigatorProperty(name: string): void {
  Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, name);
}

/** Create an Error carrying a DOMException-style name. */
function namedError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

describe('ShareManager', () => {
  let shareMock: Mock;
  let canShareMock: Mock;
  let writeTextMock: Mock;

  beforeEach(() => {
    shareMock = vi.fn(async (): Promise<void> => {});
    canShareMock = vi.fn((): boolean => true);
    writeTextMock = vi.fn(async (): Promise<void> => {});

    defineNavigatorProperty('share', shareMock);
    defineNavigatorProperty('canShare', canShareMock);
    defineNavigatorProperty('clipboard', { writeText: writeTextMock });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    deleteNavigatorProperty('share');
    deleteNavigatorProperty('canShare');
    deleteNavigatorProperty('clipboard');
    vi.restoreAllMocks();
  });

  // =========================================================================
  // isSupported
  // =========================================================================

  describe('isSupported', () => {
    it('should return true when navigator.share exists', () => {
      expect(ShareManager.isSupported()).toBe(true);
    });

    it('should return false when navigator has no share', () => {
      deleteNavigatorProperty('share');

      expect(ShareManager.isSupported()).toBe(false);
    });

    it('should return false when navigator is undefined', () => {
      vi.stubGlobal('navigator', undefined);

      expect(ShareManager.isSupported()).toBe(false);
    });
  });

  // =========================================================================
  // canShare
  // =========================================================================

  describe('canShare', () => {
    it('should return false when the API is unavailable', () => {
      deleteNavigatorProperty('share');

      expect(ShareManager.canShare({ url: 'https://example.com' })).toBe(false);
    });

    it('should delegate to navigator.canShare', () => {
      canShareMock.mockReturnValue(false);

      expect(ShareManager.canShare({ url: 'https://example.com' })).toBe(false);
      expect(canShareMock).toHaveBeenCalledWith({ url: 'https://example.com' });
    });

    it('should assume shareable when navigator.canShare is missing', () => {
      deleteNavigatorProperty('canShare');

      expect(ShareManager.canShare({ url: 'https://example.com' })).toBe(true);
    });
  });

  // =========================================================================
  // share — native path
  // =========================================================================

  describe('share', () => {
    it('should share via the native share sheet', async () => {
      const data = { title: 'Example', url: 'https://example.com' };

      const result = await ShareManager.share(data);

      expect(shareMock).toHaveBeenCalledWith(data);
      expect(Result.unwrap(result)).toEqual({ method: 'share' });
    });

    it('should share when navigator.canShare is missing', async () => {
      deleteNavigatorProperty('canShare');

      const result = await ShareManager.share({ text: 'hello' });

      expect(Result.isOk(result)).toBe(true);
      expect(shareMock).toHaveBeenCalledWith({ text: 'hello' });
    });

    it('should return NOT_SUPPORTED error when the API is unavailable', async () => {
      deleteNavigatorProperty('share');

      const result = await ShareManager.share({ text: 'hello' });

      expect(Result.isErr(result)).toBe(true);
      const error = Result.unwrapErr(result);
      expect(error).toBeInstanceOf(ShareError);
      expect(error.code).toBe('SHARE_NOT_SUPPORTED');
    });

    it('should return INVALID_DATA error when canShare rejects the data', async () => {
      canShareMock.mockReturnValue(false);

      const result = await ShareManager.share({ text: 'hello' });

      expect(Result.unwrapErr(result).code).toBe('SHARE_INVALID_DATA');
      expect(shareMock).not.toHaveBeenCalled();
    });

    it('should return ABORTED error when the user dismisses the share sheet', async () => {
      const cause = namedError('AbortError');
      shareMock.mockRejectedValueOnce(cause);

      const result = await ShareManager.share({ text: 'hello' });

      const error = Result.unwrapErr(result);
      expect(error.code).toBe('SHARE_ABORTED');
      expect(error.cause).toBe(cause);
    });

    it('should return PERMISSION_DENIED error without transient activation', async () => {
      const cause = namedError('NotAllowedError');
      shareMock.mockRejectedValueOnce(cause);

      const result = await ShareManager.share({ text: 'hello' });

      const error = Result.unwrapErr(result);
      expect(error.code).toBe('SHARE_PERMISSION_DENIED');
      expect(error.cause).toBe(cause);
    });

    it('should return INVALID_DATA error on TypeError', async () => {
      const cause = new TypeError('invalid share data');
      shareMock.mockRejectedValueOnce(cause);

      const result = await ShareManager.share({});

      const error = Result.unwrapErr(result);
      expect(error.code).toBe('SHARE_INVALID_DATA');
      expect(error.cause).toBe(cause);
    });

    it('should return INVALID_DATA error on DataError', async () => {
      const cause = namedError('DataError');
      shareMock.mockRejectedValueOnce(cause);

      const result = await ShareManager.share({ text: 'hello' });

      expect(Result.unwrapErr(result).code).toBe('SHARE_INVALID_DATA');
    });

    it('should return SHARE_FAILED error for other exceptions', async () => {
      const cause = new Error('something else');
      shareMock.mockRejectedValueOnce(cause);

      const result = await ShareManager.share({ text: 'hello' });

      const error = Result.unwrapErr(result);
      expect(error.code).toBe('SHARE_FAILED');
      expect(error.cause).toBe(cause);
    });

    it('should return SHARE_FAILED error for non-Error rejections', async () => {
      shareMock.mockRejectedValueOnce('string rejection');

      const result = await ShareManager.share({ text: 'hello' });

      const error = Result.unwrapErr(result);
      expect(error.code).toBe('SHARE_FAILED');
      expect(error.cause).toBe('string rejection');
    });
  });

  // =========================================================================
  // share — clipboard fallback
  // =========================================================================

  describe('clipboard fallback', () => {
    beforeEach(() => {
      deleteNavigatorProperty('share');
      deleteNavigatorProperty('canShare');
    });

    it('should not fall back by default', async () => {
      const result = await ShareManager.share({ text: 'hello' });

      expect(Result.unwrapErr(result).code).toBe('SHARE_NOT_SUPPORTED');
      expect(writeTextMock).not.toHaveBeenCalled();
    });

    it('should not fall back when fallbackToClipboard is false', async () => {
      const result = await ShareManager.share({ text: 'hello' }, { fallbackToClipboard: false });

      expect(Result.unwrapErr(result).code).toBe('SHARE_NOT_SUPPORTED');
      expect(writeTextMock).not.toHaveBeenCalled();
    });

    it('should copy title, text, and url joined by newlines', async () => {
      const result = await ShareManager.share(
        { title: 'Example', text: 'Check this out', url: 'https://example.com/' },
        { fallbackToClipboard: true }
      );

      expect(writeTextMock).toHaveBeenCalledWith('Example\nCheck this out\nhttps://example.com/');
      expect(Result.unwrap(result)).toEqual({ method: 'clipboard' });
    });

    it('should skip empty and missing fields', async () => {
      const result = await ShareManager.share(
        { title: '', url: 'https://example.com/' },
        { fallbackToClipboard: true }
      );

      expect(writeTextMock).toHaveBeenCalledWith('https://example.com/');
      expect(Result.unwrap(result)).toEqual({ method: 'clipboard' });
    });

    it('should return INVALID_DATA error when there is nothing to copy', async () => {
      const file = new File(['content'], 'file.txt', { type: 'text/plain' });

      const result = await ShareManager.share({ files: [file] }, { fallbackToClipboard: true });

      expect(Result.unwrapErr(result).code).toBe('SHARE_INVALID_DATA');
      expect(writeTextMock).not.toHaveBeenCalled();
    });

    it('should reject unsafe url protocols instead of copying them', async () => {
      const result = await ShareManager.share(
        { title: 'Look', url: 'javascript:alert(1)' },
        { fallbackToClipboard: true }
      );

      const error = Result.unwrapErr(result);
      expect(error).toBeInstanceOf(ShareError);
      expect(error.code).toBe('SHARE_INVALID_DATA');
      expect(writeTextMock).not.toHaveBeenCalled();
    });

    it('should reject non-http(s) allowlist protocols like mailto', async () => {
      const result = await ShareManager.share(
        { url: 'mailto:user@example.com' },
        { fallbackToClipboard: true }
      );

      expect(Result.unwrapErr(result).code).toBe('SHARE_INVALID_DATA');
      expect(writeTextMock).not.toHaveBeenCalled();
    });

    it('should resolve relative urls against the document base like native share', async () => {
      const expected = new URL('/some/path', document.baseURI).href;

      const result = await ShareManager.share({ url: '/some/path' }, { fallbackToClipboard: true });

      expect(writeTextMock).toHaveBeenCalledWith(expected);
      expect(Result.unwrap(result)).toEqual({ method: 'clipboard' });
    });

    it('should resolve an empty url to the current page like native share', async () => {
      const expected = new URL('', document.baseURI).href;

      const result = await ShareManager.share({ url: '' }, { fallbackToClipboard: true });

      expect(writeTextMock).toHaveBeenCalledWith(expected);
      expect(Result.unwrap(result)).toEqual({ method: 'clipboard' });
    });

    it('should copy absolute urls without a document base', async () => {
      vi.stubGlobal('document', undefined);

      const result = await ShareManager.share(
        { url: 'https://example.com/page' },
        { fallbackToClipboard: true }
      );

      expect(writeTextMock).toHaveBeenCalledWith('https://example.com/page');
      expect(Result.unwrap(result)).toEqual({ method: 'clipboard' });
    });

    it('should reject relative urls without a document base', async () => {
      vi.stubGlobal('document', undefined);

      const result = await ShareManager.share({ url: '/some/path' }, { fallbackToClipboard: true });

      expect(Result.unwrapErr(result).code).toBe('SHARE_INVALID_DATA');
      expect(writeTextMock).not.toHaveBeenCalled();
    });

    it('should pass through clipboard errors', async () => {
      writeTextMock.mockRejectedValueOnce(namedError('NotAllowedError'));

      const result = await ShareManager.share({ text: 'hello' }, { fallbackToClipboard: true });

      const error = Result.unwrapErr(result);
      expect(error).toBeInstanceOf(ClipboardError);
      expect(error.code).toBe('CLIPBOARD_PERMISSION_DENIED');
    });
  });

  // =========================================================================
  // Result integration
  // =========================================================================

  describe('Result integration', () => {
    it('should work with Result.match on success', async () => {
      const result = await ShareManager.share({ text: 'hello' });

      const message = Result.match(result, {
        ok: (value) => `shared via ${value.method}`,
        err: (e) => `failed: ${e.code}`,
      });

      expect(message).toBe('shared via share');
    });

    it('should work with Result.match on error', async () => {
      deleteNavigatorProperty('share');

      const result = await ShareManager.share({ text: 'hello' });

      const message = Result.match(result, {
        ok: (value) => `shared via ${value.method}`,
        err: (e) => `failed: ${e.code}`,
      });

      expect(message).toBe('failed: SHARE_NOT_SUPPORTED');
    });
  });
});
