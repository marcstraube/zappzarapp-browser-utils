# Request Interceptor

Fetch API wrapper with middleware support, authentication, and request timing.

## Quick Start

```typescript
import { RequestInterceptor } from '@zappzarapp/browser-utils/request';

// Create interceptor with base URL and auth
const api = RequestInterceptor.create({
  baseUrl: 'https://api.example.com',
  auth: {
    type: 'bearer',
    token: () => localStorage.getItem('token') ?? '',
  },
});

// Make requests
const response = await api.fetch('/users');
const users = await response.json();

// Cleanup when done
api.destroy();
```

## Features

| Feature               | Description                                     |
| --------------------- | ----------------------------------------------- |
| Fetch Wrapper         | Enhanced fetch with middleware support          |
| Authentication        | Bearer, API Key, Basic, and custom auth types   |
| Request Middleware    | Transform requests before sending               |
| Response Middleware   | Transform responses after receiving             |
| Error Middleware      | Handle errors in middleware chain               |
| Automatic Retry       | Opt-in retry with backoff and Retry-After       |
| Request Timing        | Track request duration and performance          |
| URL Validation        | Protocol allowlist and pattern blocking         |
| Credential Protection | Prevent credential leakage to different origins |
| Content-Type Check    | Validate response MIME type against expected    |
| SSRF Protection       | Block requests to private/internal IP addresses |
| Abort Signal Merge    | Combine multiple AbortSignals into one          |
| Download Progress     | Track download progress via ReadableStream      |
| Upload Progress       | Track upload progress for request bodies        |

## Types

| Type                         | Description                                       |
| ---------------------------- | ------------------------------------------------- |
| `RequestInterceptorConfig`   | Configuration options for the interceptor         |
| `RequestInterceptorInstance` | Interceptor instance with fetch methods           |
| `RequestMiddleware`          | Middleware definition with request/response hooks |
| `RequestConfig`              | Immutable request configuration                   |
| `MutableRequestConfig`       | Mutable config for middleware modification        |
| `InterceptedResponse`        | Response with timing and metadata                 |
| `RequestTiming`              | Request timing information                        |
| `AuthConfig`                 | Authentication configuration                      |
| `HttpMethod`                 | HTTP method type                                  |
| `RequestError`               | Request-specific error class                      |
| `RequestErrorCode`           | Error code enum                                   |
| `RequestRetryConfig`         | Retry configuration options                       |
| `parseRetryAfter`            | Parse a Retry-After header value to milliseconds  |
| `combineAbortSignals`        | Utility to merge two AbortSignals into one        |
| `ProgressInfo`               | Progress data: loaded, total, percentage          |
| `ProgressCallback`           | Progress event callback type                      |
| `ProgressMiddlewareOptions`  | Options for progress middleware factory           |
| `trackDownloadProgress`      | Wrap Response body to track download progress     |
| `trackUploadProgress`        | Wrap request body to track upload progress        |
| `createProgressMiddleware`   | Middleware factory for upload/download progress   |

## Configuration Options

| Option                     | Type                    | Default      | Description                              |
| -------------------------- | ----------------------- | ------------ | ---------------------------------------- |
| `baseUrl`                  | `string`                | `''`         | Base URL prepended to all requests       |
| `timeout`                  | `number`                | `30000`      | Request timeout in milliseconds          |
| `defaultHeaders`           | `Record<string,string>` | `{}`         | Headers added to all requests            |
| `auth`                     | `AuthConfig`            | `null`       | Authentication configuration             |
| `throwOnError`             | `boolean`               | `false`      | Throw on non-2xx responses               |
| `allowedProtocols`         | `string[]`              | `['https:']` | Allowed URL protocols                    |
| `blockedPatterns`          | `RegExp[]`              | `[]`         | URL patterns to block                    |
| `validateCredentialOrigin` | `boolean`               | `true`       | Prevent credentials to different origins |
| `blockPrivateIPs`          | `boolean`               | `false`      | Block requests to private/internal IPs   |
| `expectedContentType`      | `string \| string[]`    | `undefined`  | Validate response Content-Type           |
| `retry`                    | `RequestRetryConfig`    | `undefined`  | Automatic retry (see Automatic Retry)    |

## API Reference

### RequestInterceptor.isSupported()

Check if Fetch API is available.

```typescript
if (RequestInterceptor.isSupported()) {
  const api = RequestInterceptor.create({ baseUrl: 'https://api.example.com' });
}
```

**Returns:** `boolean`

### RequestInterceptor.create()

