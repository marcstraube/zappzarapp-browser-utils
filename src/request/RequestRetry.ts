/**
 * Request retry logic with Retry-After support.
 * Internal module for the RequestInterceptor retry feature.
 */

import { computeBackoffDelay, type BackoffStrategy } from '../core/index.js';
import { RequestError } from './RequestInterceptor.js';
import type { HttpMethod, RequestErrorCode } from './RequestInterceptor.js';
import { parseRetryAfter } from './RetryAfter.js';

/**
 * Retry configuration for the request interceptor.
 * Retries are opt-in; without this config no request is ever retried.
 */
export interface RequestRetryConfig {
  /**
   * Maximum retry attempts (in addition to the initial request).
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
   * Also caps delays requested via the `Retry-After` response header.
   * @default 30000
   */
  readonly maxDelay?: number;

  /**
   * Add jitter to computed backoff delays (prevents thundering herd).
   * Server-provided `Retry-After` delays are never jittered.
   * @default true
   */
  readonly jitter?: boolean;

  /**
   * HTTP methods eligible for retry.
   * Defaults to idempotent methods only; retrying POST can duplicate
   * side effects and requires explicit opt-in.
   * @default ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']
   */
  readonly methods?: readonly HttpMethod[];

  /**
   * Response status codes that trigger a retry.
   * @default [408, 429, 500, 502, 503, 504]
   */
  readonly statusCodes?: readonly number[];
}

/**
 * Retry configuration with all defaults applied.
 */
export interface ResolvedRetryConfig {
  readonly maxRetries: number;
  readonly backoff: BackoffStrategy;
  readonly baseDelay: number;
  readonly maxDelay: number;
  readonly jitter: boolean;
  readonly methods: readonly HttpMethod[];
  readonly statusCodes: readonly number[];
}

const DEFAULT_RETRY_METHODS: readonly HttpMethod[] = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'];

const DEFAULT_RETRY_STATUS_CODES: readonly number[] = [408, 429, 500, 502, 503, 504];

/**
 * Error codes considered transient and therefore retryable.
 * Aborts and configuration/validation errors are never retried.
 */
const RETRYABLE_ERROR_CODES: ReadonlySet<RequestErrorCode> = new Set(['REQUEST_FAILED', 'TIMEOUT']);

/**
 * Apply defaults and validate retry configuration.
 * @throws {RequestError} INVALID_CONFIG for non-positive delays or invalid limits
 */
export function resolveRetryConfig(config: RequestRetryConfig): ResolvedRetryConfig {
  const resolved: ResolvedRetryConfig = {
    maxRetries: config.maxRetries ?? 3,
    backoff: config.backoff ?? 'exponential',
    baseDelay: config.baseDelay ?? 1000,
    maxDelay: config.maxDelay ?? 30000,
    jitter: config.jitter ?? true,
    methods: config.methods ?? DEFAULT_RETRY_METHODS,
    statusCodes: config.statusCodes ?? DEFAULT_RETRY_STATUS_CODES,
  };

  if (!Number.isInteger(resolved.maxRetries) || resolved.maxRetries < 0) {
    throw RequestError.invalidConfig('retry.maxRetries must be a non-negative integer');
  }
  if (resolved.baseDelay <= 0) {
    throw RequestError.invalidConfig('retry.baseDelay must be positive');
  }
  if (resolved.maxDelay <= 0) {
    throw RequestError.invalidConfig('retry.maxDelay must be positive');
  }
  if (resolved.methods.length === 0) {
    throw RequestError.invalidConfig('retry.methods must not be empty');
  }
  if (resolved.statusCodes.length === 0) {
    throw RequestError.invalidConfig('retry.statusCodes must not be empty');
  }

  return resolved;
}

/**
 * Check whether a request body can be replayed for a retry.
 * A ReadableStream body is consumed by the first attempt and cannot be reused.
 */
export function isReplayableBody(body: BodyInit | null | undefined): boolean {
  return !(typeof ReadableStream !== 'undefined' && body instanceof ReadableStream);
}

/**
 * Check whether a failed request (no response) should be retried.
 */
export function isRetryableError(error: RequestError): boolean {
  return RETRYABLE_ERROR_CODES.has(error.code);
}

/**
 * Compute the delay before the next retry attempt.
 * A valid `Retry-After` header replaces the computed backoff (without jitter)
 * and is capped at `maxDelay`.
 */
export function computeRetryDelay(
  config: ResolvedRetryConfig,
  attempt: number,
  retryAfterHeader: string | null
): number {
  const retryAfterMs = parseRetryAfter(retryAfterHeader);
  if (retryAfterMs !== null) {
    return Math.min(retryAfterMs, config.maxDelay);
  }
  return computeBackoffDelay(
    config.backoff,
    attempt,
    config.baseDelay,
    config.maxDelay,
    config.jitter
  );
}

/**
 * Determine the effective retry config for a single request.
 * Returns null when retries are disabled, the method is not eligible,
 * or the body cannot be replayed.
 */
export function eligibleRetryConfig(
  config: ResolvedRetryConfig | null,
  method: HttpMethod,
  body: BodyInit | null | undefined
): ResolvedRetryConfig | null {
  if (config === null || !config.methods.includes(method) || !isReplayableBody(body)) {
    return null;
  }
  return config;
}

/**
 * Delay before retrying a received response, or null when the response
 * should not be retried (non-retryable status or retries exhausted).
 * @param retry Effective retry config (null disables retries)
 * @param attempt Number of retries already performed
 * @param response Received response
 */
export function retryDelayForResponse(
  retry: ResolvedRetryConfig | null,
  attempt: number,
  response: Response
): number | null {
  if (
    retry === null ||
    attempt >= retry.maxRetries ||
    !retry.statusCodes.includes(response.status)
  ) {
    return null;
  }
  return computeRetryDelay(retry, attempt + 1, response.headers.get('Retry-After'));
}

/**
 * Delay before retrying a failed request, or null when the error
 * should not be retried (non-transient error or retries exhausted).
 * @param retry Effective retry config (null disables retries)
 * @param attempt Number of retries already performed
 * @param error Converted request error
 */
export function retryDelayForError(
  retry: ResolvedRetryConfig | null,
  attempt: number,
  error: RequestError
): number | null {
  if (retry === null || attempt >= retry.maxRetries || !isRetryableError(error)) {
    return null;
  }
  return computeRetryDelay(retry, attempt + 1, null);
}

/**
 * Wait before the next retry attempt.
 * Rejects with an AbortError DOMException as soon as one of the given
 * signals aborts, so callers can map it like an aborted fetch.
 */
export function waitRetryDelay(
  ms: number,
  signals: readonly (AbortSignal | undefined)[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const active = signals.filter((signal): signal is AbortSignal => signal !== undefined);

    const abort = (): void => {
      reject(new DOMException('Retry delay was aborted', 'AbortError'));
    };

    if (active.some((signal) => signal.aborted)) {
      abort();
      return;
    }

    const timer = setTimeout(() => {
      for (const signal of active) {
        signal.removeEventListener('abort', onAbort);
      }
      resolve();
    }, ms);

    const onAbort = (): void => {
      clearTimeout(timer);
      for (const signal of active) {
        signal.removeEventListener('abort', onAbort);
      }
      abort();
    };

    for (const signal of active) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/**
 * Release an intermediate response before retrying, so the connection
 * is not held open by an unconsumed body.
 */
export async function discardResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Ignore - the response is discarded either way
  }
}
