/**
 * Idle Callback - requestIdleCallback wrapper with fallback.
 *
 * Features:
 * - Simplified API for scheduling idle work
 * - Automatic fallback for unsupported browsers
 * - Deadline-aware task splitting
 * - Queue management for multiple tasks
 *
 * @example
 * ```TypeScript
 * // Schedule work when browser is idle
 * const cancel = IdleCallback.request(() => {
 *   // Low-priority work
 *   processBackgroundData();
 * });
 *
 * // With deadline awareness
 * IdleCallback.request((deadline) => {
 *   while (deadline.timeRemaining() > 0 && hasMoreWork()) {
 *     doWorkChunk();
 *   }
 * });
 *
 * // Run multiple tasks in idle time
 * const cleanup = IdleCallback.runTasks([
 *   () => prefetchImages(),
 *   () => updateAnalytics(),
 *   () => cleanupCache(),
 * ]);
 * ```
 */
import type { CleanupFn } from '../core/types.js';

/**
 * Deadline information for idle callbacks.
 */
export interface IdleDeadline {
  /**
   * Returns the time remaining in the current idle period.
   */
  readonly timeRemaining: () => number;

  /**
   * Whether the callback is being run because the timeout expired.
   */
  readonly didTimeout: boolean;
}

export interface IdleOptions {
  /**
   * Maximum time to wait before forcing callback execution.
   * @default undefined (no timeout)
   */
  readonly timeout?: number;
}

export interface TaskQueueOptions extends IdleOptions {
  /**
   * Minimum time remaining to start a new task (ms).
   * @default 1
   */
  readonly minTimeRemaining?: number;
}

// Type for window with requestIdleCallback support
interface IdleCallbackWindow extends Window {
  requestIdleCallback: (
    callback: (deadline: IdleDeadline) => void,
    options?: { timeout?: number }
  ) => number;
  cancelIdleCallback: (handle: number) => void;
}

/**
 * Check if window has idle callback support.
 */
function hasIdleCallbackSupport(win: Window): win is IdleCallbackWindow {
  return 'requestIdleCallback' in win && typeof win.requestIdleCallback === 'function';
}

