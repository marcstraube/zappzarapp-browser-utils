/**
 * RetryAfter Tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseRetryAfter } from '../../src/request/index.js';

describe('parseRetryAfter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('delta-seconds format', () => {
    it('should parse seconds into milliseconds', () => {
      expect(parseRetryAfter('120')).toBe(120000);
    });

    it('should parse zero as immediate retry', () => {
      expect(parseRetryAfter('0')).toBe(0);
    });

    it('should tolerate surrounding whitespace', () => {
      expect(parseRetryAfter('  30  ')).toBe(30000);
    });

    it('should parse large values', () => {
      expect(parseRetryAfter('86400')).toBe(86400000);
    });
  });

  describe('HTTP-date format', () => {
    it('should parse a future date as delay from now', () => {
      expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:03 GMT')).toBe(3000);
    });

    it('should clamp a past date to zero', () => {
      expect(parseRetryAfter('Wed, 31 Dec 2025 23:59:00 GMT')).toBe(0);
    });
  });

  describe('invalid values', () => {
    it('should return null for null', () => {
      expect(parseRetryAfter(null)).toBeNull();
    });

    it('should return null for empty and whitespace-only strings', () => {
      expect(parseRetryAfter('')).toBeNull();
      expect(parseRetryAfter('   ')).toBeNull();
    });

    it('should return null for non-integer numbers', () => {
      expect(parseRetryAfter('1.5')).toBeNull();
    });

    it('should return null for negative numbers', () => {
      expect(parseRetryAfter('-5')).toBeNull();
    });

    it('should return null for unparseable text', () => {
      expect(parseRetryAfter('soon')).toBeNull();
    });
  });
});