Create a new request interceptor instance.

```typescript
const api = RequestInterceptor.create({
  baseUrl: 'https://api.example.com',
  timeout: 10000,
  defaultHeaders: {
    'Content-Type': 'application/json',
  },
});
```

**Parameters:**

| Parameter | Type                       | Description           |
| --------- | -------------------------- | --------------------- |
| `config`  | `RequestInterceptorConfig` | Configuration options |

**Returns:** `RequestInterceptorInstance`

### Instance Methods

#### fetch()

Make a fetch request.

```typescript
const response = await api.fetch('/users', {
  method: 'POST',
  body: JSON.stringify({ name: 'Alice' }),
});
```

#### get(), post(), put(), patch(), delete(), head(), options()

Convenience methods for HTTP verbs.

```typescript
// GET request
const users = await api.get('/users');

// POST request with body
const newUser = await api.post('/users', JSON.stringify({ name: 'Alice' }));

// PUT request
await api.put('/users/1', JSON.stringify({ name: 'Bob' }));

// PATCH request
await api.patch('/users/1', JSON.stringify({ active: true }));

// DELETE request
await api.delete('/users/1');

// HEAD request (headers only, no body)
const meta = await api.head('/users/1');

// OPTIONS request (e.g. CORS preflight inspection)
const allowed = await api.options('/users');
```

#### use()

Add middleware to the request chain.

```typescript
const cleanup = api.use({
  onRequest: (config) => {
    config.headers.set('X-Request-ID', crypto.randomUUID());
    console.log('Request:', config.method, config.url);
    return config;
  },
  onResponse: (response) => {
    console.log('Response:', response.status, response.duration + 'ms');
    return response;
  },
  onError: (error, config) => {
    console.error('Error:', error.code, config.url);
  },
});

// Later: remove middleware
cleanup();
```

**Returns:** `CleanupFn`

#### onTiming()

Subscribe to request timing events.

```typescript
const cleanup = api.onTiming((timing) => {
  console.log(`${timing.method} ${timing.url}: ${timing.duration}ms`);
  if (timing.error) {
    console.error('Failed:', timing.error);
  }
});

// Later: unsubscribe
cleanup();
```

**Returns:** `CleanupFn`

#### getConfig()

Get current configuration (frozen/immutable).

```typescript
const config = api.getConfig();
console.log('Base URL:', config.baseUrl);
console.log('Timeout:', config.timeout);
```

**Returns:** `Readonly<RequestInterceptorConfig>`

#### setAuth()

Update authentication configuration.

```typescript
// Set new auth
api.setAuth({
  type: 'bearer',
  token: newToken,
});

// Remove auth
api.setAuth(null);
```

#### abortAll()

Abort all pending requests. The interceptor remains usable for new requests
after calling `abortAll()`.

```typescript
// Abort all in-flight requests
api.abortAll();

// New requests work normally after abortAll
const response = await api.fetch('/users');
```

Aborted requests will reject with a `RequestError` with code `'ABORTED'`.

#### destroy()

Destroy the interceptor and cleanup resources. Also aborts any pending requests.

```typescript
api.destroy();
// Further requests will throw
```

### RequestInterceptor.isSensitiveHeader()

Check if a header name is sensitive (should not be logged).

```typescript
RequestInterceptor.isSensitiveHeader('authorization'); // true
RequestInterceptor.isSensitiveHeader('content-type'); // false
```

### RequestInterceptor.redactHeaders()

Redact sensitive headers for safe logging.

```typescript
const headers = new Headers();
headers.set('Authorization', 'Bearer secret');
headers.set('Content-Type', 'application/json');

const safe = RequestInterceptor.redactHeaders(headers);
// { 'authorization': '[REDACTED]', 'content-type': 'application/json' }
```

## Authentication

### Bearer Token

```typescript
const api = RequestInterceptor.create({
  baseUrl: 'https://api.example.com',
  auth: {
    type: 'bearer',
    token: 'your-access-token',
    // Or use a function for dynamic tokens
    // token: () => localStorage.getItem('token') ?? '',
    // token: async () => await refreshToken(),
  },
});
```

### API Key

```typescript
const api = RequestInterceptor.create({
  baseUrl: 'https://api.example.com',
  auth: {
    type: 'api-key',
    apiKey: 'your-api-key',
    apiKeyHeader: 'X-API-Key', // default
  },
});
```

### Basic Auth

```typescript
const api = RequestInterceptor.create({
  baseUrl: 'https://api.example.com',
  auth: {
    type: 'basic',
    username: 'user',
    password: 'pass',
  },
});
```

