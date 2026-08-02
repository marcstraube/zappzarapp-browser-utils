# Network Utilities

Online/offline detection, network information, and automatic retry queue.

## Quick Start

```typescript
import { Result } from '@zappzarapp/browser-utils/core';
import { NetworkStatus, RetryQueue } from '@zappzarapp/browser-utils/network';

// Check network status
if (NetworkStatus.isOnline()) {
  await fetchData();
}

// Listen for status changes
const cleanup = NetworkStatus.onStatusChange((online) => {
  console.log(online ? 'Back online!' : 'Gone offline');
});

// Automatic retry with exponential backoff
const queue = RetryQueue.create({ maxRetries: 3 });
const result = await queue.add(() => fetch('/api/data'));
```

## NetworkStatus

### Methods

| Method                        | Returns          | Description                                   |
| ----------------------------- | ---------------- | --------------------------------------------- |
| `isOnline()`                  | `boolean`        | Check if browser reports being online         |
| `isOffline()`                 | `boolean`        | Check if browser reports being offline        |
| `connectionType()`            | `ConnectionType` | Get connection type (wifi, cellular, etc.)    |
| `getInfo()`                   | `NetworkInfo`    | Get full network information                  |
| `isNetworkInfoSupported()`    | `boolean`        | Check if Network Information API is supported |
| `onStatusChange(handler)`     | `CleanupFn`      | Listen for online/offline changes             |
| `onOnline(handler)`           | `CleanupFn`      | Listen for coming back online                 |
| `onOffline(handler)`          | `CleanupFn`      | Listen for going offline                      |
| `onConnectionChange(handler)` | `CleanupFn`      | Listen for connection type changes            |

### Types

```typescript
type ConnectionType =
  | 'wifi'
  | 'cellular'
  | 'ethernet'
  | 'bluetooth'
  | 'wimax'
  | 'other'
  | 'none'
  | 'unknown';

interface NetworkInfo {
  readonly online: boolean;
  readonly type: ConnectionType;
  readonly effectiveType?: '2g' | '3g' | '4g' | 'slow-2g';
  readonly downlink?: number; // Mbps
  readonly rtt?: number; // Round-trip time in ms
  readonly saveData?: boolean; // Data saver enabled
}
```

## RetryQueue

### Factory Methods

```typescript
// Create with options
const queue = RetryQueue.create({
  maxRetries: 3, // Default: 3
  backoff: 'exponential', // Default: 'exponential'
  baseDelay: 1000, // Default: 1000ms
  maxDelay: 30000, // Default: 30000ms
  networkAware: true, // Default: true (auto-pause when offline)
  jitter: true, // Default: true (prevents thundering herd)
});
```

### Methods

| Method             | Returns      | Description                          |
| ------------------ | ------------ | ------------------------------------ |
| `add(operation)`   | `Promise<T>` | Add async operation to queue         |
| `pause()`          | `void`       | Pause queue processing               |
| `resume()`         | `void`       | Resume queue processing              |
| `clear()`          | `void`       | Clear all pending operations         |
| `destroy()`        | `void`       | Destroy queue and clean up resources |
| `onRetry(handler)` | `CleanupFn`  | Listen for retry attempts            |
| `getStats()`       | `RetryStats` | Get queue statistics                 |
| `isPaused()`       | `boolean`    | Check if queue is paused             |
| `isEmpty()`        | `boolean`    | Check if queue is empty              |

### Configuration Options

| Option         | Type              | Default         | Description                |
| -------------- | ----------------- | --------------- | -------------------------- |
| `maxRetries`   | `number`          | `3`             | Maximum retry attempts     |
| `backoff`      | `BackoffStrategy` | `'exponential'` | Backoff strategy           |
| `baseDelay`    | `number`          | `1000`          | Base delay in milliseconds |
| `maxDelay`     | `number`          | `30000`         | Maximum delay cap          |
| `networkAware` | `boolean`         | `true`          | Auto-pause when offline    |
| `jitter`       | `boolean`         | `true`          | Add randomness to delays   |
| `rateLimit`    | `RateLimitConfig` | `undefined`     | Rate limiting (see below)  |

### Backoff Strategies

| Strategy      | Description                        |
| ------------- | ---------------------------------- |
| `constant`    | Same delay every retry             |
| `linear`      | Delay = baseDelay \* attempt       |
| `exponential` | Delay = baseDelay \* 2^(attempt-1) |

### Retry-After Hints

When a failed operation throws an error carrying a finite, non-negative numeric
`retryAfterMs` field, that delay replaces the computed backoff for the next
attempt — without jitter, capped at `maxDelay`. The `RequestInterceptor`
(request module) sets this field on `RESPONSE_ERROR` when the server sent a
`Retry-After` header, so both compose out of the box:

```typescript
const api = RequestInterceptor.create({ baseUrl, throwOnError: true });
const queue = RetryQueue.create({ maxRetries: 3 });

// A 429 with "Retry-After: 30" delays the next attempt by 30 seconds
await queue.add(() => api.post('/sync', payload));
```

### Rate Limiting

Prevents reconnect storms by limiting how many operations are processed within a
sliding time window.

| Option                 | Type     | Description                                   |
| ---------------------- | -------- | --------------------------------------------- |
| `maxRequestsPerWindow` | `number` | Maximum operations allowed in the time window |
| `windowMs`             | `number` | Time window in milliseconds                   |

```typescript
const queue = RetryQueue.create({
  maxRetries: 3,
  backoff: 'exponential',
  rateLimit: {
    maxRequestsPerWindow: 10,
    windowMs: 5000,
  },
});

// Operations are automatically throttled to stay within the rate limit
for (let i = 0; i < 100; i++) {
  queue.add(async () => fetch(`/api/data/${i}`));
}
```

## Usage Examples

### Sync Pending Data When Online

```typescript
// Queue operations that sync when back online
const queue = RetryQueue.create({ networkAware: true });

async function saveData(data: unknown): Promise<void> {
  await queue.add(async () => {
    const response = await fetch('/api/save', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Save failed');
  });
}
```

### Retry with Progress Feedback

```typescript
const queue = RetryQueue.create({ maxRetries: 5 });

queue.onRetry((attempt, error) => {
  showToast(`Retry ${attempt}/5: ${error}`);
});

try {
  const data = await queue.add(() => fetchCriticalData());
  showSuccess('Data loaded');
} catch (error) {
  showError('Failed after 5 retries');
}
```

### Network-Aware UI

```typescript
// Update UI based on network status
const cleanup = NetworkStatus.onStatusChange((online) => {
  if (online) {
    hideOfflineBanner();
    retryQueue.resume();
  } else {
    showOfflineBanner();
  }
});

// Show connection quality
const info = NetworkStatus.getInfo();
if (info.effectiveType === 'slow-2g' || info.effectiveType === '2g') {
  enableLowBandwidthMode();
}
```

### Graceful Degradation

```typescript
// Check connection before large operations
if (NetworkStatus.isOffline()) {
  showOfflineMessage();
  return;
}

const info = NetworkStatus.getInfo();
if (info.saveData) {
  // User has data saver enabled
  loadLowResImages();
} else {
  loadHighResImages();
}
```

## Security Considerations

1. **Cryptographic Jitter** - RetryQueue uses `crypto.getRandomValues()` for
   jitter calculation
2. **No Sensitive Data Logging** - Retry handlers receive errors but should not
   log sensitive request data
3. **Network-Aware by Default** - Prevents unnecessary requests when offline
4. **Graceful Cleanup** - `destroy()` properly cleans up event listeners and
   pending operations
