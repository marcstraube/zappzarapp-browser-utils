/**
 * Request Interceptor - Fetch/XMLHttpRequest wrapper with middleware support.
 *
 * Features:
 * - Fetch and XMLHttpRequest interception
 * - Request/response middleware chain
 * - Authentication header injection (Bearer tokens, API keys)
 * - Automatic retry with backoff and Retry-After support (opt-in)
 * - Request logging and timing hooks
 * - Error handling middleware
 * - URL validation and security
 * - Proper cleanup/destroy
 *
 * @example
 * ```TypeScript
 * // Create interceptor with auth
 * const interceptor = RequestInterceptor.create({
 *   baseUrl: 'https://api.example.com',
 *   auth: {
 *     type: 'bearer',
 *     token: () => getAccessToken(),
 *   },
 * });
 *
 * // Add middleware
 * interceptor.use({
 *   onRequest: (config) => {
 *     console.log('Request:', config.url);
 *     return config;
 *   },
 *   onResponse: (response) => {
 *     console.log('Response:', response.status);
 *     return response;
 *   },
 *   onError: (error) => {
 *     console.error('Error:', error);
 *     throw error;
 *   },
 * });
 *
 * // Make requests
 * const response = await interceptor.fetch('/users');
 *
 * // Cleanup
 * interceptor.destroy();
 * ```
 */
import { BrowserUtilsError, type CleanupFn } from '../core/index.js';
import { applyAuth } from './RequestAuth.js';
import {
  runRequestMiddleware,
  runResponseMiddleware,
  runErrorMiddleware,
  emitTiming,
} from './RequestMiddleware.js';
import {
  resolveRetryConfig,
  eligibleRetryConfig,
  retryDelayForResponse,
  retryDelayForError,
  waitRetryDelay,
  discardResponseBody,
  type RequestRetryConfig,
  type ResolvedRetryConfig,
} from './RequestRetry.js';
import { parseRetryAfter } from './RetryAfter.js';
import {
  resolveDedupeConfig,
  dedupeKey,
  createInFlightRequest,
  attachCaller,
  type RequestDedupeConfig,
  type ResolvedDedupeConfig,
  type InFlightRequest,
} from './RequestDedupe.js';
import {
  validateUrl,
  validateCredentialOrigin,
  combineAbortSignals,
  validateContentType,
} from './RequestValidation.js';

// =============================================================================
// Error Types
// =============================================================================

/**
 * Request error codes.
 */
export type RequestErrorCode =
  | 'FETCH_NOT_SUPPORTED'
  | 'INVALID_URL'
  | 'INVALID_CONFIG'
  | 'REQUEST_FAILED'
  | 'RESPONSE_ERROR'
  | 'MIDDLEWARE_ERROR'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'CREDENTIAL_LEAK'
  | 'SSRF_BLOCKED'
  | 'CONTENT_TYPE_MISMATCH';

/**
 * Request-specific error.
 */
export class RequestError extends BrowserUtilsError {
  constructor(
    readonly code: RequestErrorCode,
    message: string,
    cause?: unknown,
    /**
     * Parsed `Retry-After` hint in milliseconds.
     * Present on RESPONSE_ERROR when the server sent the header.
     * Consumers like RetryQueue use it to override their backoff delay.
     */
    readonly retryAfterMs?: number
  ) {
    super(message, cause);
  }

  static fetchNotSupported(): RequestError {
    return new RequestError(
      'FETCH_NOT_SUPPORTED',
      'Fetch API is not supported in this environment'
    );
  }

  static invalidUrl(url: string, reason?: string): RequestError {
    const hasReason = reason !== undefined && reason !== '';
    const message = hasReason ? `Invalid URL "${url}": ${reason}` : `Invalid URL: "${url}"`;
    return new RequestError('INVALID_URL', message);
  }

  static invalidConfig(reason: string): RequestError {
    return new RequestError('INVALID_CONFIG', `Invalid configuration: ${reason}`);
  }

  static requestFailed(url: string, cause?: unknown): RequestError {
    return new RequestError('REQUEST_FAILED', `Request to "${url}" failed`, cause);
  }

  static responseError(status: number, statusText: string, retryAfterMs?: number): RequestError {
    return new RequestError(
      'RESPONSE_ERROR',
      `Response error: ${status} ${statusText}`,
      undefined,
      retryAfterMs
    );
  }

