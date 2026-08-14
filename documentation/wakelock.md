# Screen Wake Lock API

Screen Wake Lock API wrapper that prevents the screen from dimming or locking
during video playback, presentations, or other long-running foreground tasks.

## Quick Start

```typescript
import { Result } from '@zappzarapp/browser-utils/core';
import { WakeLock } from '@zappzarapp/browser-utils/wakelock';

// Acquire a screen wake lock
const result = await WakeLock.request();

if (Result.isOk(result)) {
  const lock = result.value;
  console.log('Screen stays awake:', lock.active);

  // ... later, when the lock is no longer needed:
  await lock.release();
}

// Without automatic re-acquisition
const manual = await WakeLock.request({ reacquireOnVisible: false });
```

## API Reference

### Actions

| Method              | Returns                                          | Description                |
| ------------------- | ------------------------------------------------ | -------------------------- |
| `request(options?)` | `Promise<Result<WakeLockHandle, WakeLockError>>` | Acquire a screen wake lock |

### Support Detection

| Method          | Returns   | Description                                    |
| --------------- | --------- | ---------------------------------------------- |
| `isSupported()` | `boolean` | Check if the Screen Wake Lock API is available |

### Types

```typescript
interface WakeLockOptions {
  // Re-acquire the lock automatically when the page returns to the
  // foreground (default: true)
  readonly reacquireOnVisible?: boolean;
}

interface WakeLockHandle {
  // Release the lock and stop automatic re-acquisition.
  // Safe to call multiple times; best-effort (never rejects).
  release(): Promise<void>;

  // Whether the underlying wake lock is currently held
  readonly active: boolean;
}
```

## Behavior Notes

- The browser silently releases a screen wake lock whenever the document is
  hidden (tab switch, minimized window). By default the handle re-acquires the
  lock automatically when the page becomes visible again; opt out with
  `reacquireOnVisible: false`.
- Re-acquisition is best-effort: if it fails, the lock simply stays unheld until
  the next visibility change.
- `release()` removes the visibility listener, so a released handle never
  re-acquires.
- Browsers may reject the request in battery-saver mode or when the document is
  not active — this surfaces as `WAKE_LOCK_REQUEST_FAILED`.

## Error Types

```typescript
// WakeLockError types
WakeLockError.notSupported(); // Screen Wake Lock API not available
WakeLockError.requestFailed(e); // Acquisition failed (policy, battery saver)
```
