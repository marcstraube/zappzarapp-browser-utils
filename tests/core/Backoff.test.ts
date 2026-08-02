/**
 * Backoff Tests.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeBackoffDelay } from '../../src/core/index.js';

describe('computeBackoffDelay', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('strategies', () => {
    it('should return constant delays', () => {
      expect(computeBackoffDelay('constant', 1, 1000, 30000, false)).toBe(1000);
      expect(computeBackoffDelay('constant', 2, 1000, 30000, false)).toBe(1000);
      expect(computeBackoffDelay('constant', 5, 1000, 30000, false)).toBe(1000);
    });

    it('should return linearly increasing delays', () => {
      expect(computeBackoffDelay('linear', 1, 1000, 30000, false)).toBe(1000);
      expect(computeBackoffDelay('linear', 2, 1000, 30000, false)).toBe(2000);
      expect(computeBackoffDelay('linear', 3, 1000, 30000, false)).toBe(3000);
    });

    it('should return exponentially increasing delays', () => {
      expect(computeBackoffDelay('exponential', 1, 1000, 30000, false)).toBe(1000);
      expect(computeBackoffDelay('exponential', 2, 1000, 30000, false)).toBe(2000);
      expect(computeBackoffDelay('exponential', 3, 1000, 30000, false)).toBe(4000);
      expect(computeBackoffDelay('exponential', 4, 1000, 30000, false)).toBe(8000);
    });
  });

  describe('max delay cap', () => {
    it('should cap exponential delays at maxDelay', () => {
      expect(computeBackoffDelay('exponential', 10, 1000, 30000, false)).toBe(30000);
    });

    it('should cap linear delays at maxDelay', () => {
      expect(computeBackoffDelay('linear', 100, 1000, 5000, false)).toBe(5000);
    });
  });

  describe('jitter', () => {
    it('should multiply the delay by 0.5 when random value is 0', () => {
      vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
        if (array instanceof Uint32Array) {
          array[0] = 0;
        }
        return array;
      });

      expect(computeBackoffDelay('constant', 1, 1000, 30000, true)).toBe(500);
    });

    it('should keep the full delay when random value is max', () => {
      vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
        if (array instanceof Uint32Array) {
          array[0] = 0xffffffff;
        }
        return array;
      });

      expect(computeBackoffDelay('constant', 1, 1000, 30000, true)).toBe(1000);
    });

    it('should produce delays within the 0.5x-1x range', () => {
      for (let i = 0; i < 20; i++) {
        const delay = computeBackoffDelay('constant', 1, 1000, 30000, true);
        expect(delay).toBeGreaterThanOrEqual(500);
        expect(delay).toBeLessThanOrEqual(1000);
      }
    });

    it('should never exceed maxDelay with jitter at the cap', () => {
      for (let i = 0; i < 20; i++) {
        const delay = computeBackoffDelay('exponential', 10, 1000, 5000, true);
        expect(delay).toBeGreaterThanOrEqual(2500);
        expect(delay).toBeLessThanOrEqual(5000);
      }
    });

    it('should floor jittered delays to integers', () => {
      const delay = computeBackoffDelay('constant', 1, 333, 30000, true);
      expect(Number.isInteger(delay)).toBe(true);
    });
  });
});
