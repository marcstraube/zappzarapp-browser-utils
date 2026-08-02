/**
 * RequestRetry Tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RequestInterceptor, RequestError } from '../../src/request/index.js';
import {
  resolveRetryConfig,
  isReplayableBody,
  isRetryableError,
  computeRetryDelay,
  waitRetryDelay,
  discardResponseBody,
} from '../../src/request/RequestRetry.js';

const BASE_URL = 'https://api.example.com';

describe('RequestRetry', () => {
  describe('resolveRetryConfig', () => {
    it('should apply defaults', () => {
      const resolved = resolveRetryConfig({});

      expect(resolved.maxRetries).toBe(3);
      expect(resolved.backoff).toBe('exponential');
      expect(resolved.baseDelay).toBe(1000);
      expect(resolved.maxDelay).toBe(30000);
      expect(resolved.jitter).toBe(true);
      expect(resolved.methods).toEqual(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);
      expect(resolved.statusCodes).toEqual([408, 429, 500, 502, 503, 504]);
    });

    it('should keep explicit values', () => {
      const resolved = resolveRetryConfig({
        maxRetries: 1,
        backoff: 'constant',
        baseDelay: 50,
        maxDelay: 100,
        jitter: false,
        methods: ['GET'],
        statusCodes: [429],
      });

      expect(resolved.maxRetries).toBe(1);
      expect(resolved.backoff).toBe('constant');
      expect(resolved.baseDelay).toBe(50);
      expect(resolved.maxDelay).toBe(100);
      expect(resolved.jitter).toBe(false);
      expect(resolved.methods).toEqual(['GET']);
      expect(resolved.statusCodes).toEqual([429]);
    });

    it('should reject negative maxRetries', () => {
      expect(() => resolveRetryConfig({ maxRetries: -1 })).toThrow(RequestError);
    });

    it('should reject non-integer maxRetries', () => {
      expect(() => resolveRetryConfig({ maxRetries: 1.5 })).toThrow(RequestError);
    });

    it('should reject non-positive baseDelay', () => {
      expect(() => resolveRetryConfig({ baseDelay: 0 })).toThrow(RequestError);
    });

    it('should reject non-positive maxDelay', () => {
      expect(() => resolveRetryConfig({ maxDelay: 0 })).toThrow(RequestError);
    });

    it('should reject empty methods', () => {
      expect(() => resolveRetryConfig({ methods: [] })).toThrow(RequestError);
    });

    it('should reject empty statusCodes', () => {
      expect(() => resolveRetryConfig({ statusCodes: [] })).toThrow(RequestError);
    });
  });

  describe('isReplayableBody', () => {
    it('should accept absent bodies', () => {
      expect(isReplayableBody(undefined)).toBe(true);
      expect(isReplayableBody(null)).toBe(true);
    });

    it('should accept reusable body types', () => {
      expect(isReplayableBody('{"a":1}')).toBe(true);
      expect(isReplayableBody(new Blob(['data']))).toBe(true);
      expect(isReplayableBody(new URLSearchParams({ a: '1' }))).toBe(true);
    });

    it('should reject ReadableStream bodies', () => {
      expect(isReplayableBody(new ReadableStream())).toBe(false);
    });
  });

  describe('isRetryableError', () => {
    it('should retry network failures and timeouts', () => {
      expect(isRetryableError(RequestError.requestFailed(BASE_URL))).toBe(true);
      expect(isRetryableError(RequestError.timeout(BASE_URL, 1000))).toBe(true);
    });

    it('should not retry aborts or non-transient errors', () => {
      expect(isRetryableError(RequestError.aborted(BASE_URL))).toBe(false);
      expect(isRetryableError(RequestError.responseError(500, 'Server Error'))).toBe(false);
      expect(isRetryableError(RequestError.invalidConfig('bad'))).toBe(false);
    });
  });

  describe('computeRetryDelay', () => {
    const config = resolveRetryConfig({ baseDelay: 1000, maxDelay: 5000, jitter: false });

    it('should use the Retry-After header when present', () => {
      expect(computeRetryDelay(config, 1, '2')).toBe(2000);
    });

    it('should cap the Retry-After delay at maxDelay', () => {
      expect(computeRetryDelay(config, 1, '100')).toBe(5000);
    });

    it('should fall back to backoff for missing headers', () => {
      expect(computeRetryDelay(config, 1, null)).toBe(1000);
      expect(computeRetryDelay(config, 2, null)).toBe(2000);
    });

    it('should fall back to backoff for invalid headers', () => {
      expect(computeRetryDelay(config, 1, 'soon')).toBe(1000);
    });
  });

  describe('waitRetryDelay', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should resolve after the given delay', async () => {
      let resolved = false;
      void waitRetryDelay(1000, []).then(() => {
        resolved = true;
      });

      await vi.advanceTimersByTimeAsync(999);
      expect(resolved).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      expect(resolved).toBe(true);
    });

    it('should ignore undefined signals', async () => {
      let resolved = false;
      void waitRetryDelay(100, [undefined, undefined]).then(() => {
        resolved = true;
      });

      await vi.advanceTimersByTimeAsync(100);
      expect(resolved).toBe(true);
    });

    it('should reject immediately for an already aborted signal', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(waitRetryDelay(1000, [controller.signal])).rejects.toMatchObject({
        name: 'AbortError',
      });
    });

    it('should reject when a signal aborts during the wait', async () => {
      const controller = new AbortController();
      const promise = waitRetryDelay(1000, [undefined, controller.signal]);
      const guarded = promise.catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(500);
      controller.abort();

      const error = await guarded;
      expect(error).toBeInstanceOf(DOMException);
      expect((error as DOMException).name).toBe('AbortError');
    });
  });

  describe('discardResponseBody', () => {
    it('should cancel the response body', async () => {
      const cancel = vi.fn().mockResolvedValue(undefined);
      const response = { body: { cancel } } as unknown as Response;

      await discardResponseBody(response);

      expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('should tolerate responses without a body', async () => {
      const response = { body: null } as unknown as Response;

      await expect(discardResponseBody(response)).resolves.toBeUndefined();
    });

    it('should ignore cancel failures', async () => {
      const cancel = vi.fn().mockRejectedValue(new Error('locked'));
      const response = { body: { cancel } } as unknown as Response;

      await expect(discardResponseBody(response)).resolves.toBeUndefined();
    });
  });
});

describe('RequestInterceptor retry integration', () => {
  let originalFetch: typeof fetch;
  let mockFetch: ReturnType<typeof vi.fn<typeof fetch>>;

  const respond = (status: number, headers?: Record<string, string>): Response =>
    new Response(status === 204 ? null : '{"ok":true}', { status, headers });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    originalFetch = globalThis.fetch;
    mockFetch = vi.fn<typeof fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('config validation', () => {
    it('should reject invalid retry config at create time', () => {
      expect(() => RequestInterceptor.create({ retry: { baseDelay: -1 } })).toThrow(RequestError);
    });

    it('should expose the retry config via getConfig', () => {
      const api = RequestInterceptor.create({ retry: { maxRetries: 2 } });

      expect(api.getConfig().retry).toEqual({ maxRetries: 2 });
    });

    it('should leave retry undefined in getConfig when not configured', () => {
      const api = RequestInterceptor.create({});

      expect(api.getConfig().retry).toBeUndefined();
    });
  });

  describe('status-based retry', () => {
    it('should retry a retryable status and return the successful response', async () => {
      mockFetch.mockResolvedValueOnce(respond(503)).mockResolvedValueOnce(respond(200));
      const api = RequestInterceptor.create({
        retry: { maxRetries: 3, baseDelay: 1000, jitter: false },
      });

      const promise = api.get(`${BASE_URL}/data`);
      await vi.advanceTimersByTimeAsync(1000);
      const response = await promise;

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry without retry config', async () => {
      mockFetch.mockResolvedValueOnce(respond(503));
      const api = RequestInterceptor.create({});

      const response = await api.get(`${BASE_URL}/data`);

      expect(response.status).toBe(503);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not retry non-retryable status codes', async () => {
      mockFetch.mockResolvedValueOnce(respond(404));
      const api = RequestInterceptor.create({ retry: { maxRetries: 3, jitter: false } });

      const response = await api.get(`${BASE_URL}/missing`);

      expect(response.status).toBe(404);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should honor a statusCodes override', async () => {
      mockFetch.mockResolvedValueOnce(respond(418)).mockResolvedValueOnce(respond(200));
      const api = RequestInterceptor.create({
        retry: { maxRetries: 1, baseDelay: 100, jitter: false, statusCodes: [418] },
      });

      const promise = api.get(`${BASE_URL}/teapot`);
      await vi.advanceTimersByTimeAsync(100);
      const response = await promise;

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should return the final response when retries are exhausted', async () => {
      mockFetch.mockImplementation(() => Promise.resolve(respond(503)));
      const api = RequestInterceptor.create({
        retry: { maxRetries: 2, baseDelay: 1000, backoff: 'exponential', jitter: false },
      });

      const promise = api.get(`${BASE_URL}/down`);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      const response = await promise;

      expect(response.status).toBe(503);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry with maxRetries 0', async () => {
      mockFetch.mockResolvedValueOnce(respond(503));
      const api = RequestInterceptor.create({ retry: { maxRetries: 0 } });

      const response = await api.get(`${BASE_URL}/data`);

      expect(response.status).toBe(503);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Retry-After header', () => {
    it('should wait exactly the delta-seconds delay instead of backoff', async () => {
      mockFetch
        .mockResolvedValueOnce(respond(429, { 'Retry-After': '2' }))
        .mockResolvedValueOnce(respond(200));
      const api = RequestInterceptor.create({
        retry: { maxRetries: 1, baseDelay: 100, jitter: false },
      });

      const promise = api.get(`${BASE_URL}/limited`);

      await vi.advanceTimersByTimeAsync(1999);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      const response = await promise;

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should honor an HTTP-date Retry-After', async () => {
      mockFetch
        .mockResolvedValueOnce(
          respond(503, { 'Retry-After': new Date(Date.now() + 3000).toUTCString() })
        )
        .mockResolvedValueOnce(respond(200));
      const api = RequestInterceptor.create({
        retry: { maxRetries: 1, baseDelay: 100, jitter: false },
      });

      const promise = api.get(`${BASE_URL}/maintenance`);

      await vi.advanceTimersByTimeAsync(2999);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      const response = await promise;

      expect(response.status).toBe(200);
    });

    it('should cap the Retry-After delay at maxDelay', async () => {
      mockFetch
        .mockResolvedValueOnce(respond(429, { 'Retry-After': '100' }))
        .mockResolvedValueOnce(respond(200));
      const api = RequestInterceptor.create({
        retry: { maxRetries: 1, baseDelay: 100, maxDelay: 5000, jitter: false },
      });

      const promise = api.get(`${BASE_URL}/limited`);

      await vi.advanceTimersByTimeAsync(4999);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      const response = await promise;

      expect(response.status).toBe(200);
    });

    it('should fall back to backoff for an invalid Retry-After', async () => {
      mockFetch
        .mockResolvedValueOnce(respond(503, { 'Retry-After': 'soon' }))
        .mockResolvedValueOnce(respond(200));
      const api = RequestInterceptor.create({
        retry: { maxRetries: 1, baseDelay: 700, jitter: false },
      });

      const promise = api.get(`${BASE_URL}/data`);
      await vi.advanceTimersByTimeAsync(700);
      const response = await promise;

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('method eligibility', () => {
    it('should not retry POST by default', async () => {
      mockFetch.mockResolvedValueOnce(respond(503));
      const api = RequestInterceptor.create({ retry: { maxRetries: 3, jitter: false } });

      const response = await api.post(`${BASE_URL}/submit`, '{"a":1}');

      expect(response.status).toBe(503);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry POST with an explicit methods override', async () => {
      mockFetch.mockResolvedValueOnce(respond(503)).mockResolvedValueOnce(respond(200));
      const api = RequestInterceptor.create({
        retry: { maxRetries: 1, baseDelay: 100, jitter: false, methods: ['GET', 'POST'] },
      });

      const promise = api.post(`${BASE_URL}/submit`, '{"a":1}');
      await vi.advanceTimersByTimeAsync(100);
      const response = await promise;

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry PUT by default', async () => {
      mockFetch.mockResolvedValueOnce(respond(503)).mockResolvedValueOnce(respond(200));
      const api = RequestInterceptor.create({
        retry: { maxRetries: 1, baseDelay: 100, jitter: false },
      });

      const promise = api.put(`${BASE_URL}/item`, '{"a":1}');
      await vi.advanceTimersByTimeAsync(100);
      const response = await promise;

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('body eligibility', () => {
    it('should not retry requests with a ReadableStream body', async () => {
      mockFetch.mockResolvedValueOnce(respond(503));
      const api = RequestInterceptor.create({ retry: { maxRetries: 3, jitter: false } });

      const response = await api.put(`${BASE_URL}/upload`, new ReadableStream());

      expect(response.status).toBe(503);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('network errors', () => {
    it('should retry network failures', async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(respond(200));
      const api = RequestInterceptor.create({
        retry: { maxRetries: 1, baseDelay: 1000, jitter: false },
      });

      const promise = api.get(`${BASE_URL}/flaky`);
      await vi.advanceTimersByTimeAsync(1000);
      const response = await promise;

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry timeouts', async () => {
      mockFetch
        .mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'))
        .mockResolvedValueOnce(respond(200));
      const api = RequestInterceptor.create({
        retry: { maxRetries: 1, baseDelay: 1000, jitter: false },
      });

      const promise = api.get(`${BASE_URL}/slow`);
      await vi.advanceTimersByTimeAsync(1000);
      const response = await promise;

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw after exhausting retries on persistent network failures', async () => {
      mockFetch.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
      const api = RequestInterceptor.create({
        retry: { maxRetries: 2, baseDelay: 1000, backoff: 'constant', jitter: false },
      });

      const guarded = api.get(`${BASE_URL}/dead`).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(2000);
      const error = await guarded;

      expect(error).toBeInstanceOf(RequestError);
      expect((error as RequestError).code).toBe('REQUEST_FAILED');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry user aborts', async () => {
      const controller = new AbortController();
      mockFetch.mockImplementationOnce(() => {
        controller.abort();
        return Promise.reject(new DOMException('The operation was aborted', 'AbortError'));
      });
      const api = RequestInterceptor.create({ retry: { maxRetries: 3, jitter: false } });

      const guarded = api
        .get(`${BASE_URL}/cancelled`, { signal: controller.signal })
        .catch((e: unknown) => e);
      const error = await guarded;

      expect(error).toBeInstanceOf(RequestError);
      expect((error as RequestError).code).toBe('ABORTED');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should abort with ABORTED when the signal fires during the retry wait', async () => {
      const controller = new AbortController();
      mockFetch.mockResolvedValueOnce(respond(503));
      const api = RequestInterceptor.create({
        retry: { maxRetries: 1, baseDelay: 5000, jitter: false },
      });

      const guarded = api
        .get(`${BASE_URL}/data`, { signal: controller.signal })
        .catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(1000);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      controller.abort();

      const error = await guarded;
      expect(error).toBeInstanceOf(RequestError);
      expect((error as RequestError).code).toBe('ABORTED');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('interplay with throwOnError and middleware', () => {
    it('should retry first and throw the final RESPONSE_ERROR with retryAfterMs', async () => {
      mockFetch.mockImplementation(() => Promise.resolve(respond(429, { 'Retry-After': '7' })));
      const api = RequestInterceptor.create({
        throwOnError: true,
        retry: { maxRetries: 1, baseDelay: 100, jitter: false },
      });

      const guarded = api.get(`${BASE_URL}/limited`).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(7000);
      const error = await guarded;

      expect(error).toBeInstanceOf(RequestError);
      expect((error as RequestError).code).toBe('RESPONSE_ERROR');
      expect((error as RequestError).retryAfterMs).toBe(7000);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should run error middleware and timing once for an exhausted throwOnError request', async () => {
      mockFetch.mockImplementation(() => Promise.resolve(respond(503)));
      const api = RequestInterceptor.create({
        throwOnError: true,
        retry: { maxRetries: 1, baseDelay: 100, jitter: false },
      });
      const onError = vi.fn();
      api.use({ onError });
      const timingHandler = vi.fn();
      api.onTiming(timingHandler);

      const guarded = api.get(`${BASE_URL}/down`).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(100);
      const error = await guarded;

      expect(error).toBeInstanceOf(RequestError);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(timingHandler).toHaveBeenCalledTimes(1);
      expect(timingHandler).toHaveBeenCalledWith(
        expect.objectContaining({ status: 503, error: expect.stringContaining('503') })
      );
    });

    it('should emit timing once for a retried request', async () => {
      mockFetch.mockResolvedValueOnce(respond(503)).mockResolvedValueOnce(respond(200));
      const api = RequestInterceptor.create({
        retry: { maxRetries: 1, baseDelay: 100, jitter: false },
      });
      const timings: number[] = [];
      api.onTiming((timing) => {
        if (timing.status !== undefined) {
          timings.push(timing.status);
        }
      });

      const promise = api.get(`${BASE_URL}/data`);
      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(timings).toEqual([200]);
    });

    it('should run response middleware only for the final response', async () => {
      mockFetch.mockResolvedValueOnce(respond(503)).mockResolvedValueOnce(respond(200));
      const api = RequestInterceptor.create({
        retry: { maxRetries: 1, baseDelay: 100, jitter: false },
      });
      const seen: number[] = [];
      api.use({
        onResponse: (response) => {
          seen.push(response.status);
          return response;
        },
      });

      const promise = api.get(`${BASE_URL}/data`);
      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(seen).toEqual([200]);
    });

    it('should not retry when response middleware throws after a successful fetch', async () => {
      mockFetch.mockImplementation(() => Promise.resolve(respond(200)));
      const api = RequestInterceptor.create({
        retry: { maxRetries: 3, baseDelay: 100, jitter: false },
      });
      api.use({
        onResponse: () => {
          throw new Error('middleware exploded');
        },
      });

      const error = await api.get(`${BASE_URL}/data`).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RequestError);
      expect((error as RequestError).code).toBe('MIDDLEWARE_ERROR');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should run request middleware only once per call', async () => {
      mockFetch.mockResolvedValueOnce(respond(503)).mockResolvedValueOnce(respond(200));
      const api = RequestInterceptor.create({
        retry: { maxRetries: 1, baseDelay: 100, jitter: false },
      });
      const onRequest = vi.fn((config) => config);
      api.use({ onRequest });

      const promise = api.get(`${BASE_URL}/data`);
      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(onRequest).toHaveBeenCalledTimes(1);
    });
  });
});