export const IdleCallback = {
  // =========================================================================
  // Core API
  // =========================================================================

  /**
   * Check if requestIdleCallback is natively supported.
   */
  isSupported(): boolean {
    return typeof window !== 'undefined' && hasIdleCallbackSupport(window);
  },

  /**
   * Request an idle callback.
   * Falls back to setTimeout if requestIdleCallback is not supported.
   *
   * @param callback Function to call when browser is idle
   * @param options Idle callback options
   * @returns Cancel function
   */
  request(callback: (deadline: IdleDeadline) => void, options?: IdleOptions): CleanupFn {
    if (typeof window === 'undefined') {
      return (): void => {};
    }

    if (hasIdleCallbackSupport(window)) {
      const handle = window.requestIdleCallback(callback, {
        timeout: options?.timeout,
      });

      return (): void => {
        window.cancelIdleCallback(handle);
      };
    }

    // Fallback using setTimeout
    const timeoutId = setTimeout(() => {
      const start = performance.now();
      callback({
        didTimeout: options?.timeout !== undefined,
        timeRemaining: (): number => Math.max(0, 50 - (performance.now() - start)),
      });
    }, 1);

    return (): void => {
      clearTimeout(timeoutId);
    };
  },

  /**
   * Request idle callback as a Promise.
   * @param options Idle callback options
   * @returns Promise that resolves with deadline
   */
  requestPromise(options?: IdleOptions): Promise<IdleDeadline> {
    return new Promise((resolve) => {
      IdleCallback.request(resolve, options);
    });
  },

  /**
   * Run a task only if there's enough idle time remaining.
   * @param deadline Current idle deadline
   * @param task Task to run
   * @param minTime Minimum time required to start task (default: 1ms)
   * @returns True if task was run, false if skipped
   */
  runIfTime(deadline: IdleDeadline, task: () => void, minTime = 1): boolean {
    if (deadline.timeRemaining() >= minTime || deadline.didTimeout) {
      task();
      return true;
    }
    return false;
  },

  // =========================================================================
  // Task Queue
  // =========================================================================

  /**
   * Run multiple tasks across idle periods.
   * Tasks are run one at a time, continuing in the next idle period if needed.
   *
   * @param tasks Array of tasks to run
   * @param options Queue options
   * @returns Cleanup function to cancel remaining tasks
   */
  runTasks(tasks: ReadonlyArray<() => void>, options?: TaskQueueOptions): CleanupFn {
    const queue = [...tasks];
    let cancelled = false;
    let cancelCurrent: CleanupFn | null = null;

    const processQueue = (deadline: IdleDeadline): void => {
      const minTime = options?.minTimeRemaining ?? 1;

      while (queue.length > 0 && !cancelled) {
        if (deadline.timeRemaining() < minTime && !deadline.didTimeout) {
          // Not enough time, schedule for next idle period
          cancelCurrent = IdleCallback.request(processQueue, options);
          return;
        }

        const task = queue.shift()!;
        try {
          task();
        } catch (error) {
          console.error('IdleCallback task error:', error);
        }
      }
    };

    cancelCurrent = IdleCallback.request(processQueue, options);

    return () => {
      cancelled = true;
      queue.length = 0;
      // Defensive: cancelCurrent is assigned synchronously below before this
      // cleanup can run, so it is never null here.
      /* v8 ignore next */
      if (cancelCurrent !== null) {
        cancelCurrent();
      }
    };
  },

  /**
   * Run an async task in chunks during idle time.
   * Useful for processing large datasets without blocking the main thread.
   *
   * @param items Items to process
   * @param processor Function to process each item
   * @param options Queue options
   * @returns Promise that resolves when all items are processed
   */
  async processInIdle<T>(
    items: readonly T[],
    processor: (item: T, index: number) => void,
    options?: TaskQueueOptions
  ): Promise<void> {
    const queue = items.map(
      (item, index): (() => void) =>
        () =>
          processor(item, index)
    );

    return new Promise((resolve, reject) => {
      let cancelled = false;

      const processQueue = (deadline: IdleDeadline): void => {
        const minTime = options?.minTimeRemaining ?? 1;

        while (queue.length > 0 && !cancelled) {
          if (deadline.timeRemaining() < minTime && !deadline.didTimeout) {
            IdleCallback.request(processQueue, options);
            return;
          }

          const task = queue.shift()!;
          try {
            task();
          } catch (error) {
            cancelled = true;
            reject(error instanceof Error ? error : new Error(String(error)));
            return;
          }
        }

        // Defensive: the loop only exits normally once the queue is drained
        // (the cancelled path returns early above), so this is always true.
        /* v8 ignore next */
        if (queue.length === 0) {
          resolve();
        }
      };

      IdleCallback.request(processQueue, options);
    });
  },

  // =========================================================================
  // Utilities
  // =========================================================================

  /**
   * Defer a function to run during idle time.
   * Returns a wrapped function that schedules the original for idle execution.
   *
   * @param fn Function to defer
   * @param options Idle callback options
   * @returns Deferred function
   */
  defer<T extends (...args: unknown[]) => void>(
    fn: T,
    options?: IdleOptions
  ): (...args: Parameters<T>) => CleanupFn {
    return (...args: Parameters<T>): CleanupFn => {
      return IdleCallback.request(() => {
        fn(...args);
      }, options);
    };
  },

  /**
   * Create an idle-deferred version of a function that batches calls.
   * Multiple calls before idle execution are merged into one.
   *
   * @param fn Function to batch
   * @param options Idle callback options
   * @returns Batched function with flush and cancel methods
   */
  batch<T extends () => void>(
    fn: T,
    options?: IdleOptions
  ): {
    schedule: () => void;
    flush: () => void;
    cancel: () => void;
  } {
    let scheduled = false;
    let cancelFn: CleanupFn | null = null;

    return {
      schedule: (): void => {
        if (!scheduled) {
          scheduled = true;
          cancelFn = IdleCallback.request(() => {
            scheduled = false;
            fn();
          }, options);
        }
      },
      flush: (): void => {
        if (scheduled) {
          // Defensive: scheduled is only true after schedule() assigned cancelFn,
          // so it is never null in this branch.
          /* v8 ignore next */
          if (cancelFn !== null) {
            cancelFn();
          }
          scheduled = false;
          fn();
        }
      },
      cancel: (): void => {
        if (cancelFn !== null) {
          cancelFn();
        }
        scheduled = false;
      },
    };
  },
};
