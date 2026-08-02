/**
 * Backoff - Retry delay computation shared across modules.
 *
 * Features:
 * - Constant, linear, and exponential strategies
 * - Maximum delay cap (hard upper bound, also with jitter)
 * - Optional equal jitter using cryptographic randomness (prevents thundering herd)
 *
 * @example
 * ```TypeScript
 * // Exponential backoff: 1000ms, 2000ms, 4000ms, ... capped at 30000ms
 * const delay = computeBackoffDelay('exponential', attempt, 1000, 30000, true);
 * await new Promise((resolve) => setTimeout(resolve, delay));
 * ```
 */

/**
 * Backoff strategy for retry delays.
 */
export type BackoffStrategy = 'linear' | 'exponential' | 'constant';

/**
 * Generate a cryptographically secure random number between 0 and 1.
 * Uses crypto.getRandomValues() for security consistency.
 */
function cryptoRandom(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0]! / 0xffffffff;
}

/**
 * Compute the retry delay for a given attempt.
 *
 * @param strategy Backoff strategy
 * @param attempt Retry attempt number (1-based)
 * @param baseDelay Base delay in milliseconds
 * @param maxDelay Maximum delay cap in milliseconds (never exceeded)
 * @param jitter Apply equal jitter: multiply the capped delay by a random
 *               factor between 0.5 and 1.0, so delays spread out without
 *               exceeding `maxDelay`
 * @returns Delay in milliseconds (floored to an integer)
 */
export function computeBackoffDelay(
  strategy: BackoffStrategy,
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  jitter: boolean
): number {
  let delay: number;

  switch (strategy) {
    case 'constant':
      delay = baseDelay;
      break;
    case 'linear':
      delay = baseDelay * attempt;
      break;
    case 'exponential':
    default:
      delay = baseDelay * Math.pow(2, attempt - 1);
      break;
  }

  // Apply max delay cap
  delay = Math.min(delay, maxDelay);

  // Apply equal jitter (factor 0.5-1.0) using cryptographic randomness.
  // Jittering downward from the capped delay keeps the spread intact at the
  // cap while never exceeding maxDelay.
  if (jitter) {
    delay = delay * (0.5 + cryptoRandom() * 0.5);
  }

  return Math.floor(delay);
}
