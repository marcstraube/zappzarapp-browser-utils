/**
 * RequestInterceptor Tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { RequestInterceptor, RequestError } from '../../src/request/index.js';

/**
 * Typed fetch init with Headers for testing.
 */
interface TypedFetchInit extends Omit<RequestInit, 'headers'> {
  headers: Headers;
}

/**
 * Helper to get the init parameter from a mock fetch call.
 */
function getLastFetchInit(mock: Mock): TypedFetchInit {
  const calls = mock.mock.calls;
  const lastCall = calls[calls.length - 1];
  if (!lastCall) {
    throw new Error('No calls recorded');
  }
  return lastCall[1] as TypedFetchInit;
}

describe('RequestInterceptor', () => {
  describe('RequestError', () => {
    it('should create FETCH_NOT_SUPPORTED error', () => {
      const error = RequestError.fetchNotSupported();
      expect(error.code).toBe('FETCH_NOT_SUPPORTED');
      expect(error.message).toBe('Fetch API is not supported in this environment');
    });

    it('should create INVALID_URL error without reason', () => {
      const error = RequestError.invalidUrl('bad-url');
      expect(error.code).toBe('INVALID_URL');
      expect(error.message).toBe('Invalid URL: "bad-url"');
    });

    it('should create INVALID_URL error with reason', () => {
      // noinspection HttpUrlsUsage - intentional insecure URL for testing
      const error = RequestError.invalidUrl('http://insecure.com', 'not HTTPS');
      expect(error.code).toBe('INVALID_URL');
      // noinspection HttpUrlsUsage
      expect(error.message).toBe('Invalid URL "http://insecure.com": not HTTPS');
    });

    it('should create INVALID_CONFIG error', () => {
      const error = RequestError.invalidConfig('missing required field');
      expect(error.code).toBe('INVALID_CONFIG');
      expect(error.message).toBe('Invalid configuration: missing required field');
    });

    it('should create REQUEST_FAILED error', () => {
      const cause = new Error('network error');
      const error = RequestError.requestFailed('https://api.example.com', cause);
      expect(error.code).toBe('REQUEST_FAILED');
      expect(error.message).toBe('Request to "https://api.example.com" failed');
      expect(error.cause).toBe(cause);
    });

    it('should create RESPONSE_ERROR error', () => {
      const error = RequestError.responseError(404, 'Not Found');
      expect(error.code).toBe('RESPONSE_ERROR');
      expect(error.message).toBe('Response error: 404 Not Found');
      expect(error.retryAfterMs).toBeUndefined();
    });

    it('should create RESPONSE_ERROR error with retryAfterMs', () => {
      const error = RequestError.responseError(429, 'Too Many Requests', 5000);
      expect(error.code).toBe('RESPONSE_ERROR');
      expect(error.retryAfterMs).toBe(5000);
    });

    it('should create MIDDLEWARE_ERROR error', () => {
      const cause = new Error('handler failed');
      const error = RequestError.middlewareError('request', cause);
      expect(error.code).toBe('MIDDLEWARE_ERROR');
      expect(error.message).toBe('Middleware error during request');
      expect(error.cause).toBe(cause);
    });

    it('should create TIMEOUT error', () => {
      const error = RequestError.timeout('https://api.example.com/slow', 5000);
      expect(error.code).toBe('TIMEOUT');
      expect(error.message).toBe(
        'Request to "https://api.example.com/slow" timed out after 5000ms'
      );
    });

    it('should create ABORTED error', () => {
      const error = RequestError.aborted('https://api.example.com/cancelled');
      expect(error.code).toBe('ABORTED');
      expect(error.message).toBe('Request to "https://api.example.com/cancelled" was aborted');
    });

    it('should create CREDENTIAL_LEAK error', () => {
      const error = RequestError.credentialLeak('cross-origin request');
      expect(error.code).toBe('CREDENTIAL_LEAK');
      expect(error.message).toBe('Potential credential leak prevented: cross-origin request');
    });

    it('should be instanceof Error', () => {
      const error = RequestError.fetchNotSupported();
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('isSupported', () => {
    it('should return true when fetch is available', () => {
      expect(RequestInterceptor.isSupported()).toBe(true);
    });

    it('should return false when fetch is undefined', () => {
      const original = globalThis.fetch;
      // @ts-expect-error - Testing undefined
      delete globalThis.fetch;

      expect(RequestInterceptor.isSupported()).toBe(false);

      globalThis.fetch = original;
    });

    it('should return false when Headers is undefined', () => {
      const originalFetch = globalThis.fetch;
      const originalHeaders = globalThis.Headers;

      // @ts-expect-error - Testing undefined
      delete globalThis.Headers;

      expect(RequestInterceptor.isSupported()).toBe(false);

      globalThis.fetch = originalFetch;
      globalThis.Headers = originalHeaders;
    });
  });

  describe('isSensitiveHeader', () => {
    it('should return true for authorization header', () => {
      expect(RequestInterceptor.isSensitiveHeader('Authorization')).toBe(true);
      expect(RequestInterceptor.isSensitiveHeader('authorization')).toBe(true);
      expect(RequestInterceptor.isSensitiveHeader('AUTHORIZATION')).toBe(true);
    });

    it('should return true for api key headers', () => {
      expect(RequestInterceptor.isSensitiveHeader('x-api-key')).toBe(true);
      expect(RequestInterceptor.isSensitiveHeader('X-API-Key')).toBe(true);
      expect(RequestInterceptor.isSensitiveHeader('x-auth-token')).toBe(true);
    });

    it('should return true for cookie headers', () => {
      expect(RequestInterceptor.isSensitiveHeader('cookie')).toBe(true);
      expect(RequestInterceptor.isSensitiveHeader('set-cookie')).toBe(true);
    });

    it('should return true for proxy-authorization', () => {
      expect(RequestInterceptor.isSensitiveHeader('proxy-authorization')).toBe(true);
    });

    it('should return false for non-sensitive headers', () => {
      expect(RequestInterceptor.isSensitiveHeader('Content-Type')).toBe(false);
      expect(RequestInterceptor.isSensitiveHeader('Accept')).toBe(false);
      expect(RequestInterceptor.isSensitiveHeader('X-Request-ID')).toBe(false);
    });
  });

  describe('redactHeaders', () => {
    it('should redact sensitive headers', () => {
      const headers = new Headers();
      headers.set('Authorization', 'Bearer secret-token');
      headers.set('Content-Type', 'application/json');
      headers.set('X-API-Key', 'my-api-key');

      const redacted = RequestInterceptor.redactHeaders(headers);

      // Headers keys are normalized to lowercase by the Headers API
      const authKey = Object.keys(redacted).find((k) => k.toLowerCase() === 'authorization');
      const contentTypeKey = Object.keys(redacted).find((k) => k.toLowerCase() === 'content-type');
      const apiKeyKey = Object.keys(redacted).find((k) => k.toLowerCase() === 'x-api-key');

      expect(authKey).toBeDefined();
      expect(redacted[authKey!]).toBe('[REDACTED]');
      expect(contentTypeKey).toBeDefined();
      expect(redacted[contentTypeKey!]).toBe('application/json');
      expect(apiKeyKey).toBeDefined();
      expect(redacted[apiKeyKey!]).toBe('[REDACTED]');
    });

    it('should preserve non-sensitive headers', () => {
      const headers = new Headers();
      headers.set('Accept', 'application/json');
      headers.set('X-Request-ID', '12345');

      const redacted = RequestInterceptor.redactHeaders(headers);

      // Headers keys are normalized to lowercase by the Headers API
      const acceptKey = Object.keys(redacted).find((k) => k.toLowerCase() === 'accept');
      const requestIdKey = Object.keys(redacted).find((k) => k.toLowerCase() === 'x-request-id');

      expect(acceptKey).toBeDefined();
      expect(redacted[acceptKey!]).toBe('application/json');
      expect(requestIdKey).toBeDefined();
      expect(redacted[requestIdKey!]).toBe('12345');
    });
  });

  describe('create', () => {
    it('should throw when fetch is not supported', () => {
      const original = globalThis.fetch;
      // @ts-expect-error - Testing undefined
      delete globalThis.fetch;

      expect(() => RequestInterceptor.create()).toThrow(RequestError);
      expect(() => RequestInterceptor.create()).toThrow('Fetch API is not supported');

      globalThis.fetch = original;
    });

    it('should throw for invalid base URL', () => {
      // noinspection HttpUrlsUsage - Testing invalid URL
      expect(() =>
        RequestInterceptor.create({
          baseUrl: 'http://insecure.com',
        })
      ).toThrow(RequestError);
    });

    it('should accept valid HTTPS base URL', () => {
      const api = RequestInterceptor.create({
        baseUrl: 'https://api.example.com',
      });

      expect(api).toBeDefined();
      api.destroy();
    });

    it('should allow HTTP when explicitly configured', () => {
      const api = RequestInterceptor.create({
        // noinspection HttpUrlsUsage - Testing with HTTP allowed
        baseUrl: 'http://localhost:3000',
        allowedProtocols: ['http:', 'https:'],
      });

      expect(api).toBeDefined();
      api.destroy();
    });
  });

  describe('RequestInterceptorInstance', () => {
    let mockFetch: ReturnType<typeof vi.fn<typeof fetch>>;
    let originalFetch: typeof fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
        new Response('{"success":true}', {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application/json' },
        })
      );
      globalThis.fetch = mockFetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    describe('fetch', () => {
      it('should make basic GET request', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        const response = await api.fetch('/users');

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.example.com/users',
          expect.objectContaining({
            method: 'GET',
          })
        );
        expect(response.ok).toBe(true);

        api.destroy();
      });

      it('should build URL with base URL', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com/v1',
        });

        await api.fetch('/users');

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.example.com/v1/users',
          expect.anything()
        );

        api.destroy();
      });

      it('should handle base URL with trailing slash', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com/v1/',
        });

        await api.fetch('/users');

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.example.com/v1/users',
          expect.anything()
        );

        api.destroy();
      });

      it('should handle path without leading slash', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        await api.fetch('users');

        expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/users', expect.anything());

        api.destroy();
      });

      it('should use absolute URL when provided', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        await api.fetch('https://other-api.example.com/data');

        expect(mockFetch).toHaveBeenCalledWith(
          'https://other-api.example.com/data',
          expect.anything()
        );

        api.destroy();
      });

      it('should apply default headers', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          defaultHeaders: {
            Accept: 'application/json',
            'X-Custom': 'value',
          },
        });

        await api.fetch('/users');

        expect(mockFetch).toHaveBeenCalled();
        const init = getLastFetchInit(mockFetch);
        expect(init.headers.get('Accept')).toBe('application/json');
        expect(init.headers.get('X-Custom')).toBe('value');

        api.destroy();
      });

      it('should not override request headers with defaults', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          defaultHeaders: {
            Accept: 'application/json',
          },
        });

        await api.fetch('/users', {
          headers: { Accept: 'text/plain' },
        });

        const init = getLastFetchInit(mockFetch);
        expect(init.headers.get('Accept')).toBe('text/plain');

        api.destroy();
      });

      it('should validate URL against allowed protocols', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        // noinspection HttpUrlsUsage - Testing protocol validation
        await expect(api.fetch('http://insecure.com/data')).rejects.toThrow(RequestError);

        api.destroy();
      });

      it('should validate URL against blocked patterns', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          blockedPatterns: [/internal\.example\.com/],
        });

        await expect(api.fetch('https://internal.example.com/secret')).rejects.toThrow(
          RequestError
        );

        api.destroy();
      });

      it('should throw after destroy', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        api.destroy();

        await expect(api.fetch('/users')).rejects.toThrow('destroyed');
      });
    });

    describe('HTTP methods', () => {
      it('should make GET request', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        await api.get('/users');

        const init = getLastFetchInit(mockFetch);
        expect(init.method).toBe('GET');

        api.destroy();
      });

      it('should make POST request with body', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        await api.post('/users', JSON.stringify({ name: 'John' }));

        const init = getLastFetchInit(mockFetch);
        expect(init.method).toBe('POST');
        expect(init.body).toBe('{"name":"John"}');

        api.destroy();
      });

      it('should make PUT request with body', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        await api.put('/users/1', JSON.stringify({ name: 'Jane' }));

        const init = getLastFetchInit(mockFetch);
        expect(init.method).toBe('PUT');
        expect(init.body).toBe('{"name":"Jane"}');

        api.destroy();
      });

      it('should make PATCH request with body', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        await api.patch('/users/1', JSON.stringify({ name: 'Updated' }));

        const init = getLastFetchInit(mockFetch);
        expect(init.method).toBe('PATCH');

        api.destroy();
      });

      it('should make DELETE request', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        await api.delete('/users/1');

        const init = getLastFetchInit(mockFetch);
        expect(init.method).toBe('DELETE');

        api.destroy();
      });

      it('should make HEAD request', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        await api.head('/users');

        const init = getLastFetchInit(mockFetch);
        expect(init.method).toBe('HEAD');

        api.destroy();
      });

      it('should make OPTIONS request', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        await api.options('/users');

        const init = getLastFetchInit(mockFetch);
        expect(init.method).toBe('OPTIONS');

        api.destroy();
      });

      it('should forward options to HEAD request', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        await api.head('/users', { headers: { 'X-Custom': 'value' } });

        const init = getLastFetchInit(mockFetch);
        expect(init.method).toBe('HEAD');
        expect(init.headers.get('X-Custom')).toBe('value');

        api.destroy();
      });

      it('should forward options to OPTIONS request', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        await api.options('/users', { headers: { 'X-Custom': 'value' } });

        const init = getLastFetchInit(mockFetch);
        expect(init.method).toBe('OPTIONS');
        expect(init.headers.get('X-Custom')).toBe('value');

        api.destroy();
      });
    });

    describe('authentication', () => {
      it('should add Bearer token', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          auth: {
            type: 'bearer',
            token: 'my-secret-token',
          },
        });

        await api.fetch('/users');

        const init = getLastFetchInit(mockFetch);
        expect(init.headers.get('Authorization')).toBe('Bearer my-secret-token');

        api.destroy();
      });

      it('should add Bearer token from function', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          auth: {
            type: 'bearer',
            token: () => 'dynamic-token',
          },
        });

        await api.fetch('/users');

        const init = getLastFetchInit(mockFetch);
        expect(init.headers.get('Authorization')).toBe('Bearer dynamic-token');

        api.destroy();
      });

      it('should add Bearer token from async function', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          auth: {
            type: 'bearer',
            token: async () => 'async-token',
          },
        });

        await api.fetch('/users');

        const init = getLastFetchInit(mockFetch);
        expect(init.headers.get('Authorization')).toBe('Bearer async-token');

        api.destroy();
      });

      it('should handle empty Bearer token', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          auth: {
            type: 'bearer',
            token: '',
          },
        });

        await api.fetch('/users');

        const init = getLastFetchInit(mockFetch);
        expect(init.headers.has('Authorization')).toBe(false);

        api.destroy();
      });

      it('should add API key header', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          auth: {
            type: 'api-key',
            apiKey: 'my-api-key',
          },
        });

        await api.fetch('/users');

        const init = getLastFetchInit(mockFetch);
        expect(init.headers.get('X-API-Key')).toBe('my-api-key');

        api.destroy();
      });

      it('should use custom API key header name', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          auth: {
            type: 'api-key',
            apiKey: 'my-api-key',
            apiKeyHeader: 'X-Custom-Key',
          },
        });

        await api.fetch('/users');

        const init = getLastFetchInit(mockFetch);
        expect(init.headers.get('X-Custom-Key')).toBe('my-api-key');

        api.destroy();
      });

      it('should add API key from function', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          auth: {
            type: 'api-key',
            apiKey: () => 'dynamic-key',
          },
        });

        await api.fetch('/users');

        const init = getLastFetchInit(mockFetch);
        expect(init.headers.get('X-API-Key')).toBe('dynamic-key');

        api.destroy();
      });

      it('should handle empty API key', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          auth: {
            type: 'api-key',
            apiKey: '',
          },
        });

        await api.fetch('/users');

        const init = getLastFetchInit(mockFetch);
        expect(init.headers.has('X-API-Key')).toBe(false);

        api.destroy();
      });

      it('should add Basic auth header', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          auth: {
            type: 'basic',
            username: 'user',
            password: 'pass',
          },
        });

        await api.fetch('/users');

        const init = getLastFetchInit(mockFetch);
        const expectedCredentials = btoa('user:pass');
        expect(init.headers.get('Authorization')).toBe(`Basic ${expectedCredentials}`);

        api.destroy();
      });

      it('should not add Basic auth without credentials', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          auth: {
            type: 'basic',
          },
        });

        await api.fetch('/users');

        const init = getLastFetchInit(mockFetch);
        expect(init.headers.has('Authorization')).toBe(false);

        api.destroy();
      });

      it('should add custom header', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          auth: {
            type: 'custom',
            customHeader: {
              name: 'X-Custom-Auth',
              value: 'custom-value',
            },
          },
        });

        await api.fetch('/users');

        const init = getLastFetchInit(mockFetch);
        expect(init.headers.get('X-Custom-Auth')).toBe('custom-value');

        api.destroy();
      });

      it('should add custom header from function', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          auth: {
            type: 'custom',
            customHeader: {
              name: 'X-Custom-Auth',
              value: async () => 'async-custom-value',
            },
          },
        });

        await api.fetch('/users');

        const init = getLastFetchInit(mockFetch);
        expect(init.headers.get('X-Custom-Auth')).toBe('async-custom-value');

        api.destroy();
      });

      it('should not add custom header when not configured', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          auth: {
            type: 'custom',
          },
        });

        await api.fetch('/users');

        const init = getLastFetchInit(mockFetch);
        expect(init.headers.has('X-Custom-Auth')).toBe(false);

        api.destroy();
      });

      it('should update auth with setAuth', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        api.setAuth({
          type: 'bearer',
          token: 'new-token',
        });

        await api.fetch('/users');

        const init = getLastFetchInit(mockFetch);
        expect(init.headers.get('Authorization')).toBe('Bearer new-token');

        api.destroy();
      });

      it('should remove auth with setAuth(null)', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          auth: {
            type: 'bearer',
            token: 'old-token',
          },
        });

        api.setAuth(null);

        await api.fetch('/users');

        const init = getLastFetchInit(mockFetch);
        expect(init.headers.has('Authorization')).toBe(false);

        api.destroy();
      });

      it('should prevent credential leak to different origins', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          auth: {
            type: 'bearer',
            token: 'secret-token',
          },
          validateCredentialOrigin: true,
        });

        await expect(api.fetch('https://other-domain.com/data')).rejects.toThrow('credential leak');

        api.destroy();
      });

      it('should allow same-origin requests with credentials', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          auth: {
            type: 'bearer',
            token: 'secret-token',
          },
          validateCredentialOrigin: true,
        });

        await expect(api.fetch('/users')).resolves.toBeDefined();

        api.destroy();
      });

      it('should skip credential validation when disabled', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          auth: {
            type: 'bearer',
            token: 'secret-token',
          },
          validateCredentialOrigin: false,
        });

        await expect(api.fetch('https://other-domain.com/data')).resolves.toBeDefined();

        api.destroy();
      });
    });

    describe('middleware', () => {
      it('should run onRequest middleware', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        const onRequest = vi.fn((config) => {
          config.headers.set('X-Modified', 'true');
          return config;
        });

        api.use({ onRequest });

        await api.fetch('/users');

        expect(onRequest).toHaveBeenCalled();
        const init = getLastFetchInit(mockFetch);
        expect(init.headers.get('X-Modified')).toBe('true');

        api.destroy();
      });

      it('should run onResponse middleware', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        const onResponse = vi.fn((response) => response);

        api.use({ onResponse });

        await api.fetch('/users');

        expect(onResponse).toHaveBeenCalled();
        expect(onResponse).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'https://api.example.com/users',
            status: 200,
          })
        );

        api.destroy();
      });

      it('should run onError middleware', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        const onError = vi.fn();

        api.use({ onError });

        await expect(api.fetch('/users')).rejects.toThrow();

        expect(onError).toHaveBeenCalled();

        api.destroy();
      });

      it('should run middleware in order', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        const order: number[] = [];

        api.use({
          onRequest: (config) => {
            order.push(1);
            return config;
          },
        });

        api.use({
          onRequest: (config) => {
            order.push(2);
            return config;
          },
        });

        await api.fetch('/users');

        expect(order).toEqual([1, 2]);

        api.destroy();
      });

      it('should remove middleware with cleanup function', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        const onRequest = vi.fn((config) => config);
        const cleanup = api.use({ onRequest });

        cleanup();

        await api.fetch('/users');

        expect(onRequest).not.toHaveBeenCalled();

        api.destroy();
      });

      it('should handle async middleware', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        api.use({
          onRequest: async (config) => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            config.headers.set('X-Async', 'true');
            return config;
          },
        });

        await api.fetch('/users');

        const init = getLastFetchInit(mockFetch);
        expect(init.headers.get('X-Async')).toBe('true');

        api.destroy();
      });

      it('should throw on request middleware error', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        api.use({
          onRequest: () => {
            throw new Error('Middleware failed');
          },
        });

        await expect(api.fetch('/users')).rejects.toThrow('Middleware error during request');

        api.destroy();
      });

      it('should throw on response middleware error', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        api.use({
          onResponse: () => {
            throw new Error('Middleware failed');
          },
        });

        await expect(api.fetch('/users')).rejects.toThrow('Middleware error during response');

        api.destroy();
      });

      it('should ignore errors in error middleware', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        api.use({
          onError: () => {
            throw new Error('Error handler failed');
          },
        });

        // Should still throw original error, not middleware error
        await expect(api.fetch('/users')).rejects.toThrow('failed');

        api.destroy();
      });
    });

    describe('timing', () => {
      it('should emit timing events', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        const timingHandler = vi.fn();
        api.onTiming(timingHandler);

        await api.fetch('/users');

        expect(timingHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'https://api.example.com/users',
            method: 'GET',
            status: 200,
          })
        );
        expect(timingHandler.mock.calls[0]?.[0].duration).toBeGreaterThanOrEqual(0);

        api.destroy();
      });

      it('should emit timing events on error', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        const timingHandler = vi.fn();
        api.onTiming(timingHandler);

        await expect(api.fetch('/users')).rejects.toThrow();

        expect(timingHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'https://api.example.com/users',
            method: 'GET',
            error: expect.any(String),
          })
        );

        api.destroy();
      });

      it('should remove timing handler with cleanup function', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        const timingHandler = vi.fn();
        const cleanup = api.onTiming(timingHandler);

        cleanup();

        await api.fetch('/users');

        expect(timingHandler).not.toHaveBeenCalled();

        api.destroy();
      });

      it('should ignore errors in timing handlers', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        api.onTiming(() => {
          throw new Error('Handler error');
        });

        // Should not throw
        await expect(api.fetch('/users')).resolves.toBeDefined();

        api.destroy();
      });
    });

    describe('timeout', () => {
      it('should timeout requests', async () => {
        // Use real timers for this test - fake timers have issues with abort controller
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          timeout: 100, // Use a short timeout for fast test
        });

        // Create a fetch that never resolves
        mockFetch.mockImplementation(
          (_url: string | URL | Request, init?: RequestInit) =>
            new Promise((_, reject) => {
              init?.signal?.addEventListener('abort', () => {
                reject(new DOMException('Aborted', 'AbortError'));
              });
            })
        );

        await expect(api.fetch('/slow')).rejects.toThrow('timed out after 100ms');

        api.destroy();
      });
    });

    describe('abort', () => {
      it('should abort requests with signal', async () => {
        const controller = new AbortController();

        // Mock fetch that properly handles abort
        mockFetch.mockImplementation(
          (_url: string | URL | Request, init?: RequestInit) =>
            new Promise((_, reject) => {
              const signal = init?.signal;
              // Check if already aborted
              if (signal?.aborted) {
                reject(new DOMException('Aborted', 'AbortError'));
                return;
              }
              // Listen for abort
              signal?.addEventListener('abort', () => {
                reject(new DOMException('Aborted', 'AbortError'));
              });
            })
        );

        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        // Start the fetch, then abort
        const promise = api.fetch('/data', { signal: controller.signal });

        // Abort immediately after starting
        controller.abort();

        await expect(promise).rejects.toThrow('was aborted');

        api.destroy();
      });
    });

    describe('throwOnError', () => {
      it('should throw on non-2xx responses when enabled', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response('Not Found', {
            status: 404,
            statusText: 'Not Found',
          })
        );

        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          throwOnError: true,
        });

        await expect(api.fetch('/missing')).rejects.toThrow('404 Not Found');

        api.destroy();
      });

      it('should not throw on non-2xx responses when disabled', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response('Not Found', {
            status: 404,
            statusText: 'Not Found',
          })
        );

        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          throwOnError: false,
        });

        const response = await api.fetch('/missing');
        expect(response.status).toBe(404);

        api.destroy();
      });

      it('should call error middleware when throwing on error status', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response('Internal Server Error', {
            status: 500,
            statusText: 'Internal Server Error',
          })
        );

        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          throwOnError: true,
        });

        const onError = vi.fn();
        api.use({ onError });

        await expect(api.fetch('/error')).rejects.toThrow();

        expect(onError).toHaveBeenCalled();

        api.destroy();
      });

      it('should attach retryAfterMs when the error response has a Retry-After header', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response('Too Many Requests', {
            status: 429,
            statusText: 'Too Many Requests',
            headers: { 'Retry-After': '4' },
          })
        );

        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          throwOnError: true,
        });

        const error = await api.fetch('/limited').catch((e: unknown) => e);
        expect(error).toBeInstanceOf(RequestError);
        expect((error as RequestError).code).toBe('RESPONSE_ERROR');
        expect((error as RequestError).retryAfterMs).toBe(4000);

        api.destroy();
      });

      it('should leave retryAfterMs undefined without a Retry-After header', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response('Service Unavailable', {
            status: 503,
            statusText: 'Service Unavailable',
          })
        );

        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          throwOnError: true,
        });

        const error = await api.fetch('/down').catch((e: unknown) => e);
        expect(error).toBeInstanceOf(RequestError);
        expect((error as RequestError).retryAfterMs).toBeUndefined();

        api.destroy();
      });
    });

    describe('Content-Type validation', () => {
      it('should not validate Content-Type by default', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response('hello', {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'text/html' },
          })
        );

        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        const response = await api.fetch('/page');
        expect(response.status).toBe(200);

        api.destroy();
      });

      it('should pass when response Content-Type matches expected type', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response('{"ok":true}', {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'application/json' },
          })
        );

        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          expectedContentType: 'application/json',
        });

        const response = await api.fetch('/data');
        expect(response.status).toBe(200);

        api.destroy();
      });

      it('should pass when Content-Type has parameters', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response('{"ok":true}', {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
          })
        );

        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          expectedContentType: 'application/json',
        });

        const response = await api.fetch('/data');
        expect(response.status).toBe(200);

        api.destroy();
      });

      it('should throw CONTENT_TYPE_MISMATCH on mismatch', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response('<html></html>', {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'text/html' },
          })
        );

        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          expectedContentType: 'application/json',
        });

        await expect(api.fetch('/page')).rejects.toThrow('Content-Type mismatch');

        api.destroy();
      });

      it('should throw when response has no Content-Type (fail closed)', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response('data', {
            status: 200,
            statusText: 'OK',
          })
        );

        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          expectedContentType: 'application/json',
        });

        await expect(api.fetch('/data')).rejects.toThrow('Content-Type mismatch');

        api.destroy();
      });

      it('should support array of expected types', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response('plain text', {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'text/plain' },
          })
        );

        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          expectedContentType: ['application/json', 'text/plain'],
        });

        const response = await api.fetch('/data');
        expect(response.status).toBe(200);

        api.destroy();
      });

      it('should call error middleware on Content-Type mismatch', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response('<html></html>', {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'text/html' },
          })
        );

        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          expectedContentType: 'application/json',
        });

        const onError = vi.fn();
        api.use({ onError });

        await expect(api.fetch('/page')).rejects.toThrow();
        expect(onError).toHaveBeenCalled();

        api.destroy();
      });

      it('should allow per-request override via middleware', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response('<html></html>', {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'text/html' },
          })
        );

        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          expectedContentType: 'application/json',
        });

        api.use({
          onRequest: (config) => {
            config.expectedContentType = 'text/html';
            return config;
          },
        });

        const response = await api.fetch('/page');
        expect(response.status).toBe(200);

        api.destroy();
      });

      it('should allow middleware to clear expectedContentType', async () => {
        mockFetch.mockResolvedValueOnce(
          new Response('<html></html>', {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'text/html' },
          })
        );

        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          expectedContentType: 'application/json',
        });

        api.use({
          onRequest: (config) => {
            config.expectedContentType = undefined;
            return config;
          },
        });

        const response = await api.fetch('/page');
        expect(response.status).toBe(200);

        api.destroy();
      });
    });

    describe('getConfig', () => {
      it('should return current configuration', () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          timeout: 10000,
          defaultHeaders: { Accept: 'application/json' },
          auth: { type: 'bearer', token: 'token' },
          throwOnError: true,
        });

        const config = api.getConfig();

        expect(config.baseUrl).toBe('https://api.example.com');
        expect(config.timeout).toBe(10000);
        expect(config.defaultHeaders?.Accept).toBe('application/json');
        expect(config.auth?.type).toBe('bearer');
        expect(config.throwOnError).toBe(true);

        api.destroy();
      });

      it('should return frozen configuration', () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        const config = api.getConfig();

        expect(Object.isFrozen(config)).toBe(true);

        api.destroy();
      });
    });

    describe('destroy', () => {
      it('should clear middlewares on destroy', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        const onRequest = vi.fn((config) => config);
        api.use({ onRequest });

        api.destroy();

        // After destroy, subsequent calls should fail
        await expect(api.fetch('/users')).rejects.toThrow('destroyed');
      });

      it('should clear timing handlers on destroy', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        const timingHandler = vi.fn();
        api.onTiming(timingHandler);

        api.destroy();

        // Handler should not be called after destroy
        // (because fetch will fail before emitting timing)
      });

      it('should clear auth on destroy', () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          auth: { type: 'bearer', token: 'token' },
        });

        api.destroy();

        const config = api.getConfig();
        expect(config.auth).toBeUndefined();
      });
    });

    describe('abortAll', () => {
      it('should abort pending requests', async () => {
        // Mock fetch that handles abort signals
        mockFetch.mockImplementation(
          (_url: string | URL | Request, init?: RequestInit) =>
            new Promise((_, reject) => {
              const signal = init?.signal;
              if (signal?.aborted) {
                reject(new DOMException('Aborted', 'AbortError'));
                return;
              }
              signal?.addEventListener('abort', () => {
                reject(new DOMException('Aborted', 'AbortError'));
              });
            })
        );

        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        // Start a request that will hang until aborted
        const promise = api.fetch('/slow');

        // Abort all pending requests
        api.abortAll();

        await expect(promise).rejects.toThrow('was aborted');

        api.destroy();
      });

      it('should allow new requests after abortAll', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        api.abortAll();

        // New requests should work (controller is replaced)
        const promise = api.fetch('/users');
        await expect(promise).resolves.toBeDefined();

        api.destroy();
      });
    });

    describe('URL validation', () => {
      it('should block javascript: URLs', async () => {
        const api = RequestInterceptor.create({
          allowedProtocols: ['https:', 'javascript:'], // Even if allowed
        });

        await expect(api.fetch('javascript:alert(1)')).rejects.toThrow('Invalid URL');

        api.destroy();
      });

      it('should block data: URLs', async () => {
        const api = RequestInterceptor.create({
          allowedProtocols: ['https:', 'data:'], // Even if allowed
        });

        await expect(api.fetch('data:text/html,<script>alert(1)</script>')).rejects.toThrow(
          'Invalid URL'
        );

        api.destroy();
      });

      it('should reject malformed URLs', async () => {
        const api = RequestInterceptor.create();

        await expect(api.fetch('not-a-valid-url')).rejects.toThrow('malformed URL');

        api.destroy();
      });
    });

    describe('SSRF protection', () => {
      describe('IPv4 private ranges should be blocked', () => {
        it.each([
          ['127.0.0.1', 'loopback start'],
          ['127.255.255.255', 'loopback end'],
          ['0.0.0.0', 'unspecified start'],
          ['0.1.2.3', 'unspecified range'],
          ['10.0.0.1', 'private class A start'],
          ['10.255.255.255', 'private class A end'],
          ['172.16.0.1', 'private class B start'],
          ['172.31.255.255', 'private class B end'],
          ['192.168.0.1', 'private class C start'],
          ['192.168.255.255', 'private class C end'],
          ['169.254.0.1', 'link-local start'],
          ['169.254.169.254', 'link-local metadata endpoint'],
        ])('should block %s (%s)', async (ip) => {
          const api = RequestInterceptor.create({ blockPrivateIPs: true });

          await expect(api.fetch(`https://${ip}/api`)).rejects.toThrow('SSRF protection');

          api.destroy();
        });
      });

      describe('IPv4 public addresses should be allowed', () => {
        it.each([
          ['8.8.8.8', 'public DNS'],
          ['172.15.0.1', 'just below 172.16 range'],
          ['172.32.0.1', 'just above 172.31 range'],
          ['192.167.1.1', 'not 192.168'],
          ['169.253.1.1', 'not 169.254'],
          ['1.2.3.4', 'generic public'],
          // Public addresses that share the *second* octet of a private range
          // but not the first. These guard the first-octet equality checks: a
          // mutant that drops the `first === N` test would wrongly block these.
          ['8.16.0.1', 'second octet 16 but not 172.x (private B range)'],
          ['8.31.0.1', 'second octet 31 but not 172.x (private B range)'],
          ['8.168.0.1', 'second octet 168 but not 192.x (private C)'],
          ['8.254.0.1', 'second octet 254 but not 169.x (link-local)'],
        ])('should allow %s (%s)', async (ip) => {
          const api = RequestInterceptor.create({ blockPrivateIPs: true });

          await api.fetch(`https://${ip}/api`);

          expect(mockFetch).toHaveBeenCalled();

          api.destroy();
        });
      });

      it('should reject invalid octets as malformed URL before SSRF check', async () => {
        const api = RequestInterceptor.create({ blockPrivateIPs: true });

        // 999.999.999.999 - rejected by URL constructor as malformed
        await expect(api.fetch('https://999.999.999.999/api')).rejects.toThrow('malformed URL');

        api.destroy();
      });

      describe('IPv6 private ranges should be blocked', () => {
        it.each([
          ['[::1]', 'loopback short'],
          ['[0:0:0:0:0:0:0:1]', 'loopback expanded'],
          ['[0000:0000:0000:0000:0000:0000:0000:0001]', 'loopback full'],
          ['[::]', 'unspecified short'],
          ['[0:0:0:0:0:0:0:0]', 'unspecified expanded'],
          ['[0000:0000:0000:0000:0000:0000:0000:0000]', 'unspecified full'],
          ['[fc00::1]', 'unique local fc00'],
          ['[fd12:3456::1]', 'unique local fd'],
          ['[fe80::1]', 'link-local fe80'],
          ['[fe90::1]', 'link-local fe90'],
          ['[fea0::1]', 'link-local fea0'],
          ['[feb0::1]', 'link-local feb0'],
        ])('should block %s (%s)', async (ip) => {
          const api = RequestInterceptor.create({ blockPrivateIPs: true });

          await expect(api.fetch(`https://${ip}/api`)).rejects.toThrow('SSRF protection');

          api.destroy();
        });
      });

      describe('IPv6 public addresses should be allowed', () => {
        it.each([
          ['[2001:db8::1]', 'public IPv6'],
          ['[ff02::1]', 'multicast'],
        ])('should allow %s (%s)', async (ip) => {
          const api = RequestInterceptor.create({ blockPrivateIPs: true });

          await api.fetch(`https://${ip}/api`);

          expect(mockFetch).toHaveBeenCalled();

          api.destroy();
        });
      });

      describe('domain names should not be blocked', () => {
        it.each([
          ['example.com', 'hostname'],
          ['localhost', 'localhost string'],
          // Looks like a private IP but has trailing non-digit characters, so it
          // is NOT a valid IPv4 literal. Guards the trailing `$` anchor of the
          // IPv4 pattern: without it the prefix "10.0.0.1" would match and the
          // host would be wrongly blocked.
          ['10.0.0.1x', 'private-IP prefix with trailing junk (not an IP literal)'],
        ])('should allow %s (%s)', async (host) => {
          const api = RequestInterceptor.create({ blockPrivateIPs: true });

          await api.fetch(`https://${host}/api`);

          expect(mockFetch).toHaveBeenCalled();

          api.destroy();
        });
      });

      it('should allow private IPs when blockPrivateIPs is disabled (default)', async () => {
        const api = RequestInterceptor.create();

        await api.fetch('https://127.0.0.1/api');
        await api.fetch('https://10.0.0.1/api');
        await api.fetch('https://[::1]/api');

        expect(mockFetch).toHaveBeenCalledTimes(3);

        api.destroy();
      });

      it('should throw RequestError with SSRF_BLOCKED code', async () => {
        const api = RequestInterceptor.create({ blockPrivateIPs: true });

        try {
          await api.fetch('https://10.0.0.1/api');
          expect.unreachable('should have thrown');
        } catch (error: unknown) {
          expect(error).toBeInstanceOf(RequestError);
          expect((error as RequestError).code).toBe('SSRF_BLOCKED');
          expect((error as RequestError).message).toContain('10.0.0.1');
        }

        api.destroy();
      });

      it('should block private IPs in baseUrl at creation time', () => {
        expect(() =>
          RequestInterceptor.create({
            baseUrl: 'https://127.0.0.1',
            blockPrivateIPs: true,
          })
        ).toThrow('SSRF protection');
      });
    });

    describe('edge cases', () => {
      it('should handle request without base URL', async () => {
        const api = RequestInterceptor.create();

        await api.fetch('https://api.example.com/users');

        expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/users', expect.anything());

        api.destroy();
      });

      it('should handle POST with null body', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        await api.post('/users', null);

        const init = getLastFetchInit(mockFetch);
        expect(init.method).toBe('POST');
        expect(init.body).toBeNull();

        api.destroy();
      });

      it('should preserve request metadata through middleware', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        let capturedMetadata: Record<string, unknown> | undefined;

        api.use({
          onRequest: (config) => {
            config.metadata = { requestId: '123' };
            return config;
          },
        });

        api.use({
          onRequest: (config) => {
            capturedMetadata = config.metadata;
            return config;
          },
        });

        await api.fetch('/users');

        expect(capturedMetadata).toEqual({ requestId: '123' });

        api.destroy();
      });

      it('should handle multiple middleware modifying headers', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        api.use({
          onRequest: (config) => {
            config.headers.set('X-First', 'first');
            return config;
          },
        });

        api.use({
          onRequest: (config) => {
            config.headers.set('X-Second', 'second');
            return config;
          },
        });

        await api.fetch('/users');

        const init = getLastFetchInit(mockFetch);
        expect(init.headers.get('X-First')).toBe('first');
        expect(init.headers.get('X-Second')).toBe('second');

        api.destroy();
      });

      it('should work without any configuration', async () => {
        const api = RequestInterceptor.create();

        await api.fetch('https://api.example.com/users');

        expect(mockFetch).toHaveBeenCalled();

        api.destroy();
      });

      it('should freeze a config whose metadata was cleared by middleware (line 657)', async () => {
        const api = RequestInterceptor.create({ baseUrl: 'https://api.example.com' });

        let captured: unknown = 'unset';
        api.use({
          onRequest: (config) => {
            config.metadata = undefined;
            return config;
          },
        });
        api.use({
          onError: (_error, config) => {
            captured = config.metadata;
          },
        });

        mockFetch.mockRejectedValueOnce(new Error('network down'));

        await expect(api.fetch('/users')).rejects.toThrow();
        expect(captured).toBeUndefined();

        api.destroy();
      });

      it('should convert errors when the timeout is disabled (line 740)', async () => {
        // timeout: 0 → createTimeout returns null → timeoutId stays null, so the
        // error path skips clearTimeout.
        const api = RequestInterceptor.create({ baseUrl: 'https://api.example.com', timeout: 0 });

        mockFetch.mockRejectedValueOnce(new TypeError('connection refused'));

        await expect(api.fetch('/users')).rejects.toThrow(RequestError);

        api.destroy();
      });

      it('should fall back to the instance timeout when middleware clears it (line 748)', async () => {
        // Middleware clears the per-request timeout, so error conversion falls
        // back to the instance-level timeout via `config.timeout ?? options.timeout`.
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          timeout: 5000,
        });
        api.use({
          onRequest: (config) => {
            config.timeout = undefined;
            return config;
          },
        });

        mockFetch.mockRejectedValueOnce(new TypeError('connection refused'));

        await expect(api.fetch('/users')).rejects.toThrow(RequestError);

        api.destroy();
      });

      it('should be safe to call a middleware cleanup twice (line 816)', () => {
        const api = RequestInterceptor.create({ baseUrl: 'https://api.example.com' });

        const cleanup = api.use({ onRequest: (config) => config });
        cleanup();

        // Second call: the middleware is already gone, so indexOf returns -1.
        expect(() => cleanup()).not.toThrow();

        api.destroy();
      });
    });

    describe('no timeout', () => {
      it('should not set a timeout when timeout is 0', async () => {
        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
          timeout: 0,
        });

        await api.fetch('/users');

        expect(mockFetch).toHaveBeenCalled();

        api.destroy();
      });
    });

    describe('combineAbortSignals', () => {
      it('should abort immediately when user signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();

        const api = RequestInterceptor.create({
          baseUrl: 'https://api.example.com',
        });

        mockFetch.mockImplementation(
          (_url: string | URL | Request, init?: RequestInit) =>
            new Promise((_, reject) => {
              if (init?.signal?.aborted) {
                reject(new DOMException('Aborted', 'AbortError'));
                return;
              }
              init?.signal?.addEventListener('abort', () => {
                reject(new DOMException('Aborted', 'AbortError'));
              });
            })
        );

        await expect(api.fetch('/data', { signal: controller.signal })).rejects.toThrow();

        api.destroy();
      });
    });
  });
});
