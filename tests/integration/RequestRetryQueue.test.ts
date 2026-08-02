import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RequestInterceptor } from '../../src/request/index.js';
import { RetryQueue } from '../../src/network/index.js';

/**
 * Integration: RequestInterceptor + RetryQueue
 *
 * Tests the composition pattern where RetryQueue wraps RequestInterceptor.fetch()
 * to retry failed HTTP requests with backoff.
 */

describe('RequestInterceptor + RetryQueue', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();

    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true },
      writable: true,
      configurable: true,
    });

    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should retry failed requests through queue', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Network error')).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const interceptor = RequestInterceptor.create({
      baseUrl: 'https://api.example.com',
      allowedProtocols: ['https:'],
    });

    const queue = RetryQueue.create({
      maxRetries: 3,
      backoff: 'constant',
      baseDelay: 100,
      jitter: false,
    });

    const resultPromise = queue.add(async () => {
      const response = await interceptor.fetch('/data');
      return response.json() as Promise<{ data: string }>;
    });

    // Advance past retry delay
    await vi.advanceTimersByTimeAsync(200);

    const result = await resultPromise;

    expect(result).toEqual({ data: 'ok' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    interceptor.destroy();
    queue.destroy();
  });

  it('should exhaust retries and throw on persistent failure', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Network error'));

    const interceptor = RequestInterceptor.create({
      baseUrl: 'https://api.example.com',
      allowedProtocols: ['https:'],
    });

    const queue = RetryQueue.create({
      maxRetries: 2,
      backoff: 'constant',
      baseDelay: 100,
      jitter: false,
    });

    const resultPromise = queue.add(async () => {
      const response = await interceptor.fetch('/data');
      return response.json();
    });

    // Attach rejection handler before advancing timers to avoid unhandled rejection
    const assertion = expect(resultPromise).rejects.toThrow();

    // Advance through all retry attempts
    await vi.advanceTimersByTimeAsync(500);

    await assertion;
    // 1 initial + 2 retries = 3 total
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    interceptor.destroy();
    queue.destroy();
  });

  it('should track retry events when requests fail then succeed', async () => {
    fetchSpy
      .mockRejectedValueOnce(new TypeError('Network error'))
      .mockResolvedValueOnce(
        new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } })
      );

    const interceptor = RequestInterceptor.create({
      baseUrl: 'https://api.example.com',
      allowedProtocols: ['https:'],
    });

    const queue = RetryQueue.create({
      maxRetries: 3,
      backoff: 'constant',
      baseDelay: 50,
      jitter: false,
    });

    const retryEvents: number[] = [];
    queue.onRetry((attempt) => {
      retryEvents.push(attempt);
    });

    const resultPromise = queue.add(async () => {
      const response = await interceptor.fetch('/health');
      return response.text();
    });

    await vi.advanceTimersByTimeAsync(200);

    const result = await resultPromise;
    expect(result).toBe('ok');
    expect(retryEvents).toEqual([1]);

    interceptor.destroy();
    queue.destroy();
  });

  it('should honor Retry-After from a 429 via the retryAfterMs error hint', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response('slow down', {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'Retry-After': '3' },
        })
      )
      .mockResolvedValueOnce(
        new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } })
      );

    const interceptor = RequestInterceptor.create({
      baseUrl: 'https://api.example.com',
      allowedProtocols: ['https:'],
      throwOnError: true,
    });

    const queue = RetryQueue.create({
      maxRetries: 2,
      backoff: 'constant',
      baseDelay: 100,
      jitter: false,
    });

    const resultPromise = queue.add(async () => {
      const response = await interceptor.fetch('/rate-limited');
      return response.text();
    });

    // The queue must wait the server-provided 3s, not its 100ms backoff
    await vi.advanceTimersByTimeAsync(2900);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);

    const result = await resultPromise;
    expect(result).toBe('ok');
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    interceptor.destroy();
    queue.destroy();
  });

  it('should pass auth headers through interceptor within retried requests', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Network error')).mockResolvedValueOnce(
      new Response('authenticated', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    );

    const interceptor = RequestInterceptor.create({
      baseUrl: 'https://api.example.com',
      allowedProtocols: ['https:'],
      auth: { type: 'bearer', token: 'test-token' },
    });

    const queue = RetryQueue.create({
      maxRetries: 2,
      backoff: 'constant',
      baseDelay: 50,
      jitter: false,
    });

    const resultPromise = queue.add(async () => {
      const response = await interceptor.fetch('/protected');
      return response.text();
    });

    await vi.advanceTimersByTimeAsync(200);

    await resultPromise;

    // Both calls should include Authorization header
    const calls = fetchSpy.mock.calls as Array<[string, RequestInit]>;
    for (const [, init] of calls) {
      const headers = init.headers as Headers;
      expect(headers.get('Authorization')).toBe('Bearer test-token');
    }

    interceptor.destroy();
    queue.destroy();
  });
});
