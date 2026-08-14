import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RequestInterceptor, RequestError, DEDUPE_SAFE_METHODS } from '../../src/request/index.js';
import {
  resolveDedupeConfig,
  dedupeKey,
  createInFlightRequest,
  attachCaller,
} from '../../src/request/RequestDedupe.js';
import type { RequestTiming, RequestInterceptorInstance } from '../../src/request/index.js';

const BASE = 'https://api.example.com';

/** Flush pending microtasks/timers so async work settles. */
const flush = (): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('RequestDedupe', () => {
  // =========================================================================
  // resolveDedupeConfig
  // =========================================================================

  describe('resolveDedupeConfig', () => {
    it('should default to all safe methods', () => {
      const resolved = resolveDedupeConfig({});

      expect([...resolved.methods].sort()).toEqual([...DEDUPE_SAFE_METHODS].sort());
    });

    it('should accept a subset of safe methods', () => {
      const resolved = resolveDedupeConfig({ methods: ['GET'] });

      expect(resolved.methods.has('GET')).toBe(true);
      expect(resolved.methods.has('HEAD')).toBe(false);
    });

    it('should reject an empty methods list', () => {
      expect(() => resolveDedupeConfig({ methods: [] })).toThrowError(RequestError);
      expect(() => resolveDedupeConfig({ methods: [] })).toThrowError(/must not be empty/);
    });

    it('should reject unsafe methods', () => {
      const config = { methods: ['POST'] } as unknown as Parameters<typeof resolveDedupeConfig>[0];

      expect(() => resolveDedupeConfig(config)).toThrowError(/only allows safe methods/);
    });
  });

  // =========================================================================
  // dedupeKey
  // =========================================================================

  describe('dedupeKey', () => {
    it('should produce equal keys for identical requests', () => {
      const a = dedupeKey('GET', `${BASE}/users`, new Headers({ Accept: 'application/json' }));
      const b = dedupeKey('GET', `${BASE}/users`, new Headers({ Accept: 'application/json' }));

      expect(a).toBe(b);
    });

    it('should be insensitive to header insertion order', () => {
      const a = new Headers();
      a.set('Accept', 'application/json');
      a.set('X-Custom', '1');
      const b = new Headers();
      b.set('X-Custom', '1');
      b.set('Accept', 'application/json');

      expect(dedupeKey('GET', `${BASE}/users`, a)).toBe(dedupeKey('GET', `${BASE}/users`, b));
    });

    it('should differ for different methods, urls, and headers', () => {
      const base = dedupeKey('GET', `${BASE}/users`, new Headers());

      expect(dedupeKey('HEAD', `${BASE}/users`, new Headers())).not.toBe(base);
      expect(dedupeKey('GET', `${BASE}/other`, new Headers())).not.toBe(base);
      expect(dedupeKey('GET', `${BASE}/users`, new Headers({ 'X-A': '1' }))).not.toBe(base);
    });

    it('should not allow control characters in the url to forge field boundaries', () => {
      const withHeader = dedupeKey('GET', `${BASE}/x`, new Headers({ 'x-user-id': 'alice' }));
      const forged = dedupeKey('GET', `${BASE}/x\nx-user-id:alice`, new Headers());

      expect(forged).not.toBe(withHeader);
    });
  });

  // =========================================================================
  // createInFlightRequest / attachCaller
  // =========================================================================

  describe('attachCaller', () => {
    it('should reject immediately for an already-aborted signal', async () => {
      const entry = createInFlightRequest(() => Promise.resolve(new Response('ok')));
      const controller = new AbortController();
      controller.abort();

      await expect(attachCaller(entry, controller.signal, 'https://x')).rejects.toMatchObject({
        code: 'ABORTED',
      });
      expect(entry.totalCallers).toBe(0);
    });

    it('should hand every caller an independent clone', async () => {
      const entry = createInFlightRequest(() => Promise.resolve(new Response('shared-body')));

      const [a, b] = await Promise.all([
        attachCaller(entry, undefined, 'https://x'),
        attachCaller(entry, undefined, 'https://x'),
      ]);

      await expect(a.text()).resolves.toBe('shared-body');
      await expect(b.text()).resolves.toBe('shared-body');
      expect(entry.totalCallers).toBe(2);
    });

    it('should abort the underlying request only when all callers aborted', async () => {
      const shared = new Promise<Response>(() => {});
      const entry = createInFlightRequest(() => shared);
      const first = new AbortController();
      const second = new AbortController();

      const a = attachCaller(entry, first.signal, 'https://x');
      const b = attachCaller(entry, second.signal, 'https://x');

      first.abort();
      await expect(a).rejects.toMatchObject({ code: 'ABORTED' });
      expect(entry.controller.signal.aborted).toBe(false);

      second.abort();
      await expect(b).rejects.toMatchObject({ code: 'ABORTED' });
      expect(entry.controller.signal.aborted).toBe(true);
    });

    it('should wrap non-Error rejections for callers with a signal', async () => {
      const entry = createInFlightRequest(() => Promise.reject('string rejection'));
      const controller = new AbortController();

      const attached = attachCaller(entry, controller.signal, 'https://x');

      await expect(attached).rejects.toMatchObject({
        code: 'REQUEST_FAILED',
        cause: 'string rejection',
      });
    });

    it('should wrap non-Error rejections for callers without a signal', async () => {
      const entry = createInFlightRequest(() => Promise.reject('string rejection'));

      const attached = attachCaller(entry, undefined, 'https://x');

      await expect(attached).rejects.toMatchObject({
        code: 'REQUEST_FAILED',
        cause: 'string rejection',
      });
    });

    it('should not abort the underlying request after it settled', async () => {
      const entry = createInFlightRequest(() => Promise.resolve(new Response('ok')));
      const controller = new AbortController();

      const attached = attachCaller(entry, controller.signal, 'https://x');
      await expect(attached).resolves.toBeInstanceOf(Response);

      controller.abort();
      await flush();

      expect(entry.controller.signal.aborted).toBe(false);
    });
  });

  // =========================================================================
  // Interceptor integration
  // =========================================================================

  describe('RequestInterceptor integration', () => {
    let mockFetch: ReturnType<typeof vi.fn<typeof fetch>>;
    let originalFetch: typeof fetch;
    let api: RequestInterceptorInstance | null;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      mockFetch = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => new Response('{"ok":true}', { status: 200 }));
      globalThis.fetch = mockFetch;
      api = null;
    });

    afterEach(() => {
      api?.destroy();
      globalThis.fetch = originalFetch;
    });

    function createApi(
      config?: Parameters<typeof RequestInterceptor.create>[0]
    ): RequestInterceptorInstance {
      api = RequestInterceptor.create({ baseUrl: BASE, dedupe: {}, ...config });
      return api;
    }

    it('should share one physical request between concurrent identical GETs', async () => {
      const client = createApi();

      const [a, b] = await Promise.all([client.get('/users'), client.get('/users')]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      await expect(a.text()).resolves.toBe('{"ok":true}');
      await expect(b.text()).resolves.toBe('{"ok":true}');
    });

    it('should not dedupe without a dedupe configuration', async () => {
      api = RequestInterceptor.create({ baseUrl: BASE });

      await Promise.all([api.get('/users'), api.get('/users')]);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not dedupe requests that opt out per request', async () => {
      const client = createApi();

      await Promise.all([client.get('/users'), client.get('/users', { dedupe: false })]);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not dedupe unsafe methods', async () => {
      const client = createApi();

      await Promise.all([client.post('/users', '{}'), client.post('/users', '{}')]);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not dedupe methods outside the configured subset', async () => {
      const client = createApi({ dedupe: { methods: ['GET'] } });

      await Promise.all([client.head('/users'), client.head('/users')]);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not dedupe requests with different urls or headers', async () => {
      const client = createApi();

      await Promise.all([
        client.get('/users'),
        client.get('/other'),
        client.get('/users', { headers: { 'X-Custom': '1' } }),
      ]);

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should clean up after completion so later requests run fresh', async () => {
      const client = createApi();

      await client.get('/users');
      await client.get('/users');

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should reject invalid dedupe configuration at create time', () => {
      expect(() => RequestInterceptor.create({ baseUrl: BASE, dedupe: { methods: [] } })).toThrow(
        RequestError
      );
    });

    it('should reject all callers with the same error on failure', async () => {
      mockFetch.mockRejectedValue(new TypeError('network down'));
      const client = createApi();

      const results = await Promise.allSettled([client.get('/users'), client.get('/users')]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      for (const result of results) {
        expect(result.status).toBe('rejected');
        const reason = (result as PromiseRejectedResult).reason as RequestError;
        expect(reason).toBeInstanceOf(RequestError);
        expect(reason.code).toBe('REQUEST_FAILED');
      }
    });

    it('should propagate throwOnError failures to every caller', async () => {
      mockFetch.mockImplementation(
        async () => new Response('nope', { status: 500, statusText: 'Server Error' })
      );
      const client = createApi({ throwOnError: true });

      const results = await Promise.allSettled([client.get('/users'), client.get('/users')]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      for (const result of results) {
        const reason = (result as PromiseRejectedResult).reason as RequestError;
        expect(reason.code).toBe('RESPONSE_ERROR');
      }
    });

    it('should keep the shared request alive when one caller aborts', async () => {
      let resolveFetch: (response: Response) => void = () => {};
      mockFetch.mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          })
      );
      const client = createApi();
      const controller = new AbortController();

      const aborting = client.get('/users', { signal: controller.signal });
      const staying = client.get('/users');
      await flush();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      controller.abort();
      await expect(aborting).rejects.toMatchObject({ code: 'ABORTED' });

      resolveFetch(new Response('late-body'));
      await expect((await staying).text()).resolves.toBe('late-body');
    });

    it('should abort the physical request when every caller aborts', async () => {
      let fetchSignal: AbortSignal | undefined;
      mockFetch.mockImplementation(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            fetchSignal = init?.signal ?? undefined;
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError'))
            );
          })
      );
      const client = createApi();
      const first = new AbortController();
      const second = new AbortController();

      const a = client.get('/users', { signal: first.signal });
      const b = client.get('/users', { signal: second.signal });
      await flush();

      first.abort();
      await expect(a).rejects.toMatchObject({ code: 'ABORTED' });
      expect(fetchSignal?.aborted).toBe(false);

      second.abort();
      await expect(b).rejects.toMatchObject({ code: 'ABORTED' });
      await flush();
      expect(fetchSignal?.aborted).toBe(true);
    });

    it('should leave the shared request untouched by an already-aborted caller', async () => {
      let resolveFetch: (response: Response) => void = () => {};
      mockFetch.mockImplementation(
        (_url, init) =>
          new Promise<Response>((resolve, reject) => {
            if (init?.signal?.aborted === true) {
              reject(new DOMException('aborted', 'AbortError'));
              return;
            }
            resolveFetch = resolve;
          })
      );
      const client = createApi();
      const controller = new AbortController();
      controller.abort();

      const initiator = client.get('/users');
      await flush();
      // Takes the plain path (own immediately-aborted request), never attaches
      const abortedCaller = client.get('/users', { signal: controller.signal });

      await expect(abortedCaller).rejects.toMatchObject({ code: 'ABORTED' });
      expect(mockFetch).toHaveBeenCalledTimes(2);

      resolveFetch(new Response('ok'));
      await expect(initiator).resolves.toBeInstanceOf(Response);
    });

    it('should not attach new requests to entries doomed by abortAll', async () => {
      const resolvers: ((response: Response) => void)[] = [];
      mockFetch.mockImplementation(
        (_url, init) =>
          new Promise<Response>((resolve, reject) => {
            resolvers.push(resolve);
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError'))
            );
          })
      );
      const client = createApi();

      const doomed = client.get('/users');
      await flush();

      client.abortAll();
      const doomedRejection = expect(doomed).rejects.toMatchObject({ code: 'ABORTED' });
      // The doomed entry has not settled yet, but must already be gone
      const fresh = client.get('/users');
      await flush();

      expect(mockFetch).toHaveBeenCalledTimes(2);
      await doomedRejection;

      resolvers[1]?.(new Response('fresh-body'));
      await expect((await fresh).text()).resolves.toBe('fresh-body');
    });

    it('should take the plain path for an initiator with an already-aborted signal', async () => {
      mockFetch.mockImplementation(
        (_url, init) =>
          new Promise<Response>((resolve, reject) => {
            if (init?.signal?.aborted === true) {
              reject(new DOMException('aborted', 'AbortError'));
              return;
            }
            resolve(new Response('ok'));
          })
      );
      const client = createApi();
      const controller = new AbortController();
      controller.abort();

      // No shared entry is created, so no unobserved request keeps running
      await expect(client.get('/users', { signal: controller.signal })).rejects.toMatchObject({
        code: 'ABORTED',
      });

      const follower = await client.get('/users');
      await expect(follower.text()).resolves.toBe('ok');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should abort shared requests via abortAll', async () => {
      mockFetch.mockImplementation(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError'))
            );
          })
      );
      const client = createApi();

      const a = client.get('/users');
      const b = client.get('/users');
      await flush();

      client.abortAll();

      await expect(a).rejects.toMatchObject({ code: 'ABORTED' });
      await expect(b).rejects.toMatchObject({ code: 'ABORTED' });
    });

    it('should run request middleware once for the shared request', async () => {
      const client = createApi();
      const onRequest = vi.fn((config) => config);
      client.use({ onRequest });

      await Promise.all([client.get('/users'), client.get('/users')]);

      expect(onRequest).toHaveBeenCalledTimes(1);
    });

    it('should report dedupedCallers in the timing event', async () => {
      const client = createApi();
      const timings: RequestTiming[] = [];
      client.onTiming((timing) => timings.push(timing));

      await Promise.all([client.get('/users'), client.get('/users'), client.get('/users')]);

      expect(timings).toHaveLength(1);
      expect(timings[0]?.dedupedCallers).toBe(2);
    });

    it('should report zero dedupedCallers for a solo deduped request', async () => {
      const client = createApi();
      const timings: RequestTiming[] = [];
      client.onTiming((timing) => timings.push(timing));

      await client.get('/users');

      expect(timings[0]?.dedupedCallers).toBe(0);
    });

    it('should omit dedupedCallers outside the dedupe path', async () => {
      const client = createApi();
      const timings: RequestTiming[] = [];
      client.onTiming((timing) => timings.push(timing));

      await client.post('/users', '{}');

      expect(timings[0]?.dedupedCallers).toBeUndefined();
    });

    it('should share retries with attached callers', async () => {
      mockFetch
        .mockResolvedValueOnce(new Response('try-again', { status: 503 }))
        .mockResolvedValueOnce(new Response('recovered', { status: 200 }));
      const client = createApi({
        retry: { maxRetries: 1, baseDelay: 1, jitter: false },
      });

      const [a, b] = await Promise.all([client.get('/users'), client.get('/users')]);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      await expect(a.text()).resolves.toBe('recovered');
      await expect(b.text()).resolves.toBe('recovered');
    });

    it('should not attach new callers to entries initiated under old auth', async () => {
      const resolvers: ((response: Response) => void)[] = [];
      mockFetch.mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolvers.push(resolve);
          })
      );
      const client = createApi({ auth: { type: 'bearer', token: 'user-a' } });

      const oldAuthRequest = client.get('/me/documents');
      await flush();

      client.setAuth({ type: 'bearer', token: 'user-b' });
      const newAuthRequest = client.get('/me/documents');
      await flush();

      // The auth change invalidated the in-flight entry: two physical requests
      expect(mockFetch).toHaveBeenCalledTimes(2);

      for (const resolve of resolvers) {
        resolve(new Response('ok'));
      }
      await Promise.allSettled([oldAuthRequest, newAuthRequest]);
    });

    it('should expose the dedupe config via getConfig', () => {
      const client = createApi({ dedupe: { methods: ['GET'] } });

      expect(client.getConfig().dedupe).toEqual({ methods: ['GET'] });
    });
  });
});