  static middlewareError(phase: string, cause?: unknown): RequestError {
    return new RequestError('MIDDLEWARE_ERROR', `Middleware error during ${phase}`, cause);
  }

  static timeout(url: string, timeoutMs: number): RequestError {
    return new RequestError('TIMEOUT', `Request to "${url}" timed out after ${timeoutMs}ms`);
  }

  static aborted(url: string): RequestError {
    return new RequestError('ABORTED', `Request to "${url}" was aborted`);
  }

  static credentialLeak(detail: string): RequestError {
    return new RequestError('CREDENTIAL_LEAK', `Potential credential leak prevented: ${detail}`);
  }

  static ssrfBlocked(hostname: string): RequestError {
    return new RequestError(
      'SSRF_BLOCKED',
      `Request to private IP address blocked for SSRF protection: ${hostname}`
    );
  }

  static contentTypeMismatch(
    expected: string | readonly string[],
    actual: string | null
  ): RequestError {
    const expectedStr = Array.isArray(expected) ? expected.join(', ') : String(expected);
    const actualStr = actual ?? '(none)';
    return new RequestError(
      'CONTENT_TYPE_MISMATCH',
      `Response Content-Type mismatch: expected "${expectedStr}" but received "${actualStr}"`
    );
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * HTTP methods supported by the interceptor.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * Authentication types.
 */
export type AuthType = 'bearer' | 'api-key' | 'basic' | 'custom';

/**
 * Authentication configuration.
 */
export interface AuthConfig {
  /** Authentication type */
  readonly type: AuthType;
  /** Token value or function that returns token */
  readonly token?: string | (() => string | Promise<string>);
  /** API key value or function (for api-key type) */
  readonly apiKey?: string | (() => string | Promise<string>);
  /** Header name for API key (default: 'X-API-Key') */
  readonly apiKeyHeader?: string;
  /** Username for basic auth */
  readonly username?: string;
  /** Password for basic auth */
  readonly password?: string;
  /** Custom header name and value function (for custom type) */
  readonly customHeader?: {
    readonly name: string;
    readonly value: string | (() => string | Promise<string>);
  };
}

/**
 * Request configuration passed through middleware.
 */
export interface RequestConfig {
  /** Full URL */
  readonly url: string;
  /** HTTP method */
  readonly method: HttpMethod;
  /** Request headers */
  readonly headers: Headers;
  /** Request body */
  readonly body?: BodyInit | null;
  /** Request timeout in ms */
  readonly timeout?: number;
  /** Abort signal */
  readonly signal?: AbortSignal;
  /** Additional metadata for middleware */
  readonly metadata?: Readonly<Record<string, unknown>>;
  /** Expected Content-Type for the response (overrides instance default) */
  readonly expectedContentType?: string | readonly string[];
}

/**
 * Mutable request configuration for middleware.
 */
export interface MutableRequestConfig {
  /** Full URL */
  url: string;
  /** HTTP method */
  method: HttpMethod;
  /** Request headers */
  headers: Headers;
  /** Request body */
  body?: BodyInit | null;
  /** Request timeout in ms */
  timeout?: number;
  /** Abort signal */
  signal?: AbortSignal;
  /** Additional metadata for middleware */
  metadata?: Record<string, unknown>;
  /** Expected Content-Type for the response (overrides instance default) */
  expectedContentType?: string | readonly string[];
}

/**
 * RequestInit accepted by the interceptor's request methods.
 */
export interface InterceptorRequestInit extends RequestInit {
  /**
   * Opt this request out of deduplication (`false`) even when the
   * instance has a dedupe configuration. Has no effect without one.
   */
  readonly dedupe?: boolean;
}

/**
 * Response wrapper with timing info.
 */
export interface InterceptedResponse {
  /** Original Response object */
  readonly response: Response;
  /** Request URL */
  readonly url: string;
  /** Request duration in ms */
  readonly duration: number;
  /** Response status */
  readonly status: number;
  /** Response status text */
  readonly statusText: string;
  /** Response headers */
  readonly headers: Headers;
}

/**
 * Middleware definition.
 */
export interface RequestMiddleware {
  /** Called before request is sent */
  readonly onRequest?: (
    config: MutableRequestConfig
  ) => MutableRequestConfig | Promise<MutableRequestConfig>;
  /** Called after response is received */
  readonly onResponse?: (
    response: InterceptedResponse
  ) => InterceptedResponse | Promise<InterceptedResponse>;
  /** Called when an error occurs */
  readonly onError?: (error: RequestError, config: RequestConfig) => void | Promise<void>;
}

/**
 * Request timing information.
 * Exactly one timing event is emitted per request.
 */
export interface RequestTiming {
  readonly url: string;
  readonly method: HttpMethod;
  readonly startTime: number;
  readonly endTime: number;
  readonly duration: number;
  /** Response status; present when a response was received */
  readonly status?: number;
  /**
   * Error message; present when the request failed. A non-ok response with
   * `throwOnError` carries both `status` and `error`.
   */
  readonly error?: string;
  /**
   * Number of additional callers that attached to this request via
   * deduplication (including callers that aborted before completion).
   * Present only when the request ran through the dedupe path.
   */
  readonly dedupedCallers?: number;
}

/**
 * Timing handler function.
 */
export type TimingHandler = (timing: RequestTiming) => void;

/**
 * Interceptor configuration.
 */
export interface RequestInterceptorConfig {
  /** Base URL for all requests */
  readonly baseUrl?: string;
  /** Default timeout in ms */
  readonly timeout?: number;
  /** Default headers */
  readonly defaultHeaders?: Readonly<Record<string, string>>;
  /** Authentication configuration */
  readonly auth?: AuthConfig;
  /** Throw on non-2xx responses */
  readonly throwOnError?: boolean;
  /** Allowed URL protocols (default: ['https:']) */
  readonly allowedProtocols?: readonly string[];
  /** Blocked URL patterns (regex) */
  readonly blockedPatterns?: readonly RegExp[];
  /** Validate that credentials are not sent to different origins */
  readonly validateCredentialOrigin?: boolean;
  /**
   * Block requests to private IP addresses (SSRF protection).
   * Default: false (opt-in).
   *
   * When enabled, blocks requests to:
   * - Loopback: 127.0.0.0/8, ::1
   * - Private: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fc00::/7
   * - Link-local: 169.254.0.0/16, fe80::/10
   * - Unspecified: 0.0.0.0/8, ::
   *
   * Note: This only validates hostnames that are IP addresses directly (e.g., http://127.0.0.1).
   * In browsers, DNS resolution is not available, so domain names that resolve to private IPs
   * cannot be detected. This provides defense-in-depth for direct IP access.
   */
  readonly blockPrivateIPs?: boolean;
  /**
   * Expected Content-Type for responses (MIME type validation).
   * Validates that the response Content-Type header matches.
   * Comparison is case-insensitive on type/subtype; parameters
   * (e.g., charset) are ignored.
   *
   * Can be a single MIME type or an array of accepted types.
   * Fails closed: missing Content-Type header with this set will throw.
   *
   * Default: undefined (no validation).
   */
  readonly expectedContentType?: string | readonly string[];
  /**
   * Automatic retry for transient failures (opt-in).
   *
   * When set, network errors and responses with a retryable status code
   * (default: 408, 429, 500, 502, 503, 504) are retried with backoff for
   * retryable methods (default: idempotent methods only). A `Retry-After`
   * response header overrides the computed backoff delay, capped at
   * `retry.maxDelay`.
   *
   * Requests with a ReadableStream body are never retried (single-use).
   *
   * Default: undefined (no retries).
   */
  readonly retry?: RequestRetryConfig;
  /**
   * Deduplicate identical in-flight requests (opt-in).
   *
   * Concurrent requests with the same method, URL, and caller-supplied
   * headers share a single execution; every caller receives an
   * independent clone of the response. Only safe methods (GET, HEAD,
   * OPTIONS) are eligible. Individual requests can opt out via
   * `dedupe: false`. Middleware, timing, and error handlers run once
   * per physical request, not per caller.
   *
   * Entries are removed as soon as the request settles — this is not a
   * response cache (see the cache module for caching).
   *
   * Default: undefined (no deduplication).
   */
  readonly dedupe?: RequestDedupeConfig;
}

/**
 * Request interceptor instance.
 */
export interface RequestInterceptorInstance {
  /** Make a fetch request */
  fetch(url: string, options?: InterceptorRequestInit): Promise<Response>;

  /** Make a GET request */
  get(url: string, options?: Omit<InterceptorRequestInit, 'method'>): Promise<Response>;

  /** Make a POST request */
  post(
    url: string,
    body?: BodyInit | null,
    options?: Omit<RequestInit, 'method' | 'body'>
  ): Promise<Response>;

  /** Make a PUT request */
  put(
    url: string,
    body?: BodyInit | null,
    options?: Omit<RequestInit, 'method' | 'body'>
  ): Promise<Response>;

  /** Make a PATCH request */
  patch(
    url: string,
    body?: BodyInit | null,
    options?: Omit<RequestInit, 'method' | 'body'>
  ): Promise<Response>;

  /** Make a DELETE request */
  delete(url: string, options?: Omit<RequestInit, 'method'>): Promise<Response>;

  /** Make a HEAD request */
  head(url: string, options?: Omit<InterceptorRequestInit, 'method'>): Promise<Response>;

  /** Make an OPTIONS request */
  options(url: string, options?: Omit<InterceptorRequestInit, 'method'>): Promise<Response>;

  /** Add middleware */
  use(middleware: RequestMiddleware): CleanupFn;

  /** Add timing handler */
  onTiming(handler: TimingHandler): CleanupFn;

  /** Get current configuration */
  getConfig(): Readonly<RequestInterceptorConfig>;

  /** Update authentication */
  setAuth(auth: AuthConfig | null): void;

  /** Abort all pending requests */
  abortAll(): void;

  /** Destroy the interceptor and cleanup */
  destroy(): void;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIG: Required<
  Omit<
    RequestInterceptorConfig,
    'auth' | 'baseUrl' | 'blockedPatterns' | 'expectedContentType' | 'retry' | 'dedupe'
  >
> & {
  auth: AuthConfig | null;
  baseUrl: string;
  blockedPatterns: readonly RegExp[];
  expectedContentType: string | readonly string[] | undefined;
  retry: RequestRetryConfig | undefined;
  dedupe: RequestDedupeConfig | undefined;
} = {
  baseUrl: '',
  timeout: 30000,
  defaultHeaders: {},
  auth: null,
  throwOnError: false,
  allowedProtocols: ['https:'],
  blockedPatterns: [],
  validateCredentialOrigin: true,
  blockPrivateIPs: false,
  expectedContentType: undefined,
  retry: undefined,
  dedupe: undefined,
} as const;

/**
 * Wrapper marking an error that has already been finalized (timing emitted,
 * error middleware run). The retry loop unwraps and rethrows it as-is instead
 * of sending it through the failure path a second time.
 */
class FinalizedRequestError extends Error {
  constructor(readonly error: RequestError) {
    super(error.message);
  }
}

/**
 * Sensitive header names that should not be logged or leaked.
 */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'x-auth-token',
  'cookie',
  'set-cookie',
  'proxy-authorization',
]);

// =============================================================================
// Implementation
// =============================================================================

export const RequestInterceptor = {
  /**
   * Check if Fetch API is supported.
   */
  isSupported(): boolean {
    return typeof fetch !== 'undefined' && typeof Headers !== 'undefined';
  },

  /**
   * Create a request interceptor instance.
   *
   * @param config Interceptor configuration
   * @returns Request interceptor instance
   *
   * @example Basic usage
   * ```TypeScript
   * const api = RequestInterceptor.create({
   *   baseUrl: 'https://api.example.com',
   * });
   *
   * const response = await api.fetch('/users');
   * const users = await response.json();
   * ```
   *
   * @example With Bearer token authentication
   * ```TypeScript
   * const api = RequestInterceptor.create({
   *   baseUrl: 'https://api.example.com',
   *   auth: {
   *     type: 'bearer',
   *     token: () => localStorage.getItem('token') ?? '',
   *   },
   * });
   * ```
   *
   * @example With API key authentication
   * ```TypeScript
   * const api = RequestInterceptor.create({
   *   baseUrl: 'https://api.example.com',
   *   auth: {
   *     type: 'api-key',
   *     apiKey: 'your-api-key',
   *     apiKeyHeader: 'X-Custom-API-Key',
   *   },
   * });
   * ```
   *
   * @example With middleware
   * ```TypeScript
   * const api = RequestInterceptor.create({
   *   baseUrl: 'https://api.example.com',
   * });
   *
   * api.use({
   *   onRequest: (config) => {
   *     config.headers.set('X-Request-ID', crypto.randomUUID());
   *     return config;
   *   },
   *   onResponse: (response) => {
   *     if (response.status === 401) {
   *       // Handle unauthorized
   *     }
   *     return response;
   *   },
   *   onError: (error) => {
   *     console.error('Request failed:', error);
   *   },
   * });
   * ```
   *
   * @example With timing
   * ```TypeScript
   * const api = RequestInterceptor.create({
   *   baseUrl: 'https://api.example.com',
   * });
   *
   * api.onTiming((timing) => {
   *   console.log(`${timing.method} ${timing.url}: ${timing.duration}ms`);
   * });
   * ```
   *
   * @example With automatic retry
   * ```TypeScript
   * // Retries idempotent requests on 408/429/500/502/503/504 and network
   * // errors with exponential backoff, honoring Retry-After headers
   * const api = RequestInterceptor.create({
   *   baseUrl: 'https://api.example.com',
   *   retry: { maxRetries: 3 },
   * });
   *
   * // Opt POST in explicitly (may duplicate side effects)
   * const submitApi = RequestInterceptor.create({
   *   baseUrl: 'https://api.example.com',
   *   retry: { maxRetries: 2, methods: ['GET', 'POST'] },
   * });
   * ```
   *
   * @example With request deduplication
   * ```TypeScript
   * // Identical concurrent GET/HEAD/OPTIONS requests share one execution;
   * // every caller receives an independent clone of the response
   * const api = RequestInterceptor.create({
   *   baseUrl: 'https://api.example.com',
   *   dedupe: {},
   * });
   *
   * const [a, b] = await Promise.all([api.get('/users'), api.get('/users')]);
   * // one physical request; a and b are independently readable
   *
   * // Opt a single request out
   * await api.get('/users', { dedupe: false });
   * ```
   */
  create(config: RequestInterceptorConfig = {}): RequestInterceptorInstance {
    if (!RequestInterceptor.isSupported()) {
      throw RequestError.fetchNotSupported();
    }

    // Merge with defaults
    const options = {
      ...DEFAULT_CONFIG,
      ...config,
      defaultHeaders: { ...DEFAULT_CONFIG.defaultHeaders, ...config.defaultHeaders },
      allowedProtocols: config.allowedProtocols ?? DEFAULT_CONFIG.allowedProtocols,
      blockedPatterns: config.blockedPatterns ?? DEFAULT_CONFIG.blockedPatterns,
      blockPrivateIPs: config.blockPrivateIPs ?? DEFAULT_CONFIG.blockPrivateIPs,
    };

    // Validate base URL if provided
    if (options.baseUrl) {
      validateUrl(
        options.baseUrl,
        options.allowedProtocols,
        options.blockedPatterns,
        options.blockPrivateIPs
      );
    }

    // Resolve and validate retry configuration once (opt-in)
    const retryConfig: ResolvedRetryConfig | null =
      options.retry !== undefined ? resolveRetryConfig(options.retry) : null;

    // Resolve and validate dedupe configuration once (opt-in)
    const dedupeConfig: ResolvedDedupeConfig | null =
      options.dedupe !== undefined ? resolveDedupeConfig(options.dedupe) : null;

    // Shared in-flight requests, keyed by method + URL + caller headers
    const inFlight = new Map<string, InFlightRequest>();

    // State
    let currentAuth: AuthConfig | null = options.auth ?? null;
    const middlewares: RequestMiddleware[] = [];
    const timingHandlers = new Set<TimingHandler>();
    let destroyed = false;
    let instanceAbortController = new AbortController();

    /**
     * Build full URL from relative or absolute URL.
     */
    const buildUrl = (url: string): string => {
      // noinspection HttpUrlsUsage - checking protocol prefix, not a URL
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }

      if (options.baseUrl) {
        const base = options.baseUrl.endsWith('/') ? options.baseUrl.slice(0, -1) : options.baseUrl;
        const path = url.startsWith('/') ? url : `/${url}`;
        return `${base}${path}`;
      }

      return url;
    };

    /**
     * Build initial request configuration.
     */
    const buildRequestConfig = async (
      url: string,
      init?: RequestInit
    ): Promise<MutableRequestConfig> => {
      const fullUrl = buildUrl(url);

      // Validate URL
      validateUrl(
        fullUrl,
        options.allowedProtocols,
        options.blockedPatterns,
        options.blockPrivateIPs
      );

      // Build headers
      const headers = new Headers(init?.headers);

      // Apply default headers
      for (const [key, value] of Object.entries(options.defaultHeaders)) {
        if (!headers.has(key)) {
          headers.set(key, value);
        }
      }

      // Apply authentication
      const hasAuth = currentAuth !== null;
      await applyAuth(headers, currentAuth);

      // Validate credential origin
      validateCredentialOrigin(fullUrl, options.baseUrl, hasAuth, options.validateCredentialOrigin);

      const method = init?.method?.toUpperCase() ?? 'GET';

      return {
        url: fullUrl,
        method: method as HttpMethod,
        headers,
        body: init?.body,
        timeout: options.timeout,
        signal: init?.signal ?? undefined,
        metadata: {},
        expectedContentType: options.expectedContentType,
      };
    };

    /**
     * Create timeout for request.
     */
    const createTimeout = (
      timeout: number | undefined,
      abortController: AbortController
    ): ReturnType<typeof setTimeout> | null => {
      if (timeout === undefined || timeout <= 0) {
        return null;
      }
      return setTimeout(() => abortController.abort(), timeout);
    };

    /**
     * Convert error to RequestError.
     * User/instance aborts are classified by signal state in performAttempt
     * before this runs, so a remaining AbortError is a timeout.
     */
    const toRequestError = (e: unknown, url: string, timeout: number): RequestError => {
      if (e instanceof RequestError) {
        return e;
      }
      if (e instanceof DOMException && e.name === 'AbortError') {
        return RequestError.timeout(url, timeout);
      }
      return RequestError.requestFailed(url, e);
    };

    /**
     * Freeze config for error handlers.
     */
    const freezeConfig = (config: MutableRequestConfig): RequestConfig => {
      return Object.freeze({
        url: config.url,
        method: config.method,
        headers: config.headers,
        body: config.body,
        timeout: config.timeout,
        signal: config.signal,
        metadata: config.metadata ? Object.freeze({ ...config.metadata }) : undefined,
        expectedContentType: config.expectedContentType,
      });
    };

    /**
     * Run a request through middleware, the retry loop, and finalization.
     * Runs exactly once per physical request; deduplicated callers attach
     * to the returned promise instead of getting their own run.
     */
    const runRequest = async (
      initialConfig: MutableRequestConfig,
      instanceSignal: AbortSignal,
      dedupedCallers: (() => number) | null
    ): Promise<Response> => {
      // Run request middleware (once - retries reuse the final config)
      const config = await runRequestMiddleware(initialConfig, middlewares);

      const startTime = performance.now();
      const frozenConfig = freezeConfig(config);

      // Timing extension for the dedupe path: number of extra callers served
      const dedupeTiming = (): { dedupedCallers?: number } =>
        dedupedCallers !== null ? { dedupedCallers: dedupedCallers() } : {};

      // Finalize a failed request: emit timing, run error middleware, throw
      const fail = async (error: RequestError): Promise<never> => {
        const endTime = performance.now();

        emitTiming(
          {
            url: config.url,
            method: config.method,
            startTime,
            endTime,
            duration: endTime - startTime,
            error: error.message,
            ...dedupeTiming(),
          },
          timingHandlers
        );

        await runErrorMiddleware(error, frozenConfig, middlewares);
        throw error;
      };

      // Wait out a retry delay; a user or instance abort ends the request
      const waitBeforeRetry = async (ms: number): Promise<void> => {
        try {
          await waitRetryDelay(ms, [config.signal, instanceSignal]);
        } catch {
          await fail(RequestError.aborted(config.url));
        }
      };

      // Combine long-lived signals (instance-level + user-provided) once per
      // request; the AbortSignal.any() dependency is platform-managed
      const baseSignal: AbortSignal = config.signal
        ? combineAbortSignals(config.signal, instanceSignal)
        : instanceSignal;

      // Single fetch attempt with per-attempt timeout; failures are
      // converted to RequestError
      const performAttempt = async (): Promise<Response> => {
        const abortController = new AbortController();
        const timeoutId = createTimeout(config.timeout, abortController);
        const timeoutMs = config.timeout ?? options.timeout;

        const signal = combineAbortSignals(baseSignal, abortController.signal);

        try {
          const response = await fetch(config.url, {
            method: config.method,
            headers: config.headers,
            body: config.body,
            signal,
          });

          if (timeoutId !== null) clearTimeout(timeoutId);

          return response;
        } catch (e) {
          if (timeoutId !== null) clearTimeout(timeoutId);

          // Classify aborts by signal state, not by the thrown value:
          // AbortSignal.any() propagates custom abort reasons into fetch's
          // rejection, which would otherwise be misread as a network failure
          if (signal.aborted) {
            const wasUserAborted = config.signal?.aborted === true || instanceSignal.aborted;
            throw wasUserAborted
              ? RequestError.aborted(config.url)
              : RequestError.timeout(config.url, timeoutMs);
          }

          throw toRequestError(e, config.url, timeoutMs);
        }
      };

      // Finalize the accepted response: response middleware, Content-Type
      // validation, timing, and throwOnError handling
      const finalize = async (response: Response): Promise<Response> => {
        const endTime = performance.now();
        const duration = endTime - startTime;

        let interceptedResponse: InterceptedResponse = {
          response,
          url: config.url,
          duration,
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        };

        interceptedResponse = await runResponseMiddleware(interceptedResponse, middlewares);

        // Validate Content-Type if expected type is configured
        if (config.expectedContentType !== undefined) {
          validateContentType(interceptedResponse.headers, config.expectedContentType);
        }

        if (options.throwOnError && !response.ok) {
          const error = RequestError.responseError(
            response.status,
            response.statusText,
            parseRetryAfter(interceptedResponse.headers.get('Retry-After')) ?? undefined
          );

          // A response was received AND the request fails: one timing event
          // carrying both the status and the error
          emitTiming(
            {
              url: config.url,
              method: config.method,
              startTime,
              endTime,
              duration,
              status: response.status,
              error: error.message,
              ...dedupeTiming(),
            },
            timingHandlers
          );

          await runErrorMiddleware(error, frozenConfig, middlewares);
          // noinspection ExceptionCaughtLocallyJS
          throw new FinalizedRequestError(error);
        }

        emitTiming(
          {
            url: config.url,
            method: config.method,
            startTime,
            endTime,
            duration,
            status: response.status,
            ...dedupeTiming(),
          },
          timingHandlers
        );

        return interceptedResponse.response;
      };

      // Retry eligibility is fixed per request: opt-in config, retryable
      // method, and a body that can be replayed (streams are single-use)
      const retry = eligibleRetryConfig(retryConfig, config.method, config.body);
      let attempt = 0;
      let retryDelayMs: number | null = null;

      for (;;) {
        if (retryDelayMs !== null) {
          await waitBeforeRetry(retryDelayMs);
          retryDelayMs = null;
        }

        try {
          const response = await performAttempt();

          const delay = retryDelayForResponse(retry, attempt, response);
          if (delay !== null) {
            attempt++;
            retryDelayMs = delay;
            await discardResponseBody(response);
            continue;
          }

          return await finalize(response);
        } catch (e) {
          if (e instanceof FinalizedRequestError) {
            // Timing and error middleware already ran in finalize
            throw e.error;
          }

          const error = toRequestError(e, config.url, config.timeout ?? options.timeout);

          const delay = retryDelayForError(retry, attempt, error);
          if (delay !== null) {
            attempt++;
            retryDelayMs = delay;
            continue;
          }

          return fail(error);
        }
      }
    };

    /**
     * Execute a fetch request, sharing identical in-flight requests when
     * deduplication applies.
     */
    const executeFetch = async (url: string, init?: InterceptorRequestInit): Promise<Response> => {
      if (destroyed) {
        throw RequestError.invalidConfig('Interceptor has been destroyed');
      }

      // Capture instance abort signal before any async work
      const instanceSignal = instanceAbortController.signal;

      // Build config (URL validation and auth run for every caller)
      const config = await buildRequestConfig(url, init);

      // An already-aborted caller takes the plain path: starting a shared
      // execution for it would run an unobserved request no caller waits on
      const useDedupe =
        dedupeConfig !== null &&
        init?.dedupe !== false &&
        dedupeConfig.methods.has(config.method) &&
        config.signal?.aborted !== true;

      if (!useDedupe) {
        return runRequest(config, instanceSignal, null);
      }

      // The key uses the caller-supplied headers, not the merged config
      // headers: instance-level defaults and auth are identical for every
      // request of this instance and would leak credentials into the key
      const key = dedupeKey(config.method, config.url, new Headers(init?.headers));

      const existing = inFlight.get(key);
      if (existing !== undefined) {
        return attachCaller(existing, config.signal, config.url);
      }

      // Initiate the shared execution: the caller's signal is replaced by
      // the shared refcounted signal; the caller attaches like everyone else
      const callerSignal = config.signal;
      let entry: InFlightRequest | null = null;
      const created = createInFlightRequest((sharedSignal) => {
        config.signal = sharedSignal;
        return runRequest(config, instanceSignal, () =>
          entry !== null ? entry.totalCallers - 1 : 0
        );
      });
      entry = created;

      inFlight.set(key, created);
      const cleanup = (): void => {
        inFlight.delete(key);
      };
      created.promise.then(cleanup, cleanup);

      return attachCaller(created, callerSignal, config.url);
    };

    return {
      fetch: executeFetch,

      get(url: string, options?: Omit<InterceptorRequestInit, 'method'>): Promise<Response> {
        return executeFetch(url, { ...options, method: 'GET' });
      },

      post(
        url: string,
        body?: BodyInit | null,
        options?: Omit<RequestInit, 'method' | 'body'>
      ): Promise<Response> {
        return executeFetch(url, { ...options, method: 'POST', body });
      },

      put(
        url: string,
        body?: BodyInit | null,
        options?: Omit<RequestInit, 'method' | 'body'>
      ): Promise<Response> {
        return executeFetch(url, { ...options, method: 'PUT', body });
      },

      patch(
        url: string,
        body?: BodyInit | null,
        options?: Omit<RequestInit, 'method' | 'body'>
      ): Promise<Response> {
        return executeFetch(url, { ...options, method: 'PATCH', body });
      },

      delete(url: string, options?: Omit<RequestInit, 'method'>): Promise<Response> {
        return executeFetch(url, { ...options, method: 'DELETE' });
      },

      head(url: string, options?: Omit<InterceptorRequestInit, 'method'>): Promise<Response> {
        return executeFetch(url, { ...options, method: 'HEAD' });
      },

      options(url: string, init?: Omit<InterceptorRequestInit, 'method'>): Promise<Response> {
        return executeFetch(url, { ...init, method: 'OPTIONS' });
      },

      use(middleware: RequestMiddleware): CleanupFn {
        middlewares.push(middleware);
        return () => {
          const index = middlewares.indexOf(middleware);
          if (index !== -1) {
            middlewares.splice(index, 1);
          }
        };
      },

      onTiming(handler: TimingHandler): CleanupFn {
        timingHandlers.add(handler);
        return () => timingHandlers.delete(handler);
      },

      getConfig(): Readonly<RequestInterceptorConfig> {
        return Object.freeze({
          baseUrl: options.baseUrl,
          timeout: options.timeout,
          defaultHeaders: Object.freeze({ ...options.defaultHeaders }),
          auth: currentAuth ? Object.freeze({ ...currentAuth }) : undefined,
          throwOnError: options.throwOnError,
          allowedProtocols: Object.freeze([...options.allowedProtocols]),
          blockedPatterns: Object.freeze([...options.blockedPatterns]),
          validateCredentialOrigin: options.validateCredentialOrigin,
          blockPrivateIPs: options.blockPrivateIPs,
          expectedContentType: options.expectedContentType,
          retry: options.retry ? Object.freeze({ ...options.retry }) : undefined,
          dedupe: options.dedupe ? Object.freeze({ ...options.dedupe }) : undefined,
        });
      },

      setAuth(auth: AuthConfig | null): void {
        currentAuth = auth;
        // The dedupe key excludes auth on the invariant that it is
        // identical for every request of this instance. An auth change
        // breaks that invariant for in-flight entries, so drop them:
        // new callers start fresh requests under the new credentials
        // instead of receiving a response from the old security context.
        inFlight.clear();
      },

      abortAll(): void {
        instanceAbortController.abort();
        instanceAbortController = new AbortController();
        // Doomed shared entries only leave the map when their promises
        // settle (async); clear now so new requests never attach to them
        inFlight.clear();
      },

      destroy(): void {
        instanceAbortController.abort();
        destroyed = true;
        middlewares.length = 0;
        timingHandlers.clear();
        inFlight.clear();
        currentAuth = null;
      },
    };
  },

  /**
   * Check if a header name is sensitive (should not be logged).
   */
  isSensitiveHeader(name: string): boolean {
    return SENSITIVE_HEADERS.has(name.toLowerCase());
  },

  /**
   * Redact sensitive headers from a Headers object for logging.
   */
  redactHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};

    headers.forEach((value, key) => {
      result[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? '[REDACTED]' : value;
    });

    return result;
  },
};
