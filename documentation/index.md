# Zappzarapp Browser Utils

A comprehensive TypeScript library providing type-safe browser utilities with
security-first design.

## Quick Links

| Module                          | Description                                               |
| ------------------------------- | --------------------------------------------------------- |
| [a11y](a11y.md)                 | Accessibility utilities (ARIA, announcements, skip links) |
| [broadcast](broadcast.md)       | Multi-tab communication via BroadcastChannel API          |
| [cache](cache.md)               | HTTP-style caching with stale-while-revalidate            |
| [clipboard](clipboard.md)       | Clipboard API with fallbacks                              |
| [color](color.md)               | Color parsing, conversion, contrast, and manipulation     |
| [cookie](cookie.md)             | Cookie management with secure defaults (SameSite, Secure) |
| [core](core.md)                 | Core types, Result, errors, validation, and crypto utils  |
| [csp](csp.md)                   | CSP detection and utilities                               |
| [device](device.md)             | Device information (viewport, orientation, pixel ratio)   |
| [download](download.md)         | Programmatic file downloads with validation               |
| [encryption](encryption.md)     | AES-GCM encrypted storage with PBKDF2 key derivation      |
| [events](events.md)             | Event utilities (debounce, throttle, delegation)          |
| [features](features.md)         | Browser feature detection                                 |
| [focus](focus.md)               | Focus management and focus trapping for modals            |
| [form](form.md)                 | Form serialization and validation                         |
| [fullscreen](fullscreen.md)     | Fullscreen API wrapper                                    |
| [geolocation](geolocation.md)   | Geolocation API wrapper with Result-based errors          |
| [html](html.md)                 | HTML escaping and DOM helpers for XSS prevention          |
| [idle](idle.md)                 | Idle callback utilities for background tasks              |
| [indexeddb](indexeddb.md)       | Promise-based IndexedDB wrapper with transactions         |
| [intl](intl.md)                 | Locale-aware Intl formatting and locale negotiation       |
| [keyboard](keyboard.md)         | Keyboard shortcuts and hotkey management                  |
| [logging](logging.md)           | Configurable browser logging with log levels              |
| [media](media.md)               | Media queries and responsive breakpoints                  |
| [network](network.md)           | Network status monitoring and retry queue                 |
| [notification](notification.md) | Browser Notification API wrapper                          |
| [observe](observe.md)           | Observer wrappers (Intersection, Resize, Mutation)        |
| [offline](offline.md)           | Offline queue with IndexedDB persistence and auto-sync    |
| [performance](performance.md)   | Performance API and Core Web Vitals monitoring            |
| [request](request.md)           | Fetch interceptor: middleware, auth, retry, dedupe        |
| [sanitize](sanitize.md)         | HTML sanitization with DOMPurify integration              |
| [scroll](scroll.md)             | Scroll utilities and smooth scrolling                     |
| [session](session.md)           | Type-safe sessionStorage management                       |
| [share](share.md)               | Web Share API with clipboard fallback                     |
| [storage](storage.md)           | Type-safe localStorage with LRU eviction and namespacing  |
| [url](url.md)                   | URL building, query params, and history management        |
| [visibility](visibility.md)     | Page Visibility API wrapper for tab visibility detection  |
| [wakelock](wakelock.md)         | Screen Wake Lock API wrapper with auto re-acquisition     |
| [websocket](websocket.md)       | WebSocket wrapper with auto-reconnection                  |

## Recipes

| Recipe                                                        | Modules                                              |
| ------------------------------------------------------------- | ---------------------------------------------------- |
| [Offline-First App](recipes/offline-first-app.md)             | WebSocket + OfflineQueue + Cache + IndexedDB         |
| [Secure File Upload](recipes/secure-file-upload.md)           | RequestInterceptor + StreamProgress + Sanitize + CSP |
| [Accessible Form](recipes/accessible-form.md)                 | Form + Focus + Keyboard + A11y                       |
| [Resilient API Client](recipes/resilient-api-client.md)       | RequestInterceptor + RetryQueue + Cache (SWR)        |
| [Real-Time Data Sync](recipes/real-time-data-sync.md)         | WebSocket + Cache + IndexedDB + Broadcast            |
| [Progressive Enhancement](recipes/progressive-enhancement.md) | FeatureDetect + Network + Media                      |

## Guides

| Guide                                 | Description                           |
| ------------------------------------- | ------------------------------------- |
| [Browser Support](browser-support.md) | Full browser compatibility matrix     |
| [Error Handling](error-handling.md)   | Throwing vs Result-based API patterns |
| [Security Guide](security-guide.md)   | Detailed security considerations      |
| [Glossary](glossary.md)               | Browser and web development terms     |
| [Benchmarks](benchmarks.md)           | Bundle size and runtime benchmarks    |

