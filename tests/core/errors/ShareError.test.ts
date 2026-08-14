import { describe, it, expect } from 'vitest';
import { ShareError, BrowserUtilsError } from '../../../src/core/index.js';

describe('ShareError', () => {
  // ===========================================================================
  // instanceof Checks
  // ===========================================================================

  describe('instanceof', () => {
    it('should be instanceof BrowserUtilsError', () => {
      const error = ShareError.notSupported();

      expect(error).toBeInstanceOf(BrowserUtilsError);
    });

    it('should be instanceof ShareError', () => {
      const error = ShareError.notSupported();

      expect(error).toBeInstanceOf(ShareError);
    });

    it('should be instanceof Error', () => {
      const error = ShareError.notSupported();

      expect(error).toBeInstanceOf(Error);
    });
  });

  // ===========================================================================
  // Factory Methods
  // ===========================================================================

  describe('notSupported', () => {
    it('should create error with correct code', () => {
      const error = ShareError.notSupported();

      expect(error.code).toBe('SHARE_NOT_SUPPORTED');
    });

    it('should create error with correct message', () => {
      const error = ShareError.notSupported();

      expect(error.message).toBe('Web Share API is not supported');
    });

    it('should have name set to ShareError', () => {
      const error = ShareError.notSupported();

      expect(error.name).toBe('ShareError');
    });
  });

  describe('aborted', () => {
    it('should create error with correct code', () => {
      const error = ShareError.aborted();

      expect(error.code).toBe('SHARE_ABORTED');
    });

    it('should create error with correct message', () => {
      const error = ShareError.aborted();

      expect(error.message).toBe('Share was aborted by the user');
    });

    it('should preserve the cause', () => {
      const cause = new Error('AbortError');
      const error = ShareError.aborted(cause);

      expect(error.cause).toBe(cause);
    });
  });

  describe('permissionDenied', () => {
    it('should create error with correct code', () => {
      const error = ShareError.permissionDenied();

      expect(error.code).toBe('SHARE_PERMISSION_DENIED');
    });

    it('should create error with correct message', () => {
      const error = ShareError.permissionDenied();

      expect(error.message).toBe('Sharing is not allowed');
    });

    it('should preserve the cause', () => {
      const cause = new Error('NotAllowedError');
      const error = ShareError.permissionDenied(cause);

      expect(error.cause).toBe(cause);
    });
  });

  describe('invalidData', () => {
    it('should create error with correct code', () => {
      const error = ShareError.invalidData();

      expect(error.code).toBe('SHARE_INVALID_DATA');
    });

    it('should create error with correct message', () => {
      const error = ShareError.invalidData();

      expect(error.message).toBe('Share data is invalid or not shareable');
    });

    it('should preserve the cause', () => {
      const cause = new TypeError('invalid data');
      const error = ShareError.invalidData(cause);

      expect(error.cause).toBe(cause);
    });
  });

  describe('shareFailed', () => {
    it('should create error with correct code', () => {
      const error = ShareError.shareFailed();

      expect(error.code).toBe('SHARE_FAILED');
    });

    it('should create error with correct message', () => {
      const error = ShareError.shareFailed();

      expect(error.message).toBe('Failed to share');
    });

    it('should preserve the cause', () => {
      const cause = new Error('unknown failure');
      const error = ShareError.shareFailed(cause);

      expect(error.cause).toBe(cause);
    });
  });
});
