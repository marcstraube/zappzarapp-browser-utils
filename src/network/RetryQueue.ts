/**
 * Retry Queue - Automatic retry for failed async operations.
 *
 * Features:
 * - Exponential backoff
 * - Honors `Retry-After` hints (`retryAfterMs` field on thrown errors)
 * - Network-aware (pauses when offline)
 * - Configurable retry limits
 * - Optional rate limiting (prevents reconnect storms)
 * - Event handlers
 * - Statistics
 *
 * @example Basic usage
 * ```TypeScript
 * const queue = RetryQueue.create({ maxRetries: 3, backoff: 'exponential' });
 *
 * // Add operation
 * const result = await queue.add(async () => {
 *   const response = await fetch('/api/data');
 *   return response.json();
 * });
 *
 * // Listen for retries
 * queue.onRetry((attempt, error) => {
 *   console.log(`Retry ${attempt}:`, error);
 * });
 *
 * // Pause/resume
 * queue.pause();
 * queue.resume();
 *
 * // Get stats
 * console.log(queue.getStats());
 * ```
 *
 * @example Honoring Retry-After
 * ```TypeScript
 * // When a failed operation throws an error carrying a numeric `retryAfterMs`
 * // field (e.g. a RequestError from an interceptor with throwOnError that saw
 * // a 429/503 Retry-After header), that delay replaces the computed backoff
 * // for the next attempt. It is capped at `maxDelay` and applied without jitter.
 * const queue = RetryQueue.create({ maxRetries: 3, maxDelay: 60000 });
 * await queue.add(() => api.get('/rate-limited'));
 * ```
 *
 * @example With rate limiting
 * ```TypeScript
 * // Limit to 10 requests per 5 seconds to prevent reconnect storms
 * const queue = RetryQueue.create({
 *   maxRetries: 3,
 *   backoff: 'exponential',
 *   rateLimit: {
 *     maxRequestsPerWindow: 10,
 *     windowMs: 5000,
 *   },
 * });
 *
 * // Operations will be automatically throttled to stay within the rate limit
 * for (let i = 0; i < 100; i++) {
 *   queue.add(async () => fetch(`/api/data/${i}`));
 * }
 * ```
 */
import {
  NetworkError,
  computeBackoffDelay,
  type BackoffStrategy,
  type CleanupFn,
} from '../core/index.js';
import { NetworkStatus } from './NetworkStatus.js';

export type { BackoffStrategy } from '../core/index.js';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. */
  readonly threshold: number;
  /**
   * Time in ms before transitioning from open to half-open.
   * @default 30000
   */
  readonly cooldownMs?: number;
}

export interface RetryQueueOptions {
  /**
   * Maximum retry attempts.
   * @default 3
   */
  readonly maxRetries?: number;

  /**
   * Backoff strategy.
   * @default 'exponential'
   */
  readonly backoff?: BackoffStrategy;

  /**
   * Base delay in milliseconds.
   * @default 1000
   */
  readonly baseDelay?: number;

  /**
   * Maximum delay in milliseconds.
   * Also caps `retryAfterMs` hints carried by thrown errors.
   * @default 30000
   */
  readonly maxDelay?: number;

  /**
   * Auto-pause when offline.
   * @default true
   */
  readonly networkAware?: boolean;

  /**
   * Add jitter to delays (prevents thundering herd).
   * @default true
   */
  readonly jitter?: boolean;

  /**
   * Circuit breaker configuration (optional, disabled by default).
   * Opens the circuit after consecutive failures to prevent cascading failures.
   */
  readonly circuitBreaker?: CircuitBreakerOptions;

  /**
   * Rate limiting configuration (optional, disabled by default).
   * Limits how many operations can be processed within a time window
   * to prevent reconnect storms.
   */
  readonly rateLimit?: {
    /**
     * Maximum number of operations allowed in the time window.
     */
    readonly maxRequestsPerWindow: number;
    /**
     * Time window in milliseconds.
     */
    readonly windowMs: number;
  };
}

export interface RetryStats {
  readonly pending: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly retries: number;
  readonly paused: boolean;
  readonly circuitState: CircuitState;
}

