# Web Share API

Web Share API wrapper with capability checks and an optional clipboard fallback
for browsers without a native share sheet (e.g. desktop Firefox).

## Quick Start

```typescript
import { Result } from '@zappzarapp/browser-utils/core';
import { ShareManager } from '@zappzarapp/browser-utils/share';

// Share a link via the native share sheet
const result = await ShareManager.share({
  title: 'Example',
  text: 'Check this out',
  url: 'https://example.com',
});

if (Result.isOk(result)) {
  console.log(`Delivered via ${result.value.method}`);
} else if (result.error.code !== 'SHARE_ABORTED') {
  console.error('Failed:', result.error);
}

// With clipboard fallback when the Web Share API is unavailable
const fallbackResult = await ShareManager.share(
  { title: 'Example', url: 'https://example.com' },
  { fallbackToClipboard: true }
);

if (
  Result.isOk(fallbackResult) &&
  fallbackResult.value.method === 'clipboard'
) {
  // Tell the user the link was copied instead of shared
}

// Share files (validated via canShare)
const file = new File(['report'], 'report.txt', { type: 'text/plain' });
if (ShareManager.canShare({ files: [file] })) {
  await ShareManager.share({ files: [file] });
}
```

## API Reference

### Actions

| Method                  | Returns                                                                          | Description                    |
| ----------------------- | -------------------------------------------------------------------------------- | ------------------------------ |
| `share(data, options?)` | `Promise<Result<ShareSuccess, ShareError \| ClipboardError \| ValidationError>>` | Share data via the share sheet |

### Support Detection

| Method           | Returns   | Description                                      |
| ---------------- | --------- | ------------------------------------------------ |
| `isSupported()`  | `boolean` | Check if the Web Share API is supported          |
| `canShare(data)` | `boolean` | Check if the data can be shared on this platform |

### Types

```typescript
interface ShareOptions {
  // Copy title/text/url to the clipboard when the Web Share API
  // is unavailable (default: false)
  readonly fallbackToClipboard?: boolean;
}

interface ShareSuccess {
  // How the data was delivered
  readonly method: 'share' | 'clipboard';
}
```

## Behavior Notes

- `share()` must be called from a user gesture (transient activation); browsers
  reject programmatic calls with `SHARE_PERMISSION_DENIED`.
- A dismissed share sheet returns `SHARE_ABORTED` — treat it as a cancellation,
  not a failure.
- The clipboard fallback joins `title`, `text`, and `url` with newlines. Files
  cannot be copied and are ignored; a files-only payload returns
  `SHARE_INVALID_DATA`.
- Like the native path, the fallback resolves `url` against the document base
  and only accepts http(s) results — `javascript:`, `data:`, `mailto:` and other
  schemes are rejected as `SHARE_INVALID_DATA`.

## Error Types

```typescript
// ShareError types
ShareError.notSupported(); // Web Share API not available
ShareError.aborted(e); // User dismissed the share sheet
ShareError.permissionDenied(e); // No transient activation / blocked by policy
ShareError.invalidData(e); // Payload empty or not shareable
ShareError.shareFailed(e); // Any other runtime failure
```

The clipboard fallback can additionally return `ClipboardError` (from
`ClipboardManager.writeText`) and `ValidationError` (text length validation).