## Installation

```bash
pnpm add @zappzarapp/browser-utils
```

Or with npm:

```bash
npm install @zappzarapp/browser-utils
```

## Requirements

- Modern browsers (Chrome 80+, Firefox 75+, Safari 13+, Edge 80+)
- ES2020+ support
- No polyfills required for target browsers

## Quick Start

```typescript
import { debounce, throttle } from '@zappzarapp/browser-utils/core';
import { StorageManager } from '@zappzarapp/browser-utils/storage';
import { SessionStorageManager } from '@zappzarapp/browser-utils/session';
import { CookieManager, CookieOptions } from '@zappzarapp/browser-utils/cookie';
import { ClipboardManager } from '@zappzarapp/browser-utils/clipboard';
import { UrlBuilder } from '@zappzarapp/browser-utils/url';
import { FeatureDetect } from '@zappzarapp/browser-utils/features';
import { Logger } from '@zappzarapp/browser-utils/logging';

// Storage with type safety and LRU eviction
interface UserPrefs {
  theme: 'light' | 'dark';
  language: string;
}
const storage = StorageManager.create<UserPrefs>({ prefix: 'myApp' });
storage.set('prefs', { theme: 'dark', language: 'en' });
const prefs = storage.get('prefs'); // UserPrefs | null

// Session storage
const session = SessionStorageManager.create<{ token: string }>({
  prefix: 'auth',
});
session.set('session', { token: 'abc123' });

// Secure cookies with defaults
CookieManager.set('theme', 'dark', CookieOptions.persistent('theme', 30));

// Clipboard with async/fallback support
await ClipboardManager.writeText('Copied to clipboard!');
const text = await ClipboardManager.readText();

// URL building
const url = UrlBuilder.current()
  .withParam('page', '2')
  .withParam('sort', 'date')
  .toString();

// Event utilities
const debouncedSearch = debounce(handleSearch, 300);
const throttledScroll = throttle(handleScroll, 100);

// Feature detection
if (FeatureDetect.clipboard()) {
  await ClipboardManager.writeText('Hello!');
}

// Logging
const logger = Logger.create({ prefix: '[App]' });
logger.info('Application started');
logger.error('Something went wrong', { details: 'error info' });
```

## Tree-Shakeable Imports

Import only what you need:

```typescript
// Import specific modules
import { StorageManager } from '@zappzarapp/browser-utils/storage';
import { debounce, throttle } from '@zappzarapp/browser-utils/events';
import { CookieManager } from '@zappzarapp/browser-utils/cookie';
import { UrlBuilder } from '@zappzarapp/browser-utils/url';
import { AriaUtils, ReducedMotion } from '@zappzarapp/browser-utils/a11y';
```

## Security Best Practices

1. **Validate all input** - Use the built-in validation for storage keys,
   filenames, and URLs

2. **Use secure cookie defaults** - The library defaults to `Secure` and
   `SameSite=Lax` for cookies

3. **Escape HTML output** - Use `HtmlEscaper` when inserting user content into
   the DOM

4. **Avoid storing secrets** - Do not store sensitive data (tokens, passwords,
   PII) in localStorage or sessionStorage

5. **Use namespaced storage** - Always provide a `prefix` to prevent key
   collisions

6. **Handle errors gracefully** - Use Result-based error handling for operations
   that can fail

```typescript
import { Validator } from '@zappzarapp/browser-utils/core';
import { HtmlEscaper } from '@zappzarapp/browser-utils/html';

// HTML escaping prevents XSS
const userInput = '<script>alert("xss")</script>';
const safe = HtmlEscaper.escape(userInput);
// Result: &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;

// Input validation
const key = Validator.validateStorageKey(userInput);
if (key.isErr()) {
  console.error('Invalid key:', key.error.message);
}
```

## TypeScript Support

This library is written in TypeScript and provides full type definitions. All
APIs are strictly typed with no `any` usage.

```typescript
// Generic storage with type inference
interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

const todoStorage = StorageManager.create<Todo>({ prefix: 'todos' });
const todo = todoStorage.get('item-1'); // Todo | null
```

## Result-Based Error Handling

Many operations return a `Result` type for explicit error handling:

```typescript
import { Result } from '@zappzarapp/browser-utils/core';
import { ClipboardManager } from '@zappzarapp/browser-utils/clipboard';

const result = await ClipboardManager.writeText('Hello');
if (result.isOk()) {
  console.log('Copied successfully');
} else {
  console.error('Copy failed:', result.error.message);
}
```

## License

MIT License