interface QueuedOperation<T> {
  operation: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  attempts: number;
}

export class RetryQueue {
  private readonly options: Required<Omit<RetryQueueOptions, 'rateLimit' | 'circuitBreaker'>> & {
    readonly rateLimit?: {
      readonly maxRequestsPerWindow: number;
      readonly windowMs: number;
    };
    readonly circuitBreaker?: CircuitBreakerOptions;
  };
  private readonly queue: Array<QueuedOperation<unknown>> = [];
  private processing = false;
  private paused = false;
  private stats = { succeeded: 0, failed: 0, retries: 0 };
  private retryHandlers: Array<(attempt: number, error: unknown) => void> = [];
  private networkCleanup: CleanupFn | null = null;
  private readonly operationTimestamps: number[] = [];
  private circuitState: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private circuitCooldownTimer: ReturnType<typeof setTimeout> | null = null;
  private circuitStateHandlers: Array<(state: CircuitState) => void> = [];

  private constructor(options: RetryQueueOptions = {}) {
    this.options = {
      maxRetries: options.maxRetries ?? 3,
      backoff: options.backoff ?? 'exponential',
      baseDelay: options.baseDelay ?? 1000,
      maxDelay: options.maxDelay ?? 30000,
      networkAware: options.networkAware ?? true,
      jitter: options.jitter ?? true,
      circuitBreaker: options.circuitBreaker,
      rateLimit: options.rateLimit,
    };

    if (this.options.baseDelay <= 0) {
      throw new NetworkError('NETWORK_INVALID_OPTIONS', 'baseDelay must be positive');
    }
    if (this.options.maxDelay <= 0) {
      throw new NetworkError('NETWORK_INVALID_OPTIONS', 'maxDelay must be positive');
    }
    if (this.options.circuitBreaker) {
      if (this.options.circuitBreaker.threshold <= 0) {
        throw new NetworkError(
          'NETWORK_INVALID_OPTIONS',
          'circuitBreaker threshold must be positive'
        );
      }
      if (
        this.options.circuitBreaker.cooldownMs !== undefined &&
        this.options.circuitBreaker.cooldownMs <= 0
      ) {
        throw new NetworkError(
          'NETWORK_INVALID_OPTIONS',
          'circuitBreaker cooldownMs must be positive'
        );
      }
    }

    if (this.options.networkAware) {
      this.setupNetworkAwareness();
    }
  }

  // =========================================================================
  // Factory Methods
  // =========================================================================

  /**
   * Create a new retry queue.
   */
  static create(options?: RetryQueueOptions): RetryQueue {
    return new RetryQueue(options);
  }

  // =========================================================================
  // Queue Operations
  // =========================================================================

