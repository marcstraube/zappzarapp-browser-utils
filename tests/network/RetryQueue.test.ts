import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RetryQueue, type CircuitState } from '../../src/network/index.js';
import { NetworkError } from '../../src/core/index.js';

describe('RetryQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();

    // Mock navigator.onLine as online by default
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Factory Methods
  // ===========================================================================

  describe('create', () => {
    it('should create queue with default options', () => {
      const queue = RetryQueue.create();

      expect(queue).toBeInstanceOf(RetryQueue);
    });

    it('should create queue with custom maxRetries', () => {
      const queue = RetryQueue.create({ maxRetries: 5 });

      expect(queue.getStats().pending).toBe(0);
    });

    it('should create queue with exponential backoff', () => {
      const queue = RetryQueue.create({ backoff: 'exponential' });

      expect(queue).toBeInstanceOf(RetryQueue);
    });

    it('should create queue with linear backoff', () => {
      const queue = RetryQueue.create({ backoff: 'linear' });

      expect(queue).toBeInstanceOf(RetryQueue);
    });

    it('should create queue with constant backoff', () => {
      const queue = RetryQueue.create({ backoff: 'constant' });

      expect(queue).toBeInstanceOf(RetryQueue);
    });

    it('should create queue with custom baseDelay', () => {
      const queue = RetryQueue.create({ baseDelay: 500 });

      expect(queue).toBeInstanceOf(RetryQueue);
    });

    it('should create queue with custom maxDelay', () => {
      const queue = RetryQueue.create({ maxDelay: 60000 });

      expect(queue).toBeInstanceOf(RetryQueue);
    });

    it('should create queue with networkAware disabled', () => {
      const queue = RetryQueue.create({ networkAware: false });

      expect(queue).toBeInstanceOf(RetryQueue);
    });

    it('should create queue with jitter disabled', () => {
      const queue = RetryQueue.create({ jitter: false });

      expect(queue).toBeInstanceOf(RetryQueue);
    });

    it('should create queue with all custom options', () => {
      const queue = RetryQueue.create({
        maxRetries: 10,
        backoff: 'linear',
        baseDelay: 2000,
        maxDelay: 120000,
        networkAware: false,
        jitter: false,
      });

      expect(queue).toBeInstanceOf(RetryQueue);
    });

    it('should throw NetworkError when baseDelay is 0', () => {
      expect(() => RetryQueue.create({ baseDelay: 0, networkAware: false })).toThrow(NetworkError);
    });

    it('should throw NetworkError when baseDelay is negative', () => {
      expect(() => RetryQueue.create({ baseDelay: -1, networkAware: false })).toThrow(NetworkError);
    });

    it('should throw NetworkError when maxDelay is 0', () => {
      expect(() => RetryQueue.create({ maxDelay: 0, networkAware: false })).toThrow(NetworkError);
    });

    it('should throw NetworkError when maxDelay is negative', () => {
      expect(() => RetryQueue.create({ maxDelay: -100, networkAware: false })).toThrow(
        NetworkError
      );
    });
  });

  // ===========================================================================
  // Queue Operations - add
  // ===========================================================================

  describe('add', () => {
    it('should execute operation and return result', async () => {
      const queue = RetryQueue.create({ networkAware: false });

      const promise = queue.add(async () => 'success');
      await vi.runAllTimersAsync();

      await expect(promise).resolves.toBe('success');
    });

    it('should handle async operations', async () => {
      const queue = RetryQueue.create({ networkAware: false });

      const promise = queue.add(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 42;
      });
      await vi.runAllTimersAsync();

      await expect(promise).resolves.toBe(42);
    });

    it('should process multiple operations in order', async () => {
      const queue = RetryQueue.create({ networkAware: false });
      const order: number[] = [];

      const p1 = queue.add(async () => {
        order.push(1);
        return 1;
      });
      const p2 = queue.add(async () => {
        order.push(2);
        return 2;
      });
      const p3 = queue.add(async () => {
        order.push(3);
        return 3;
      });

      await vi.runAllTimersAsync();
      await Promise.all([p1, p2, p3]);

      expect(order).toEqual([1, 2, 3]);
    });

    it('should retry failed operations', async () => {
      const queue = RetryQueue.create({
        maxRetries: 3,
        backoff: 'constant',
        baseDelay: 100,
        jitter: false,
        networkAware: false,
      });

      let attempts = 0;
      const promise = queue.add(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      await vi.runAllTimersAsync();

      await expect(promise).resolves.toBe('success');
      expect(attempts).toBe(3);
    });

    it('should reject after maxRetries exceeded', async () => {
      const queue = RetryQueue.create({
        maxRetries: 2,
        backoff: 'constant',
        baseDelay: 100,
        jitter: false,
        networkAware: false,
      });

      const promise = queue.add(async () => {
        throw new Error('Always fails');
      });

      // Create the assertion promise before running timers to attach a handler
      const assertionPromise = expect(promise).rejects.toBeInstanceOf(NetworkError);

      await vi.runAllTimersAsync();

      await assertionPromise;
    });

    it('should include attempts in NetworkError when max retries exceeded', async () => {
      const queue = RetryQueue.create({
        maxRetries: 3,
        backoff: 'constant',
        baseDelay: 100,
        jitter: false,
        networkAware: false,
      });

      // Capture the error with immediate .catch() to prevent unhandled rejection
      let caughtError: NetworkError | undefined;
      const promise = queue
        .add(async () => {
          throw new Error('Fail');
        })
        .catch((error: NetworkError) => {
          caughtError = error;
        });

      await vi.runAllTimersAsync();
      await promise;

      expect(caughtError).toBeInstanceOf(NetworkError);
      expect(caughtError?.code).toBe('NETWORK_MAX_RETRIES');
      // attempts includes initial attempt + retries = maxRetries + 1
      expect(caughtError?.attempts).toBe(4);
    });

    it('should include original error as cause', async () => {
      const queue = RetryQueue.create({
        maxRetries: 1,
        backoff: 'constant',
        baseDelay: 100,
        jitter: false,
        networkAware: false,
      });

      const originalError = new Error('Original error');

      // Add a rejection handler immediately to prevent unhandled rejection
      let caughtError: NetworkError | undefined;
      const promise = queue
        .add(async () => {
          throw originalError;
        })
        .catch((error: NetworkError) => {
          caughtError = error;
        });

      // Run all timers to process retries
      await vi.runAllTimersAsync();
      await promise;

      // Verify the caught error has the original cause
      expect(caughtError).toBeInstanceOf(NetworkError);
      expect(caughtError?.code).toBe('NETWORK_MAX_RETRIES');
      expect(caughtError?.cause).toBe(originalError);
    });
  });

  // ===========================================================================
  // Queue Operations - pause/resume
  // ===========================================================================

  describe('pause', () => {
    it('should pause queue processing', async () => {
      const queue = RetryQueue.create({ networkAware: false });

      queue.pause();

      // noinspection JSVoidFunctionReturnValueUsed
      const executed = vi.fn();
      queue.add(async () => {
        executed();
        return 'result';
      });

      await vi.runAllTimersAsync();

      expect(executed).not.toHaveBeenCalled();
      expect(queue.isPaused()).toBe(true);
    });

    it('should set paused state to true', () => {
      const queue = RetryQueue.create({ networkAware: false });

      queue.pause();

      expect(queue.getStats().paused).toBe(true);
    });

    it('should keep items in queue while paused', async () => {
      const queue = RetryQueue.create({ networkAware: false });

      queue.pause();
      // Add catch handlers to prevent unhandled rejection on cleanup
      const p1 = queue.add(async () => 'item1').catch(() => {});
      const p2 = queue.add(async () => 'item2').catch(() => {});

      await vi.runAllTimersAsync();

      expect(queue.getStats().pending).toBe(2);

      // Clean up
      queue.clear();
      await Promise.all([p1, p2]);
    });
  });

  describe('resume', () => {
    it('should resume queue processing', async () => {
      const queue = RetryQueue.create({ networkAware: false });

      queue.pause();

      // noinspection JSVoidFunctionReturnValueUsed
      const executed = vi.fn().mockReturnValue('result');
      const promise = queue.add(async () => executed());

      await vi.runAllTimersAsync();
      expect(executed).not.toHaveBeenCalled();

      queue.resume();
      await vi.runAllTimersAsync();

      expect(executed).toHaveBeenCalled();
      await expect(promise).resolves.toBe('result');
    });

    it('should set paused state to false', () => {
      const queue = RetryQueue.create({ networkAware: false });

      queue.pause();
      queue.resume();

      expect(queue.getStats().paused).toBe(false);
    });

    it('should process all pending items after resume', async () => {
      const queue = RetryQueue.create({ networkAware: false });
      const results: number[] = [];

      queue.pause();

      const p1 = queue.add(async () => {
        results.push(1);
        return 1;
      });
      const p2 = queue.add(async () => {
        results.push(2);
        return 2;
      });

      await vi.runAllTimersAsync();
      expect(results).toEqual([]);

      queue.resume();
      await vi.runAllTimersAsync();

      await Promise.all([p1, p2]);
      expect(results).toEqual([1, 2]);
    });
  });

  // ===========================================================================
  // Queue Operations - clear
  // ===========================================================================

  describe('clear', () => {
    it('should remove all pending operations', async () => {
      const queue = RetryQueue.create({ networkAware: false });

      queue.pause();
      // Add catch handlers to prevent unhandled rejection warnings
      queue.add(async () => 'item1').catch(() => {});
      queue.add(async () => 'item2').catch(() => {});

      expect(queue.getStats().pending).toBe(2);

      queue.clear();

      expect(queue.getStats().pending).toBe(0);
    });

    it('should reject all pending promises with NetworkError', async () => {
      const queue = RetryQueue.create({ networkAware: false });

      queue.pause();

      const p1 = queue.add(async () => 'item1');
      const p2 = queue.add(async () => 'item2');

      queue.clear();

      await expect(p1).rejects.toBeInstanceOf(NetworkError);
      await expect(p2).rejects.toBeInstanceOf(NetworkError);
    });

    it('should reject with NETWORK_ABORTED code', async () => {
      const queue = RetryQueue.create({ networkAware: false });

      queue.pause();
      const promise = queue.add(async () => 'item');

      queue.clear();

      try {
        await promise;
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as NetworkError).code).toBe('NETWORK_ABORTED');
      }
    });
  });

  // ===========================================================================
  // Queue Operations - destroy
  // ===========================================================================

  describe('destroy', () => {
    it('should clear all pending operations', async () => {
      const queue = RetryQueue.create({ networkAware: false });

      queue.pause();
      // Add catch handler to prevent unhandled rejection
      const promise = queue.add(async () => 'item').catch(() => {});

      queue.destroy();

      expect(queue.getStats().pending).toBe(0);
      await promise;
    });

    it('should reject pending promises', async () => {
      const queue = RetryQueue.create({ networkAware: false });

      queue.pause();
      const promise = queue.add(async () => 'item');

      queue.destroy();

      await expect(promise).rejects.toBeInstanceOf(NetworkError);
    });

    it('should clean up network listeners', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      const queue = RetryQueue.create({ networkAware: true });

      queue.destroy();

      // Should have removed the online event listener
      expect(removeSpy).toHaveBeenCalled();
    });

    it('should clear retry handlers', async () => {
      const queue = RetryQueue.create({
        maxRetries: 1,
        backoff: 'constant',
        baseDelay: 100,
        jitter: false,
        networkAware: false,
      });

      // noinspection JSVoidFunctionReturnValueUsed
      const retryHandler = vi.fn();
      queue.onRetry(retryHandler);

      queue.destroy();

      // Add new operation to new queue to verify handlers were cleared
      const queue2 = RetryQueue.create({
        maxRetries: 1,
        backoff: 'constant',
        baseDelay: 100,
        jitter: false,
        networkAware: false,
      });

      // Catch expected rejection
      const promise = queue2
        .add(async () => {
          throw new Error('Fail');
        })
        .catch(() => {});

      await vi.runAllTimersAsync();
      await promise;

      // Original handler should not be called on new queue
      expect(retryHandler).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Event Handlers
  // ===========================================================================

  describe('onRetry', () => {
    it('should call handler on each retry attempt', async () => {
      const queue = RetryQueue.create({
        maxRetries: 3,
        backoff: 'constant',
        baseDelay: 100,
        jitter: false,
        networkAware: false,
      });

      // noinspection JSVoidFunctionReturnValueUsed
      const retryHandler = vi.fn();
      queue.onRetry(retryHandler);

      let attempts = 0;
      queue.add(async () => {
        attempts++;
        if (attempts <= 3) {
          throw new Error(`Attempt ${attempts}`);
        }
        return 'success';
      });

      await vi.runAllTimersAsync();

      expect(retryHandler).toHaveBeenCalledTimes(3);
    });

    it('should provide attempt number and error', async () => {
      const queue = RetryQueue.create({
        maxRetries: 2,
        backoff: 'constant',
        baseDelay: 100,
        jitter: false,
        networkAware: false,
      });

      // noinspection JSVoidFunctionReturnValueUsed
      const retryHandler = vi.fn();
      queue.onRetry(retryHandler);

      const testError = new Error('Test error');
      // Add immediate .catch() to prevent unhandled rejection
      const promise = queue
        .add(async () => {
          throw testError;
        })
        .catch(() => {});

      await vi.runAllTimersAsync();
      await promise;

      expect(retryHandler).toHaveBeenNthCalledWith(1, 1, testError);
      expect(retryHandler).toHaveBeenNthCalledWith(2, 2, testError);
    });

    it('should return cleanup function', async () => {
      const queue = RetryQueue.create({
        maxRetries: 2,
        backoff: 'constant',
        baseDelay: 100,
        jitter: false,
        networkAware: false,
      });

      // noinspection JSVoidFunctionReturnValueUsed
      const retryHandler = vi.fn();
      const cleanup = queue.onRetry(retryHandler);

      cleanup();

      // Catch expected rejection (don't await - let timers handle it)
      queue
        .add(async () => {
          throw new Error('Fail');
        })
        .catch(() => {});

      await vi.runAllTimersAsync();

      expect(retryHandler).not.toHaveBeenCalled();
    });

    it('should support multiple handlers', async () => {
      const queue = RetryQueue.create({
        maxRetries: 1,
        backoff: 'constant',
        baseDelay: 100,
        jitter: false,
        networkAware: false,
      });

      // noinspection JSVoidFunctionReturnValueUsed
      const handler1 = vi.fn();
      // noinspection JSVoidFunctionReturnValueUsed
      const handler2 = vi.fn();

      queue.onRetry(handler1);
      queue.onRetry(handler2);

      // Catch expected rejection (don't await - let timers handle it)
      queue
        .add(async () => {
          throw new Error('Fail');
        })
        .catch(() => {});

      await vi.runAllTimersAsync();

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should continue processing if handler throws', async () => {
      const queue = RetryQueue.create({
        maxRetries: 2,
        backoff: 'constant',
        baseDelay: 100,
        jitter: false,
        networkAware: false,
      });

      // noinspection JSVoidFunctionReturnValueUsed
      const errorHandler = vi.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });
      // noinspection JSVoidFunctionReturnValueUsed
      const normalHandler = vi.fn();

      queue.onRetry(errorHandler);
      queue.onRetry(normalHandler);

      let attempts = 0;
      const promise = queue.add(async () => {
        attempts++;
        if (attempts <= 2) {
          throw new Error('Fail');
        }
        return 'success';
      });

      await vi.runAllTimersAsync();

      // Both handlers should be called despite first one throwing
      expect(errorHandler).toHaveBeenCalled();
      expect(normalHandler).toHaveBeenCalled();
      await expect(promise).resolves.toBe('success');
    });
  });

  // ===========================================================================
  // Statistics
  // ===========================================================================

  describe('getStats', () => {
    it('should return correct pending count', async () => {
      const queue = RetryQueue.create({ networkAware: false });

      queue.pause();
      const promises = [
        queue.add(async () => 'item1').catch(() => {}),
        queue.add(async () => 'item2').catch(() => {}),
        queue.add(async () => 'item3').catch(() => {}),
      ];

      const stats = queue.getStats();

      expect(stats.pending).toBe(3);

      // Clean up
      queue.clear();
      await Promise.all(promises);
    });

    it('should return correct succeeded count', async () => {
      const queue = RetryQueue.create({ networkAware: false });

      queue.add(async () => 'item1');
      queue.add(async () => 'item2');

      await vi.runAllTimersAsync();

      const stats = queue.getStats();

      expect(stats.succeeded).toBe(2);
    });

    it('should return correct failed count', async () => {
      const queue = RetryQueue.create({
        maxRetries: 0,
        networkAware: false,
      });

      // Catch the expected rejections
      const p1 = queue
        .add(async () => {
          throw new Error('Fail 1');
        })
        .catch(() => {});
      const p2 = queue
        .add(async () => {
          throw new Error('Fail 2');
        })
        .catch(() => {});

      await vi.runAllTimersAsync();
      await Promise.all([p1, p2]);

      const stats = queue.getStats();

      expect(stats.failed).toBe(2);
    });

    it('should return correct retries count', async () => {
      const queue = RetryQueue.create({
        maxRetries: 3,
        backoff: 'constant',
        baseDelay: 100,
        jitter: false,
        networkAware: false,
      });

      let attempts = 0;
      queue.add(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Retry');
        }
        return 'success';
      });

      await vi.runAllTimersAsync();

      const stats = queue.getStats();

      expect(stats.retries).toBe(2);
    });

    it('should return correct paused state', () => {
      const queue = RetryQueue.create({ networkAware: false });

      expect(queue.getStats().paused).toBe(false);

      queue.pause();
      expect(queue.getStats().paused).toBe(true);

      queue.resume();
      expect(queue.getStats().paused).toBe(false);
    });

    it('should return all required properties', () => {
      const queue = RetryQueue.create({ networkAware: false });

      const stats = queue.getStats();

      expect(stats).toHaveProperty('pending');
      expect(stats).toHaveProperty('succeeded');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('retries');
      expect(stats).toHaveProperty('paused');
    });
  });

  describe('isPaused', () => {
    it('should return false by default', () => {
      const queue = RetryQueue.create({ networkAware: false });

      expect(queue.isPaused()).toBe(false);
    });

    it('should return true after pause', () => {
      const queue = RetryQueue.create({ networkAware: false });

      queue.pause();

      expect(queue.isPaused()).toBe(true);
    });

    it('should return false after resume', () => {
      const queue = RetryQueue.create({ networkAware: false });

      queue.pause();
      queue.resume();

      expect(queue.isPaused()).toBe(false);
    });
  });

  describe('isEmpty', () => {
    it('should return true when queue is empty', () => {
      const queue = RetryQueue.create({ networkAware: false });

      expect(queue.isEmpty()).toBe(true);
    });

    it('should return false when queue has items', async () => {
      const queue = RetryQueue.create({ networkAware: false });

      queue.pause();
      const promise = queue.add(async () => 'item').catch(() => {});

      expect(queue.isEmpty()).toBe(false);

      // Clean up
      queue.clear();
      await promise;
    });

    it('should return true after all items processed', async () => {
      const queue = RetryQueue.create({ networkAware: false });

      queue.add(async () => 'item');

      await vi.runAllTimersAsync();

      expect(queue.isEmpty()).toBe(true);
    });
  });

  // ===========================================================================
  // Backoff Strategies
  // ===========================================================================

  describe('Backoff Strategies', () => {
    describe('exponential backoff', () => {
      it('should double delay with each retry', async () => {
        const delays: number[] = [];
        const originalSetTimeout = globalThis.setTimeout;

        vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms) => {
          if (typeof ms === 'number' && ms > 0) {
            delays.push(ms);
          }
          return originalSetTimeout(fn, ms) as unknown as ReturnType<typeof setTimeout>;
        });

        const queue = RetryQueue.create({
          maxRetries: 3,
          backoff: 'exponential',
          baseDelay: 1000,
          maxDelay: 30000,
          jitter: false,
          networkAware: false,
        });

        let attempts = 0;
        queue.add(async () => {
          attempts++;
          if (attempts <= 3) {
            throw new Error('Fail');
          }
          return 'success';
        });

        await vi.runAllTimersAsync();

        // Exponential: 1000, 2000, 4000
        expect(delays).toEqual([1000, 2000, 4000]);
      });

      it('should respect maxDelay cap', async () => {
        const delays: number[] = [];
        const originalSetTimeout = globalThis.setTimeout;

        vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms) => {
          if (typeof ms === 'number' && ms > 0) {
            delays.push(ms);
          }
          return originalSetTimeout(fn, ms) as unknown as ReturnType<typeof setTimeout>;
        });

        const queue = RetryQueue.create({
          maxRetries: 5,
          backoff: 'exponential',
          baseDelay: 1000,
          maxDelay: 5000,
          jitter: false,
          networkAware: false,
        });

        let attempts = 0;
        queue.add(async () => {
          attempts++;
          if (attempts <= 5) {
            throw new Error('Fail');
          }
          return 'success';
        });

        await vi.runAllTimersAsync();

        // Exponential with cap: 1000, 2000, 4000, 5000 (capped), 5000 (capped)
        expect(delays).toEqual([1000, 2000, 4000, 5000, 5000]);
      });
    });

    describe('linear backoff', () => {
      it('should increase delay linearly', async () => {
        const delays: number[] = [];
        const originalSetTimeout = globalThis.setTimeout;

        vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms) => {
          if (typeof ms === 'number' && ms > 0) {
            delays.push(ms);
          }
          return originalSetTimeout(fn, ms) as unknown as ReturnType<typeof setTimeout>;
        });

        const queue = RetryQueue.create({
          maxRetries: 3,
          backoff: 'linear',
          baseDelay: 1000,
          maxDelay: 30000,
          jitter: false,
          networkAware: false,
        });

        let attempts = 0;
        queue.add(async () => {
          attempts++;
          if (attempts <= 3) {
            throw new Error('Fail');
          }
          return 'success';
        });

        await vi.runAllTimersAsync();

        // Linear: 1000, 2000, 3000
        expect(delays).toEqual([1000, 2000, 3000]);
      });
    });

    describe('constant backoff', () => {
      it('should use same delay for all retries', async () => {
        const delays: number[] = [];
        const originalSetTimeout = globalThis.setTimeout;

        vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms) => {
          if (typeof ms === 'number' && ms > 0) {
            delays.push(ms);
          }
          return originalSetTimeout(fn, ms) as unknown as ReturnType<typeof setTimeout>;
        });

        const queue = RetryQueue.create({
          maxRetries: 3,
          backoff: 'constant',
          baseDelay: 1000,
          maxDelay: 30000,
          jitter: false,
          networkAware: false,
        });

        let attempts = 0;
        queue.add(async () => {
          attempts++;
          if (attempts <= 3) {
            throw new Error('Fail');
          }
          return 'success';
        });

        await vi.runAllTimersAsync();

        // Constant: 1000, 1000, 1000
        expect(delays).toEqual([1000, 1000, 1000]);
      });
    });

    describe('jitter', () => {
      it('should apply jitter when enabled', async () => {
        const delays: number[] = [];
        const originalSetTimeout = globalThis.setTimeout;

        vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms) => {
          if (typeof ms === 'number' && ms > 0) {
            delays.push(ms);
          }
          return originalSetTimeout(fn, ms) as unknown as ReturnType<typeof setTimeout>;
        });

        // Mock crypto.getRandomValues to return 0.5 equivalent
        // The code does: buffer[0] / 0xffffffff
        // To get 0.5: buffer[0] = 0x80000000 (half of 0xffffffff + 1)
        vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
          if (array instanceof Uint32Array) {
            array[0] = 0x80000000; // ~0.5
          }
          return array;
        });

        const queue = RetryQueue.create({
          maxRetries: 2,
          backoff: 'constant',
          baseDelay: 1000,
          jitter: true,
          networkAware: false,
        });

        let attempts = 0;
        queue.add(async () => {
          attempts++;
          if (attempts <= 2) {
            throw new Error('Fail');
          }
          return 'success';
        });

        await vi.runAllTimersAsync();

        // With equal jitter: delay * (0.5 + 0.5 * 0.5) = delay * 0.75 = 750
        expect(delays).toEqual([750, 750]);
      });

      it('should produce delays in expected range with jitter', async () => {
        const delays: number[] = [];
        const originalSetTimeout = globalThis.setTimeout;

        vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms) => {
          if (typeof ms === 'number' && ms > 0) {
            delays.push(ms);
          }
          return originalSetTimeout(fn, ms) as unknown as ReturnType<typeof setTimeout>;
        });

        // Mock crypto.getRandomValues to return 0 (minimum jitter)
        vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
          if (array instanceof Uint32Array) {
            array[0] = 0; // Results in 0 random value
          }
          return array;
        });

        const queue = RetryQueue.create({
          maxRetries: 1,
          backoff: 'constant',
          baseDelay: 1000,
          jitter: true,
          networkAware: false,
        });

        // Add immediate .catch() to prevent unhandled rejection
        const promise = queue
          .add(async () => {
            throw new Error('Fail');
          })
          .catch(() => {});

        await vi.runAllTimersAsync();
        await promise;

        // With jitter and random=0: delay * 0.5 = 500
        expect(delays[0]).toBe(500);
      });
    });

    describe('Retry-After hint', () => {
      /**
       * Collect retry delays passed to setTimeout.
       */
      function trackDelays(): number[] {
        const delays: number[] = [];
        const originalSetTimeout = globalThis.setTimeout;

        vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms) => {
          if (typeof ms === 'number' && ms > 0) {
            delays.push(ms);
          }
          return originalSetTimeout(fn, ms) as unknown as ReturnType<typeof setTimeout>;
        });

        return delays;
      }

      it('should use retryAfterMs from the thrown error instead of backoff', async () => {
        const delays = trackDelays();
        const queue = RetryQueue.create({
          maxRetries: 1,
          baseDelay: 1000,
          jitter: true,
          networkAware: false,
        });

        let attempts = 0;
        const promise = queue.add(async () => {
          attempts++;
          if (attempts === 1) {
            throw Object.assign(new Error('Rate limited'), { retryAfterMs: 5000 });
          }
          return 'success';
        });

        await vi.runAllTimersAsync();

        await expect(promise).resolves.toBe('success');
        // Server-provided delay is used verbatim - no jitter applied
        expect(delays).toEqual([5000]);
      });

      it('should cap retryAfterMs at maxDelay', async () => {
        const delays = trackDelays();
        const queue = RetryQueue.create({
          maxRetries: 1,
          baseDelay: 1000,
          maxDelay: 30000,
          jitter: false,
          networkAware: false,
        });

        let attempts = 0;
        const promise = queue.add(async () => {
          attempts++;
          if (attempts === 1) {
            throw Object.assign(new Error('Rate limited'), { retryAfterMs: 90000 });
          }
          return 'success';
        });

        await vi.runAllTimersAsync();

        await expect(promise).resolves.toBe('success');
        expect(delays).toEqual([30000]);
      });

      it('should fall back to backoff for invalid retryAfterMs values', async () => {
        const delays = trackDelays();
        const queue = RetryQueue.create({
          maxRetries: 4,
          backoff: 'constant',
          baseDelay: 1000,
          jitter: false,
          networkAware: false,
        });

        const invalidHints: unknown[] = [-1, Number.NaN, Number.POSITIVE_INFINITY, '5000'];
        let attempts = 0;
        const promise = queue.add(async () => {
          const hint = invalidHints[attempts];
          attempts++;
          if (hint !== undefined) {
            throw Object.assign(new Error('Fail'), { retryAfterMs: hint });
          }
          return 'success';
        });

        await vi.runAllTimersAsync();

        await expect(promise).resolves.toBe('success');
        expect(delays).toEqual([1000, 1000, 1000, 1000]);
      });

      it('should fall back to backoff for non-object errors', async () => {
        const delays = trackDelays();
        const queue = RetryQueue.create({
          maxRetries: 1,
          backoff: 'constant',
          baseDelay: 1000,
          jitter: false,
          networkAware: false,
        });

        let attempts = 0;
        const promise = queue.add(async () => {
          attempts++;
          if (attempts === 1) {
            throw 'string error';
          }
          return 'success';
        });

        await vi.runAllTimersAsync();

        await expect(promise).resolves.toBe('success');
        expect(delays).toEqual([1000]);
      });

      it('should accept a zero retryAfterMs as immediate retry', async () => {
        const queue = RetryQueue.create({
          maxRetries: 1,
          baseDelay: 60000,
          jitter: false,
          networkAware: false,
        });

        let attempts = 0;
        const promise = queue.add(async () => {
          attempts++;
          if (attempts === 1) {
            throw Object.assign(new Error('Retry now'), { retryAfterMs: 0 });
          }
          return 'success';
        });

        await vi.runAllTimersAsync();

        await expect(promise).resolves.toBe('success');
        expect(attempts).toBe(2);
      });
    });
  });

  // ===========================================================================
  // Network Awareness
  // ===========================================================================

  describe('Network Awareness', () => {
    it('should pause processing when offline', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { onLine: false },
        writable: true,
        configurable: true,
      });

      const queue = RetryQueue.create({ networkAware: true });

      // noinspection JSVoidFunctionReturnValueUsed
      const executed = vi.fn();
      const promise = queue
        .add(async () => {
          executed();
          return 'result';
        })
        .catch(() => {});

      await vi.runAllTimersAsync();

      expect(executed).not.toHaveBeenCalled();

      // Clean up: clear pending items to avoid unhandled rejection
      queue.clear();
      await promise;
    });

    it('should resume processing when coming back online', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { onLine: false },
        writable: true,
        configurable: true,
      });

      const queue = RetryQueue.create({ networkAware: true });

      // noinspection JSVoidFunctionReturnValueUsed
      const executed = vi.fn().mockReturnValue('result');
      const promise = queue.add(async () => executed());

      await vi.runAllTimersAsync();
      expect(executed).not.toHaveBeenCalled();

      // Come back online
      Object.defineProperty(globalThis, 'navigator', {
        value: { onLine: true },
        writable: true,
        configurable: true,
      });

      window.dispatchEvent(new Event('online'));
      await vi.runAllTimersAsync();

      expect(executed).toHaveBeenCalled();
      await expect(promise).resolves.toBe('result');
    });

    it('should not resume if manually paused when coming online', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { onLine: false },
        writable: true,
        configurable: true,
      });

      const queue = RetryQueue.create({ networkAware: true });
      queue.pause();

      // noinspection JSVoidFunctionReturnValueUsed
      const executed = vi.fn();
      const promise = queue
        .add(async () => {
          executed();
          return 'result';
        })
        .catch(() => {});

      // Come back online
      Object.defineProperty(globalThis, 'navigator', {
        value: { onLine: true },
        writable: true,
        configurable: true,
      });

      window.dispatchEvent(new Event('online'));
      await vi.runAllTimersAsync();

      // Should not execute because manually paused
      expect(executed).not.toHaveBeenCalled();

      // Clean up: clear pending items to avoid unhandled rejection
      queue.clear();
      await promise;
    });

    it('should process normally when networkAware is disabled', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { onLine: false },
        writable: true,
        configurable: true,
      });

      const queue = RetryQueue.create({ networkAware: false });

      // noinspection JSVoidFunctionReturnValueUsed
      const executed = vi.fn().mockReturnValue('result');
      const promise = queue.add(async () => executed());

      await vi.runAllTimersAsync();

      expect(executed).toHaveBeenCalled();
      await expect(promise).resolves.toBe('result');
    });

    it('should check network status before each operation', async () => {
      let operationCount = 0;

      Object.defineProperty(globalThis, 'navigator', {
        value: { onLine: true },
        writable: true,
        configurable: true,
      });

      const queue = RetryQueue.create({ networkAware: true });

      queue.add(async () => {
        operationCount++;
        // Go offline after first operation
        Object.defineProperty(globalThis, 'navigator', {
          value: { onLine: false },
          writable: true,
          configurable: true,
        });
        return 'first';
      });

      const p2 = queue
        .add(async () => {
          operationCount++;
          return 'second';
        })
        .catch(() => {});

      await vi.runAllTimersAsync();

      // First should execute, second should be blocked
      expect(operationCount).toBe(1);

      // Clean up: clear pending items to avoid unhandled rejection
      queue.clear();
      await p2;
    });

    it('should check network before retrying', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { onLine: true },
        writable: true,
        configurable: true,
      });

      const queue = RetryQueue.create({
        maxRetries: 3,
        backoff: 'constant',
        baseDelay: 100,
        jitter: false,
        networkAware: true,
      });

      let attempts = 0;
      const promise = queue
        .add(async () => {
          attempts++;
          if (attempts === 1) {
            // Go offline after first attempt
            Object.defineProperty(globalThis, 'navigator', {
              value: { onLine: false },
              writable: true,
              configurable: true,
            });
            throw new Error('Fail');
          }
          return 'success';
        })
        .catch(() => {});

      await vi.runAllTimersAsync();

      // Should only have attempted once before going offline
      expect(attempts).toBe(1);

      // Clean up: clear pending items to avoid unhandled rejection
      queue.clear();
      await promise;
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle empty queue gracefully', async () => {
      const queue = RetryQueue.create({ networkAware: false });

      queue.resume(); // Should not throw

      await vi.runAllTimersAsync();

      expect(queue.isEmpty()).toBe(true);
    });

    it('should handle operation returning undefined', async () => {
      const queue = RetryQueue.create({ networkAware: false });

      const promise = queue.add(async () => undefined);
      await vi.runAllTimersAsync();

      await expect(promise).resolves.toBeUndefined();
    });

    it('should handle operation returning null', async () => {
      const queue = RetryQueue.create({ networkAware: false });

      const promise = queue.add(async () => null);
      await vi.runAllTimersAsync();

      await expect(promise).resolves.toBeNull();
    });

    it('should handle operation returning complex objects', async () => {
      const queue = RetryQueue.create({ networkAware: false });

      const complexObj = {
        nested: { deep: { value: 42 } },
        array: [1, 2, 3],
        func: () => 'test',
      };

      const promise = queue.add(async () => complexObj);
      await vi.runAllTimersAsync();

      const result = await promise;
      expect(result).toBe(complexObj);
      expect(result.func()).toBe('test');
    });

    it('should handle maxRetries of 0', async () => {
      const queue = RetryQueue.create({
        maxRetries: 0,
        networkAware: false,
      });

      // Capture the error with immediate .catch() to prevent unhandled rejection
      let caughtError: unknown;
      const promise = queue
        .add(async () => {
          throw new Error('Immediate fail');
        })
        .catch((error) => {
          caughtError = error;
        });

      await vi.runAllTimersAsync();
      await promise;

      expect(caughtError).toBeInstanceOf(NetworkError);
    });

    it('should handle very large maxRetries', async () => {
      const queue = RetryQueue.create({
        maxRetries: 100,
        backoff: 'constant',
        baseDelay: 1,
        jitter: false,
        networkAware: false,
      });

      let attempts = 0;
      const promise = queue.add(async () => {
        attempts++;
        if (attempts < 50) {
          throw new Error('Fail');
        }
        return 'success';
      });

      await vi.runAllTimersAsync();

      await expect(promise).resolves.toBe('success');
      expect(attempts).toBe(50);
    });

    it('should handle rapid add/clear cycles', async () => {
      const queue = RetryQueue.create({ networkAware: false });
      const promises: Promise<unknown>[] = [];

      for (let i = 0; i < 10; i++) {
        queue.pause();
        // Catch the expected rejection when clear() is called
        const promise = queue
          .add(async () => `item-${i}`)
          .catch(() => {
            // Expected: aborted by clear()
          });
        promises.push(promise);
        queue.clear();
      }

      // Wait for all rejections to be handled
      await Promise.all(promises);

      expect(queue.isEmpty()).toBe(true);
    });

    it('should handle pause during processing', async () => {
      const queue = RetryQueue.create({ networkAware: false });
      const results: number[] = [];

      queue.add(async () => {
        results.push(1);
        queue.pause();
        return 1;
      });

      // Add catch handler to prevent unhandled rejection when we clear later
      const p2 = queue
        .add(async () => {
          results.push(2);
          return 2;
        })
        .catch(() => {
          // Expected: will be aborted when queue is cleared
        });

      await vi.runAllTimersAsync();

      // First should complete, second should be paused
      expect(results).toEqual([1]);
      expect(queue.getStats().pending).toBe(1);

      // Clean up: clear the queue to reject pending items
      queue.clear();
      await p2;
    });
  });

  // ===========================================================================
  // Rate Limiting
  // ===========================================================================

  describe('Rate Limiting', () => {
    it('should process operations within the rate limit window', async () => {
      const queue = RetryQueue.create({
        networkAware: false,
        jitter: false,
        backoff: 'constant',
        baseDelay: 10,
        rateLimit: { maxRequestsPerWindow: 2, windowMs: 5000 },
      });

      const results: number[] = [];
      const p1 = queue.add(async () => {
        results.push(1);
        return 1;
      });
      const p2 = queue.add(async () => {
        results.push(2);
        return 2;
      });

      await vi.runAllTimersAsync();
      await Promise.all([p1, p2]);

      expect(results).toEqual([1, 2]);
      expect(queue.getStats().succeeded).toBe(2);
    });

    it('should record operation timestamps on successful processing', async () => {
      vi.setSystemTime(new Date(10000));

      const queue = RetryQueue.create({
        networkAware: false,
        jitter: false,
        backoff: 'constant',
        baseDelay: 10,
        rateLimit: { maxRequestsPerWindow: 5, windowMs: 5000 },
      });

      const p1 = queue.add(async () => 'first');

      await vi.runAllTimersAsync();
      await p1;

      expect(queue.getStats().succeeded).toBe(1);
    });

    it('should throttle when rate limit is exceeded', async () => {
      vi.setSystemTime(new Date(10000));

      const queue = RetryQueue.create({
        networkAware: false,
        jitter: false,
        backoff: 'constant',
        baseDelay: 10,
        rateLimit: { maxRequestsPerWindow: 2, windowMs: 5000 },
      });

      const results: number[] = [];

      const p1 = queue.add(async () => {
        results.push(1);
        return 1;
      });
      const p2 = queue.add(async () => {
        results.push(2);
        return 2;
      });
      // Third item exceeds the rate limit (2 per window)
      const p3 = queue.add(async () => {
        results.push(3);
        return 3;
      });

      // Process first two items
      await vi.advanceTimersByTimeAsync(100);

      // First two should complete, third should be waiting for rate limit
      expect(results).toContain(1);
      expect(results).toContain(2);

      // Advance past the rate limit window
      await vi.advanceTimersByTimeAsync(5000);

      await Promise.all([p1, p2, p3]);

      expect(results).toEqual([1, 2, 3]);
      expect(queue.getStats().succeeded).toBe(3);
    });

    it('should calculate rate limit delay based on oldest timestamp', async () => {
      vi.setSystemTime(new Date(10000));

      const queue = RetryQueue.create({
        networkAware: false,
        jitter: false,
        backoff: 'constant',
        baseDelay: 10,
        rateLimit: { maxRequestsPerWindow: 1, windowMs: 3000 },
      });

      const results: number[] = [];

      const p1 = queue.add(async () => {
        results.push(1);
        return 1;
      });
      const p2 = queue.add(async () => {
        results.push(2);
        return 2;
      });

      // First item processes immediately
      await vi.advanceTimersByTimeAsync(100);
      expect(results).toEqual([1]);

      // Advance close to but not past the window
      await vi.advanceTimersByTimeAsync(2000);
      expect(results).toEqual([1]);

      // Advance past the rate limit window so second item can process
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.all([p1, p2]);

      expect(results).toEqual([1, 2]);
    });

    it('should clean up old timestamps outside the window', async () => {
      vi.setSystemTime(new Date(10000));

      const queue = RetryQueue.create({
        networkAware: false,
        jitter: false,
        backoff: 'constant',
        baseDelay: 10,
        rateLimit: { maxRequestsPerWindow: 1, windowMs: 2000 },
      });

      // Process first item at t=10000
      const p1 = queue.add(async () => 'first');
      await vi.advanceTimersByTimeAsync(100);
      await p1;

      // Add second item - rate limited
      const p2 = queue.add(async () => 'second');

      // Advance past window so old timestamp is cleaned
      vi.setSystemTime(new Date(12500));
      await vi.advanceTimersByTimeAsync(2500);
      await p2;

      // Add third item - should succeed because first timestamp was cleaned up
      const p3 = queue.add(async () => 'third');
      // Advance past window for second timestamp
      vi.setSystemTime(new Date(15000));
      await vi.advanceTimersByTimeAsync(2500);
      await p3;

      expect(queue.getStats().succeeded).toBe(3);
    });

    it('should pause and resume processing around rate limit delays', async () => {
      vi.setSystemTime(new Date(10000));

      const queue = RetryQueue.create({
        networkAware: false,
        jitter: false,
        backoff: 'constant',
        baseDelay: 10,
        rateLimit: { maxRequestsPerWindow: 2, windowMs: 5000 },
      });

      const processedAt: number[] = [];

      const p1 = queue.add(async () => {
        processedAt.push(Date.now());
        return 1;
      });
      const p2 = queue.add(async () => {
        processedAt.push(Date.now());
        return 2;
      });
      const p3 = queue.add(async () => {
        processedAt.push(Date.now());
        return 3;
      });

      // Process first two items quickly
      await vi.advanceTimersByTimeAsync(100);
      expect(processedAt).toHaveLength(2);

      // Third should be delayed until rate limit window passes
      await vi.advanceTimersByTimeAsync(5000);
      await Promise.all([p1, p2, p3]);

      expect(processedAt).toHaveLength(3);
      // Third item should have processed significantly later than first two
      expect(processedAt[2]! - processedAt[0]!).toBeGreaterThanOrEqual(4900);
    });

    it('should record operations on success with rate limit and handle retries', async () => {
      vi.setSystemTime(new Date(10000));

      const queue = RetryQueue.create({
        networkAware: false,
        jitter: false,
        backoff: 'constant',
        baseDelay: 50,
        maxRetries: 2,
        rateLimit: { maxRequestsPerWindow: 5, windowMs: 5000 },
      });

      let attempts = 0;
      const promise = queue.add(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBe('success');

      expect(attempts).toBe(2);
      expect(queue.getStats().succeeded).toBe(1);
      expect(queue.getStats().retries).toBe(1);
    });
  });

  // ===========================================================================
  // Concurrent Processing
  // ===========================================================================

  describe('Concurrent Processing', () => {
    it('should process items sequentially (FIFO)', async () => {
      const queue = RetryQueue.create({ networkAware: false });
      const order: number[] = [];

      queue.add(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        order.push(1);
        return 1;
      });

      queue.add(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        order.push(2);
        return 2;
      });

      queue.add(async () => {
        order.push(3);
        return 3;
      });

      await vi.runAllTimersAsync();

      expect(order).toEqual([1, 2, 3]);
    });

    it('should not start processing if already processing', async () => {
      const queue = RetryQueue.create({ networkAware: false });
      const startTimes: number[] = [];

      queue.add(async () => {
        startTimes.push(Date.now());
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 1;
      });

      queue.add(async () => {
        startTimes.push(Date.now());
        return 2;
      });

      await vi.runAllTimersAsync();

      // Second item should start after first completes
      expect(startTimes).toHaveLength(2);
      expect(startTimes[1]! - startTimes[0]!).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Circuit Breaker', () => {
    describe('configuration', () => {
      it('should create queue with circuit breaker enabled', () => {
        const queue = RetryQueue.create({
          circuitBreaker: { threshold: 5, cooldownMs: 10000 },
        });
        expect(queue.getCircuitState()).toBe('closed');
        queue.destroy();
      });

      it('should default circuitState to closed in stats', () => {
        const queue = RetryQueue.create();
        expect(queue.getStats().circuitState).toBe('closed');
        queue.destroy();
      });

      it('should throw on threshold <= 0', () => {
        expect(() => RetryQueue.create({ circuitBreaker: { threshold: 0 } })).toThrow(
          'threshold must be positive'
        );
      });

      it('should throw on negative threshold', () => {
        expect(() => RetryQueue.create({ circuitBreaker: { threshold: -1 } })).toThrow(
          'threshold must be positive'
        );
      });

      it('should throw on cooldownMs <= 0', () => {
        expect(() =>
          RetryQueue.create({ circuitBreaker: { threshold: 3, cooldownMs: 0 } })
        ).toThrow('cooldownMs must be positive');
      });

      it('should throw on negative cooldownMs', () => {
        expect(() =>
          RetryQueue.create({ circuitBreaker: { threshold: 3, cooldownMs: -1 } })
        ).toThrow('cooldownMs must be positive');
      });
    });

    describe('opening', () => {
      it('should open circuit after threshold consecutive failures', async () => {
        const queue = RetryQueue.create({
          maxRetries: 0,
          networkAware: false,
          circuitBreaker: { threshold: 3, cooldownMs: 5000 },
        });

        const promises = Array.from({ length: 3 }, () =>
          queue
            .add(async () => {
              throw new Error('fail');
            })
            .catch(() => {})
        );
        await Promise.all(promises);

        expect(queue.getCircuitState()).toBe('open');
        queue.destroy();
      });

      it('should not open circuit before reaching threshold', async () => {
        const queue = RetryQueue.create({
          maxRetries: 0,
          networkAware: false,
          circuitBreaker: { threshold: 5, cooldownMs: 5000 },
        });

        const promises = Array.from({ length: 3 }, () =>
          queue
            .add(async () => {
              throw new Error('fail');
            })
            .catch(() => {})
        );
        await Promise.all(promises);

        expect(queue.getCircuitState()).toBe('closed');
        queue.destroy();
      });

      it('should reset consecutive failure count on success', async () => {
        const queue = RetryQueue.create({
          maxRetries: 0,
          networkAware: false,
          circuitBreaker: { threshold: 3, cooldownMs: 5000 },
        });

        // Fail twice
        const fails1 = Array.from({ length: 2 }, () =>
          queue
            .add(async () => {
              throw new Error('fail');
            })
            .catch(() => {})
        );
        await Promise.all(fails1);

        // Succeed once (resets counter)
        await queue.add(async () => 'ok');

        // Fail twice more (consecutive = 2, not 4)
        const fails2 = Array.from({ length: 2 }, () =>
          queue
            .add(async () => {
              throw new Error('fail');
            })
            .catch(() => {})
        );
        await Promise.all(fails2);

        expect(queue.getCircuitState()).toBe('closed');
        queue.destroy();
      });
    });

    describe('fast-fail', () => {
      it('should reject with NETWORK_CIRCUIT_OPEN when circuit is open', async () => {
        const queue = RetryQueue.create({
          maxRetries: 0,
          networkAware: false,
          circuitBreaker: { threshold: 2, cooldownMs: 30000 },
        });

        const fails = Array.from({ length: 2 }, () =>
          queue
            .add(async () => {
              throw new Error('fail');
            })
            .catch(() => {})
        );
        await Promise.all(fails);

        const promise = queue.add(async () => 'should not execute');
        await expect(promise).rejects.toThrow('Circuit breaker is open');

        queue.destroy();
      });

      it('should not execute operation when circuit is open', async () => {
        const queue = RetryQueue.create({
          maxRetries: 0,
          networkAware: false,
          circuitBreaker: { threshold: 2, cooldownMs: 30000 },
        });

        const fails = Array.from({ length: 2 }, () =>
          queue
            .add(async () => {
              throw new Error('fail');
            })
            .catch(() => {})
        );
        await Promise.all(fails);

        const operationSpy = vi.fn().mockResolvedValue('result');
        await queue.add(operationSpy).catch(() => {});

        expect(operationSpy).not.toHaveBeenCalled();
        queue.destroy();
      });

      it('should have correct error code', async () => {
        const queue = RetryQueue.create({
          maxRetries: 0,
          networkAware: false,
          circuitBreaker: { threshold: 1, cooldownMs: 30000 },
        });

        await queue
          .add(async () => {
            throw new Error('fail');
          })
          .catch(() => {});

        try {
          await queue.add(async () => 'nope');
          expect.fail('Should have thrown');
        } catch (e) {
          expect(e).toBeInstanceOf(NetworkError);
          expect((e as InstanceType<typeof NetworkError>).code).toBe('NETWORK_CIRCUIT_OPEN');
        }

        queue.destroy();
      });
    });

    describe('half-open and recovery', () => {
      it('should transition to half-open after cooldown', async () => {
        const queue = RetryQueue.create({
          maxRetries: 0,
          networkAware: false,
          circuitBreaker: { threshold: 1, cooldownMs: 5000 },
        });

        await queue
          .add(async () => {
            throw new Error('fail');
          })
          .catch(() => {});
        expect(queue.getCircuitState()).toBe('open');

        await vi.advanceTimersByTimeAsync(5000);
        expect(queue.getCircuitState()).toBe('half-open');

        queue.destroy();
      });

      it('should close circuit on successful probe', async () => {
        const queue = RetryQueue.create({
          maxRetries: 0,
          networkAware: false,
          circuitBreaker: { threshold: 1, cooldownMs: 5000 },
        });

        await queue
          .add(async () => {
            throw new Error('fail');
          })
          .catch(() => {});

        await vi.advanceTimersByTimeAsync(5000);

        const promise = queue.add(async () => 'recovered');
        await vi.runAllTimersAsync();
        await expect(promise).resolves.toBe('recovered');
        expect(queue.getCircuitState()).toBe('closed');

        queue.destroy();
      });

      it('should reopen circuit on failed probe', async () => {
        const queue = RetryQueue.create({
          maxRetries: 0,
          networkAware: false,
          circuitBreaker: { threshold: 1, cooldownMs: 5000 },
        });

        await queue
          .add(async () => {
            throw new Error('fail');
          })
          .catch(() => {});

        await vi.advanceTimersByTimeAsync(5000);

        await queue
          .add(async () => {
            throw new Error('still failing');
          })
          .catch(() => {});

        expect(queue.getCircuitState()).toBe('open');
        queue.destroy();
      });

      it('should use default cooldownMs of 30000', async () => {
        const queue = RetryQueue.create({
          maxRetries: 0,
          networkAware: false,
          circuitBreaker: { threshold: 1 },
        });

        await queue
          .add(async () => {
            throw new Error('fail');
          })
          .catch(() => {});

        await vi.advanceTimersByTimeAsync(29999);
        expect(queue.getCircuitState()).toBe('open');

        await vi.advanceTimersByTimeAsync(1);
        expect(queue.getCircuitState()).toBe('half-open');

        queue.destroy();
      });
    });

    describe('state change events', () => {
      it('should emit full lifecycle state changes', async () => {
        const states: CircuitState[] = [];
        const queue = RetryQueue.create({
          maxRetries: 0,
          networkAware: false,
          circuitBreaker: { threshold: 1, cooldownMs: 5000 },
        });

        queue.onCircuitStateChange((s) => states.push(s));

        await queue
          .add(async () => {
            throw new Error('fail');
          })
          .catch(() => {});

        await vi.advanceTimersByTimeAsync(5000);

        await queue.add(async () => 'ok');

        expect(states).toEqual(['open', 'half-open', 'closed']);
        queue.destroy();
      });

      it('should return cleanup function', async () => {
        const states: CircuitState[] = [];
        const queue = RetryQueue.create({
          maxRetries: 0,
          networkAware: false,
          circuitBreaker: { threshold: 1, cooldownMs: 5000 },
        });

        const cleanup = queue.onCircuitStateChange((s) => states.push(s));
        cleanup();

        await queue
          .add(async () => {
            throw new Error('fail');
          })
          .catch(() => {});

        expect(states).toEqual([]);
        queue.destroy();
      });

      it('should ignore errors in state change handlers', async () => {
        const queue = RetryQueue.create({
          maxRetries: 0,
          networkAware: false,
          circuitBreaker: { threshold: 1, cooldownMs: 5000 },
        });

        queue.onCircuitStateChange(() => {
          throw new Error('handler error');
        });

        await queue
          .add(async () => {
            throw new Error('fail');
          })
          .catch(() => {});

        expect(queue.getCircuitState()).toBe('open');
        queue.destroy();
      });
    });

    describe('resetCircuit', () => {
      it('should reset circuit to closed', async () => {
        const queue = RetryQueue.create({
          maxRetries: 0,
          networkAware: false,
          circuitBreaker: { threshold: 1, cooldownMs: 5000 },
        });

        await queue
          .add(async () => {
            throw new Error('fail');
          })
          .catch(() => {});

        queue.resetCircuit();
        expect(queue.getCircuitState()).toBe('closed');
        queue.destroy();
      });

      it('should emit state change when resetting from open', async () => {
        const states: CircuitState[] = [];
        const queue = RetryQueue.create({
          maxRetries: 0,
          networkAware: false,
          circuitBreaker: { threshold: 1, cooldownMs: 5000 },
        });

        queue.onCircuitStateChange((s) => states.push(s));

        await queue
          .add(async () => {
            throw new Error('fail');
          })
          .catch(() => {});

        queue.resetCircuit();
        expect(states).toEqual(['open', 'closed']);
        queue.destroy();
      });

      it('should not emit if already closed', () => {
        const states: CircuitState[] = [];
        const queue = RetryQueue.create({
          circuitBreaker: { threshold: 3 },
        });

        queue.onCircuitStateChange((s) => states.push(s));
        queue.resetCircuit();

        expect(states).toEqual([]);
        queue.destroy();
      });
    });

    describe('destroy', () => {
      it('should clean up cooldown timer on destroy', async () => {
        const states: CircuitState[] = [];
        const queue = RetryQueue.create({
          maxRetries: 0,
          networkAware: false,
          circuitBreaker: { threshold: 1, cooldownMs: 5000 },
        });

        queue.onCircuitStateChange((s) => states.push(s));

        await queue
          .add(async () => {
            throw new Error('fail');
          })
          .catch(() => {});

        queue.destroy();

        await vi.advanceTimersByTimeAsync(5000);
        // Only 'open' should be in states, no 'half-open' after destroy
        expect(states).toEqual(['open']);
      });
    });

    describe('backwards compatibility', () => {
      it('should work without circuit breaker configured', async () => {
        const queue = RetryQueue.create({
          maxRetries: 1,
          networkAware: false,
        });

        let attempts = 0;
        const promise = queue.add(async () => {
          attempts++;
          if (attempts < 2) {
            throw new Error('fail');
          }
          return 'ok';
        });

        await vi.runAllTimersAsync();
        await expect(promise).resolves.toBe('ok');
        expect(queue.getCircuitState()).toBe('closed');
        queue.destroy();
      });
    });
  });
});