### Custom Header

```typescript
const api = RequestInterceptor.create({
  baseUrl: 'https://api.example.com',
  auth: {
    type: 'custom',
    customHeader: {
      name: 'X-Custom-Auth',
      value: () => computeSignature(),
    },
  },
});
```

## Middleware Examples

### Logging Middleware

```typescript
api.use({
  onRequest: (config) => {
    console.log(`[${new Date().toISOString()}] ${config.method} ${config.url}`);
    return config;
  },
  onResponse: (response) => {
    console.log(
      `[${response.status}] ${response.url} (${response.duration}ms)`
    );
    return response;
  },
  onError: (error) => {
    console.error(`[ERROR] ${error.code}: ${error.message}`);
  },
});
```

### Retry

Retries are built in — configure the `retry` option instead of writing
middleware (see [Automatic Retry](#automatic-retry)). Middleware hooks only
observe the final outcome: `onResponse` and `onError` run once per call, after
all retry attempts.

### Request ID Middleware

```typescript
api.use({
  onRequest: (config) => {
    config.headers.set('X-Request-ID', crypto.randomUUID());
    config.headers.set('X-Correlation-ID', getCorrelationId());
    return config;
  },
});
```

### Response Transformation

```typescript
api.use({
  onResponse: (response) => {
    // Log slow requests
    if (response.duration > 1000) {
      console.warn(`Slow request: ${response.url} took ${response.duration}ms`);
    }
    return response;
  },
});
```

## Content-Type Validation

Validate that responses have the expected MIME type. Fails closed — a missing
`Content-Type` header with `expectedContentType` set will throw. Comparison is
case-insensitive; parameters like `charset` are ignored.

```typescript
// Single MIME type — applied to all requests
const api = RequestInterceptor.create({
  baseUrl: 'https://api.example.com',
  expectedContentType: 'application/json',
});

// Multiple accepted types
const api2 = RequestInterceptor.create({
  baseUrl: 'https://api.example.com',
  expectedContentType: ['application/json', 'application/ld+json'],
});

// Override per-request
const response = await api.fetch('/report.csv', {
  expectedContentType: 'text/csv',
});
```

## Automatic Retry

Opt-in retry for transient failures. Network errors, timeouts, and responses
with a retryable status code are retried with backoff. A `Retry-After` response
header (delta-seconds or HTTP-date) overrides the computed backoff delay —
without jitter, capped at `maxDelay`.

```typescript
const api = RequestInterceptor.create({
  baseUrl: 'https://api.example.com',
  retry: { maxRetries: 3 },
});

// 429/503 responses with Retry-After are retried when the server allows it
const response = await api.get('/rate-limited');
```

### Retry Options

| Option        | Type              | Default                                   | Description                       |
| ------------- | ----------------- | ----------------------------------------- | --------------------------------- |
| `maxRetries`  | `number`          | `3`                                       | Retries after the initial request |
| `backoff`     | `BackoffStrategy` | `'exponential'`                           | Backoff strategy                  |
| `baseDelay`   | `number`          | `1000`                                    | Base delay in milliseconds        |
| `maxDelay`    | `number`          | `30000`                                   | Delay cap (also for Retry-After)  |
| `jitter`      | `boolean`         | `true`                                    | Jitter on computed backoff only   |
| `methods`     | `HttpMethod[]`    | `['GET','HEAD','OPTIONS','PUT','DELETE']` | Methods eligible for retry        |
| `statusCodes` | `number[]`        | `[408, 429, 500, 502, 503, 504]`          | Status codes that trigger retry   |

### Retry Rules

- Only idempotent methods are retried by default. Retrying `POST` can duplicate
  side effects — opt in explicitly via `methods` if your endpoint is safe to
  replay.
- Requests with a `ReadableStream` body are never retried (the stream is
  consumed by the first attempt).
- Aborted requests are never retried; aborting during a retry wait rejects with
  `ABORTED`.
- Middleware sees only the final outcome: `onRequest` runs once before the first
  attempt, `onResponse`/`onError` and timing hooks fire once per call.

### RetryQueue Integration

With `throwOnError`, a thrown `RESPONSE_ERROR` carries the parsed header as
`retryAfterMs`. The `RetryQueue` (network module) picks this hint up and uses it
instead of its computed backoff — useful for background sync without enabling
interceptor-level retries:

```typescript
import { RetryQueue } from '@zappzarapp/browser-utils/network';

const api = RequestInterceptor.create({
  baseUrl: 'https://api.example.com',
  throwOnError: true,
});
const queue = RetryQueue.create({ maxRetries: 3 });

// A 429 with Retry-After delays the queue's next attempt accordingly
await queue.add(() => api.post('/sync', payload));
```

### parseRetryAfter()

Parse a `Retry-After` header value yourself:

```typescript
import { parseRetryAfter } from '@zappzarapp/browser-utils/request';

parseRetryAfter('120'); // 120000 (delta-seconds)
parseRetryAfter('Fri, 31 Dec 2027 23:59:59 GMT'); // ms until that date
parseRetryAfter('garbage'); // null
```

## Combining Abort Signals

Merge two `AbortSignal` instances into one. When either signal fires, the
combined signal aborts with that signal's reason. A thin wrapper around
`AbortSignal.any()` — the signal dependency is platform-managed, so combining
does not accumulate listeners on long-lived source signals.

```typescript
import { combineAbortSignals } from '@zappzarapp/browser-utils/request';

const userController = new AbortController();
const timeoutController = new AbortController();

const combined = combineAbortSignals(
  userController.signal,
  timeoutController.signal
);

// Either signal aborting cancels the request
const response = await api.fetch('/data', { signal: combined });
```

## Download Progress Tracking

Track download progress by wrapping the response body ReadableStream. Progress
is reported on each chunk with loaded bytes, total (from `Content-Length`), and
percentage.

### Standalone Usage

```typescript
import { trackDownloadProgress } from '@zappzarapp/browser-utils/request';

const response = await fetch('https://example.com/large-file.zip');
const tracked = trackDownloadProgress(response, (progress) => {
  console.log(`${progress.loaded} / ${progress.total ?? '?'} bytes`);
  if (progress.percentage !== null) {
    updateProgressBar(progress.percentage);
  }
});

// Progress is reported as the body is consumed
const blob = await tracked.blob();
```

### With RequestInterceptor Middleware

```typescript
import {
  RequestInterceptor,
  createProgressMiddleware,
} from '@zappzarapp/browser-utils/request';

const api = RequestInterceptor.create({
  baseUrl: 'https://api.example.com',
});

api.use(
  createProgressMiddleware({
    onDownloadProgress: (progress) => {
      console.log(`Downloaded: ${progress.percentage ?? '?'}%`);
    },
  })
);

const response = await api.get('/files/large.zip');
const blob = await response.blob();
```

### ProgressInfo

| Property     | Type             | Description                                      |
| ------------ | ---------------- | ------------------------------------------------ |
| `loaded`     | `number`         | Bytes received so far                            |
| `total`      | `number \| null` | Total bytes from Content-Length, null if unknown |
| `percentage` | `number \| null` | Download percentage (0-100), null if unknown     |

**Notes:**

- If `Content-Length` is missing, `total` and `percentage` are `null`
- Percentage is capped at 100 even if actual bytes exceed `Content-Length`
- A final progress event is emitted when the stream ends
- For responses with no body (e.g. 204), a single event is emitted with
  `loaded: 0`
- Stream cancellation propagates to the original response body

## Upload Progress Tracking

Track upload progress by wrapping the request body in a ReadableStream that
reports progress on each chunk. Total size is determined automatically for Blob,
ArrayBuffer, string, and URLSearchParams bodies. For ReadableStream and FormData
bodies, total is unknown.

### Standalone Usage

```typescript
import { trackUploadProgress } from '@zappzarapp/browser-utils/request';

const file = new Blob([largeData]);
const trackedBody = trackUploadProgress(file, (progress) => {
  console.log(`${progress.loaded} / ${progress.total ?? '?'} bytes`);
  if (progress.percentage !== null) {
    updateProgressBar(progress.percentage);
  }
});

await fetch('https://example.com/upload', {
  method: 'POST',
  body: trackedBody,
});
```

### With RequestInterceptor Middleware

```typescript
import {
  RequestInterceptor,
  createProgressMiddleware,
} from '@zappzarapp/browser-utils/request';

const api = RequestInterceptor.create({
  baseUrl: 'https://api.example.com',
});

api.use(
  createProgressMiddleware({
    onUploadProgress: (progress) => {
      console.log(`Uploaded: ${progress.percentage ?? '?'}%`);
    },
  })
);

await api.post('/files', { body: new Blob([data]) });
```

### Combined Upload and Download Progress

```typescript
api.use(
  createProgressMiddleware({
    onUploadProgress: (progress) => {
      uploadBar.style.width = `${String(progress.percentage ?? 0)}%`;
    },
    onDownloadProgress: (progress) => {
      downloadBar.style.width = `${String(progress.percentage ?? 0)}%`;
    },
  })
);
```

### Body Size Detection

| Body Type         | Total Known | Notes                           |
| ----------------- | ----------- | ------------------------------- |
| `Blob`            | Yes         | Uses `Blob.size`                |
| `ArrayBuffer`     | Yes         | Uses `byteLength`               |
| `ArrayBufferView` | Yes         | Uses `byteLength`               |
| `string`          | Yes         | Uses UTF-8 encoded byte length  |
| `URLSearchParams` | Yes         | Uses encoded string byte length |
| `ReadableStream`  | No          | Size unknown at start           |
| `FormData`        | No          | Multipart encoding unknown      |

## Error Handling

### Error Codes

| Code                    | Description                                   |
| ----------------------- | --------------------------------------------- |
| `FETCH_NOT_SUPPORTED`   | Fetch API not available                       |
| `INVALID_URL`           | URL validation failed                         |
| `INVALID_CONFIG`        | Invalid configuration                         |
| `REQUEST_FAILED`        | Network or fetch error                        |
| `RESPONSE_ERROR`        | Non-2xx response (when `throwOnError: true`)  |
| `MIDDLEWARE_ERROR`      | Error in middleware                           |
| `TIMEOUT`               | Request timed out                             |
| `ABORTED`               | Request was aborted                           |
| `CREDENTIAL_LEAK`       | Attempted credential leak to different origin |
| `SSRF_BLOCKED`          | Request to private/internal IP blocked        |
| `CONTENT_TYPE_MISMATCH` | Response Content-Type does not match expected |

### Error Handling Example

```typescript
import { RequestError } from '@zappzarapp/browser-utils/request';

try {
  const response = await api.fetch('/users');
} catch (error) {
  if (error instanceof RequestError) {
    switch (error.code) {
      case 'TIMEOUT':
        console.log('Request timed out');
        break;
      case 'CREDENTIAL_LEAK':
        console.error('Security: credential leak prevented');
        break;
      case 'CONTENT_TYPE_MISMATCH':
        console.error('Unexpected response type:', error.message);
        break;
      case 'SSRF_BLOCKED':
        console.error('Security: private IP blocked');
        break;
      case 'INVALID_URL':
        console.error('Invalid URL:', error.message);
        break;
      default:
        console.error('Request failed:', error.message);
    }
  }
}
```

## Security Considerations

1. **Protocol Allowlist** - Only HTTPS is allowed by default. HTTP and other
   protocols must be explicitly enabled.

2. **Credential Origin Validation** - When authentication is configured, the
   interceptor prevents sending credentials to different origins than the base
   URL.

3. **URL Pattern Blocking** - Block requests to specific URL patterns:

   ```typescript
   const api = RequestInterceptor.create({
     baseUrl: 'https://api.example.com',
     blockedPatterns: [/internal\//, /admin\//],
   });
   ```

4. **Sensitive Header Protection** - Authorization and similar headers are
   automatically redacted in logging utilities.

5. **No JavaScript/Data URLs** - The interceptor blocks `javascript:` and
   `data:` URLs as a defense-in-depth measure.

6. **SSRF Protection** - Optionally block requests to private/internal IP
   addresses (`blockPrivateIPs: true`). Covers IPv4 private ranges (10.x,
   172.16-31.x, 192.168.x), loopback (127.x, ::1), and link-local.

7. **Content-Type Validation** - Validate response MIME types to prevent
   type-confusion attacks. Fails closed (missing header throws).

## Usage with Abort Controller

```typescript
const controller = new AbortController();

// Start request
const responsePromise = api.fetch('/long-running', {
  signal: controller.signal,
});

// Abort after 5 seconds
setTimeout(() => controller.abort(), 5000);

try {
  const response = await responsePromise;
} catch (error) {
  if (error instanceof RequestError && error.code === 'ABORTED') {
    console.log('Request was aborted');
  }
}
```

## Browser Support

| Feature         | Chrome | Firefox | Safari | Edge |
| --------------- | ------ | ------- | ------ | ---- |
| Fetch API       | 42+    | 39+     | 10.1+  | 14+  |
| AbortController | 66+    | 57+     | 11.1+  | 16+  |
| Headers         | 42+    | 39+     | 10.1+  | 14+  |
| ReadableStream  | 43+    | 65+     | 10.1+  | 14+  |
| async/await     | 55+    | 52+     | 10.1+  | 14+  |