  /**
   * Add an async operation to the queue.
   * @param operation Async function to execute
   * @returns Promise that resolves with the operation result or rejects after all retries fail
   */
  add<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        operation: operation,
        resolve: resolve as (value: unknown) => void,
        reject,
        attempts: 0,
      });

      void this.processQueue();
    });
  }

  /**
   * Pause queue processing.
   */
  pause(): void {
    this.paused = true;
  }

  /**
   * Resume queue processing.
   */
  resume(): void {
    this.paused = false;
    void this.processQueue();
  }

  /**
   * Clear all pending operations.
   * Rejects all pending promises with an abort error.
   */
  clear(): void {
    for (const item of this.queue) {
      item.reject(NetworkError.aborted());
    }
    this.queue.length = 0;
  }

  /**
   * Destroy the queue and clean up resources.
   */
  destroy(): void {
    this.clear();
    this.retryHandlers = [];
    this.circuitStateHandlers = [];
    this.clearCooldownTimer();
    this.consecutiveFailures = 0;
    this.circuitState = 'closed';

    if (this.networkCleanup !== null) {
      this.networkCleanup();
      this.networkCleanup = null;
    }
  }

  // =========================================================================
  // Event Handlers
  // =========================================================================

  /**
   * Listen for retry attempts.
   * @returns Cleanup function
   */
  onRetry(handler: (attempt: number, error: unknown) => void): CleanupFn {
    this.retryHandlers.push(handler);

    return () => {
      const index = this.retryHandlers.indexOf(handler);
      if (index !== -1) {
        this.retryHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Listen for circuit breaker state changes.
   * @returns Cleanup function
   */
  onCircuitStateChange(handler: (state: CircuitState) => void): CleanupFn {
    this.circuitStateHandlers.push(handler);

    return () => {
      const index = this.circuitStateHandlers.indexOf(handler);
      if (index !== -1) {
        this.circuitStateHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Reset the circuit breaker to closed state.
   */
  resetCircuit(): void {
    this.clearCooldownTimer();
    this.consecutiveFailures = 0;
    this.setCircuitState('closed');
  }

  /**
   * Get the current circuit breaker state.
   */
  getCircuitState(): CircuitState {
    return this.circuitState;
  }

  // =========================================================================
  // Statistics
  // =========================================================================

  /**
   * Get queue statistics.
   */
  getStats(): RetryStats {
    return {
      pending: this.queue.length,
      succeeded: this.stats.succeeded,
      failed: this.stats.failed,
      retries: this.stats.retries,
      paused: this.paused,
      circuitState: this.circuitState,
    };
  }

  /**
   * Check if queue is paused.
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Check if queue is empty.
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  // =========================================================================
  // Internal
  // =========================================================================

  private async processQueue(): Promise<void> {
    if (this.processing || this.paused || this.queue.length === 0) {
      return;
    }

    // Check network if network-aware
    if (this.options.networkAware && NetworkStatus.isOffline()) {
      return;
    }

    this.processing = true;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- paused can change during async iteration
    while (this.queue.length > 0 && !this.paused) {
      // Check network before each operation
      if (this.options.networkAware && NetworkStatus.isOffline()) {
        break;
      }

      // Circuit breaker: fast-fail if open
      if (this.options.circuitBreaker && this.circuitState === 'open') {
        const item = this.queue.shift()!;
        this.stats.failed++;
        item.reject(NetworkError.circuitOpen());
        continue;
      }

      // Check and wait for rate limit if needed
      const shouldContinue = await this.waitForRateLimit();
      if (shouldContinue) {
        continue;
      }

      const item = this.queue[0]!;
      await this.processQueueItem(item);
    }

    this.processing = false;
  }

  private async waitForRateLimit(): Promise<boolean> {
    if (!this.options.rateLimit) {
      return false;
    }

    const canProcess = this.checkRateLimit();
    if (!canProcess) {
      // Rate limit exceeded, wait before processing next item
      const delay = this.calculateRateLimitDelay();
      await this.delay(delay);
      return true; // Signal to continue to next iteration
    }

    return false;
  }

  private async processQueueItem(item: QueuedOperation<unknown>): Promise<void> {
    try {
      const result = await item.operation();
      this.queue.shift();
      this.stats.succeeded++;
      item.resolve(result);

      if (this.options.circuitBreaker) {
        this.onOperationSuccess();
      }

      // Record operation timestamp for rate limiting
      if (this.options.rateLimit) {
        this.recordOperation();
      }
    } catch (error) {
      item.attempts++;

      if (this.options.circuitBreaker) {
        this.onOperationFailure();
      }

      if (item.attempts <= this.options.maxRetries) {
        // Retry
        this.stats.retries++;
        this.emitRetry(item.attempts, error);

        const retryAfterMs = this.extractRetryAfterMs(error);
        const delay =
          retryAfterMs !== null
            ? Math.min(retryAfterMs, this.options.maxDelay)
            : this.calculateDelay(item.attempts);
        await this.delay(delay);
      } else {
        // Max retries exceeded
        this.queue.shift();
        this.stats.failed++;
        item.reject(NetworkError.maxRetries(item.attempts, error));
      }
    }
  }

  private onOperationSuccess(): void {
    this.consecutiveFailures = 0;
    if (this.circuitState === 'half-open') {
      this.setCircuitState('closed');
    }
  }

  private onOperationFailure(): void {
    this.consecutiveFailures++;

    if (this.circuitState === 'half-open') {
      this.setCircuitState('open');
      this.startCooldownTimer();
      return;
    }

    const threshold = this.options.circuitBreaker!.threshold;
    if (this.consecutiveFailures >= threshold && this.circuitState === 'closed') {
      this.setCircuitState('open');
      this.startCooldownTimer();
    }
  }

  private setCircuitState(newState: CircuitState): void {
    if (this.circuitState === newState) {
      return;
    }
    this.circuitState = newState;
    for (const handler of this.circuitStateHandlers) {
      try {
        handler(newState);
      } catch {
        // Ignore handler errors
      }
    }
  }

  private startCooldownTimer(): void {
    this.clearCooldownTimer();
    const cooldownMs = this.options.circuitBreaker!.cooldownMs ?? 30000;
    this.circuitCooldownTimer = setTimeout(() => {
      this.setCircuitState('half-open');
      void this.processQueue();
    }, cooldownMs);
  }

  private clearCooldownTimer(): void {
    if (this.circuitCooldownTimer !== null) {
      clearTimeout(this.circuitCooldownTimer);
      this.circuitCooldownTimer = null;
    }
  }

  private calculateDelay(attempt: number): number {
    return computeBackoffDelay(
      this.options.backoff,
      attempt,
      this.options.baseDelay,
      this.options.maxDelay,
      this.options.jitter
    );
  }

  /**
   * Extract a `Retry-After` hint from a thrown error.
   * Any error carrying a finite, non-negative numeric `retryAfterMs` field
   * (e.g. RequestError from the request module) provides the hint.
   */
  private extractRetryAfterMs(error: unknown): number | null {
    if (typeof error === 'object' && error !== null && 'retryAfterMs' in error) {
      const value: unknown = error.retryAfterMs;
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        return value;
      }
    }
    return null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private emitRetry(attempt: number, error: unknown): void {
    for (const handler of this.retryHandlers) {
      try {
        handler(attempt, error);
      } catch {
        // Ignore handler errors
      }
    }
  }

  private setupNetworkAwareness(): void {
    this.networkCleanup = NetworkStatus.onOnline(() => {
      if (!this.paused) {
        void this.processQueue();
      }
    });
  }

  /**
   * Check if rate limit allows processing another operation.
   * Uses a sliding window approach.
   */
  private checkRateLimit(): boolean {
    // Defensive guard - callers already check for rateLimit before calling
    /* v8 ignore start */
    if (!this.options.rateLimit) {
      return true;
    }
    /* v8 ignore stop */

    const now = Date.now();
    const { windowMs, maxRequestsPerWindow } = this.options.rateLimit;

    // Remove timestamps outside the current window
    const cutoff = now - windowMs;
    while (this.operationTimestamps.length > 0 && this.operationTimestamps[0]! < cutoff) {
      this.operationTimestamps.shift();
    }

    // Check if we're within the rate limit
    return this.operationTimestamps.length < maxRequestsPerWindow;
  }

  /**
   * Record an operation timestamp for rate limiting.
   */
  private recordOperation(): void {
    // Defensive guard - callers already check for rateLimit before calling
    /* v8 ignore start */
    if (!this.options.rateLimit) {
      return;
    }
    /* v8 ignore stop */

    this.operationTimestamps.push(Date.now());
  }

  /**
   * Calculate delay when rate limit is exceeded.
   * Returns the time until the oldest operation in the window expires.
   */
  private calculateRateLimitDelay(): number {
    // Defensive guard - callers already check for rateLimit before calling
    /* v8 ignore start */
    if (!this.options.rateLimit || this.operationTimestamps.length === 0) {
      return 0;
    }
    /* v8 ignore stop */

    const now = Date.now();
    const { windowMs } = this.options.rateLimit;
    const oldestTimestamp = this.operationTimestamps[0]!;
    const timeUntilExpiry = oldestTimestamp + windowMs - now;

    // Return at least 1ms to avoid busy-waiting
    return Math.max(1, timeUntilExpiry);
  }
}
