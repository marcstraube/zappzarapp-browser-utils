# ⚡ @zappzarapp/browser-utils

[![npm version](https://img.shields.io/npm/v/@zappzarapp/browser-utils.svg)](https://www.npmjs.com/package/@zappzarapp/browser-utils)
[![Node.js Version](https://img.shields.io/node/v/@zappzarapp/browser-utils.svg)](https://www.npmjs.com/package/@zappzarapp/browser-utils)
[![License](https://img.shields.io/npm/l/@zappzarapp/browser-utils.svg)](https://www.npmjs.com/package/@zappzarapp/browser-utils)
[![CI](https://github.com/marcstraube/zappzarapp-node-browser-utils/actions/workflows/ci.yml/badge.svg)](https://github.com/marcstraube/zappzarapp-node-browser-utils/actions/workflows/ci.yml)
[![Socket Badge](https://badge.socket.dev/npm/package/@zappzarapp/browser-utils)](https://socket.dev/npm/package/@zappzarapp/browser-utils)

Zero-dependency browser utilities with security-first design — type-safe,
tree-shakeable, and fully tested.

## Highlights

- **All-in-one** — 39 browser modules in a single, tree-shakeable package
- **Type-safe** — strict TypeScript with generics throughout
- **Zero dependencies** — no runtime dependencies
- **Secure by default** — cryptographic randomness, input validation, XSS
  prevention
- **Dual error handling** — throwing and Result-based APIs
- **Quality-backed** — 4600+ tests, strict ESLint, 99%+ coverage

## Modules

### Storage & Data

| Module     | Key Classes             | Description                       |
| ---------- | ----------------------- | --------------------------------- |
| storage    | `StorageManager`        | localStorage with LRU eviction    |
| session    | `SessionStorageManager` | sessionStorage wrapper            |
| cookie     | `CookieManager`         | Secure cookie management          |
| indexeddb  | `IndexedDBManager`      | IndexedDB async wrapper           |
| cache      | `CacheManager`          | HTTP-style stale-while-revalidate |
| encryption | `EncryptedStorage`      | AES-GCM with PBKDF2               |

### DOM & UI

| Module     | Key Classes                       | Description                  |
| ---------- | --------------------------------- | ---------------------------- |
| html       | `DomHelper`, `HtmlEscaper`        | DOM helpers, HTML escaping   |
| focus      | `FocusTrap`                       | Focus trapping for modals    |
| scroll     | `ScrollManager`                   | Scroll utilities and locking |
| fullscreen | `FullscreenManager`               | Fullscreen API wrapper       |
| form       | `FormValidator`, `FormSerializer` | Validation and serialization |

### Events & Input

| Module   | Key Classes                              | Description                 |
| -------- | ---------------------------------------- | --------------------------- |
| events   | `EventDelegator`, `debounce`, `throttle` | Event delegation and timing |
| keyboard | `ShortcutManager`                        | Keyboard shortcuts          |
| idle     | `IdleCallback`                           | requestIdleCallback wrapper |

### Observers

| Module  | Key Classes                                            | Description                    |
| ------- | ------------------------------------------------------ | ------------------------------ |
| observe | `IntersectionObserverWrapper`, `ResizeObserverWrapper` | Intersection, Resize, Mutation |

### Network & Communication

| Module    | Key Classes                   | Description                           |
| --------- | ----------------------------- | ------------------------------------- |
| network   | `RetryQueue`, `NetworkStatus` | Retry queue with backoff              |
| offline   | `OfflineQueue`                | IndexedDB-backed offline sync         |
| websocket | `WebSocketManager`            | Auto-reconnect + SSE/polling fallback |
| request   | `RequestInterceptor`          | Fetch middleware, auth, progress      |
| url       | `UrlBuilder`                  | URL building, query params            |
| broadcast | `BroadcastManager`            | Cross-tab messaging                   |
| share     | `ShareManager`                | Web Share API with clipboard fallback |

### Device & Environment

| Module      | Key Classes          | Description                |
| ----------- | -------------------- | -------------------------- |
| device      | `DeviceInfo`         | Device detection           |
| features    | `FeatureDetect`      | Browser feature detection  |
| media       | `MediaQuery`         | Media queries, breakpoints |
| visibility  | `VisibilityManager`  | Page Visibility API        |
| geolocation | `GeolocationManager` | Geolocation API wrapper    |
| performance | `PerformanceMonitor` | Core Web Vitals monitoring |
| wakelock    | `WakeLock`           | Screen Wake Lock API       |

### Security

| Module    | Key Classes        | Description               |
| --------- | ------------------ | ------------------------- |
| csp       | `CspDetector`      | CSP detection and helpers |
| sanitize  | `HtmlSanitizer`    | HTML sanitization         |
| clipboard | `ClipboardManager` | Secure clipboard access   |

### Utility

| Module       | Key Classes                                   | Description                          |
| ------------ | --------------------------------------------- | ------------------------------------ |
| color        | `parseColor`, `contrastRatio`, `mix`          | Color parse/convert/contrast         |
| intl         | `formatNumber`, `formatDate`, `resolveLocale` | Intl formatting + locale negotiation |
| logging      | `Logger`                                      | Console logging with levels          |
| notification | `NotificationManager`                         | Browser notifications                |
| download     | `FileDownload`                                | File download triggers               |
| a11y         | `AriaUtils`, `LiveAnnouncer`, `SkipLink`      | Accessibility utilities              |
| core         | `Result`, `Validator`, `debounce`             | Types, errors, validation            |

## Requirements

- **Node.js** >= 22
- **ESM-only** — cannot be `require()`'d from CommonJS

## Installation

```bash
npm install @zappzarapp/browser-utils
# or
pnpm add @zappzarapp/browser-utils
```

## Quick Start

### Storage Manager

```typescript
import { StorageManager } from '@zappzarapp/browser-utils/storage';

interface UserData {
  id: string;
  name: string;
}

const storage = StorageManager.create<UserData>({
  prefix: 'myApp',
  maxEntries: 100,
});

storage.set('user-1', { id: '1', name: 'Alice' });
const user = storage.get('user-1');
```

### Keyboard Shortcuts

```typescript
import {
  ShortcutManager,
  KeyboardShortcut,
} from '@zappzarapp/browser-utils/keyboard';

// Single shortcut — returns a cleanup function
const cleanup = ShortcutManager.on(KeyboardShortcut.ctrlKey('s'), () =>
  saveDocument()
);

// App-wide surface: bare keys skipped while typing, one undo/redo per platform
const shortcuts = ShortcutManager.createGroup({ ignoreEditableTargets: true });
shortcuts
  .add(KeyboardShortcut.cmdOrCtrl('z'), undo)
  .add(KeyboardShortcut.key('r'), () => (hasSelection() ? rotate() : false));

cleanup();
shortcuts.cleanup();
```

### Network Retry Queue

```typescript
import { RetryQueue } from '@zappzarapp/browser-utils/network';

const queue = RetryQueue.create({
  maxRetries: 3,
  backoff: 'exponential',
  networkAware: true,
});

const result = await queue.add(() => fetch('/api/data').then((r) => r.json()));
```

### Automatic Request Retry

```typescript
import { RequestInterceptor } from '@zappzarapp/browser-utils/request';

// Opt-in retry for idempotent requests with exponential backoff;
// Retry-After response headers are honored (capped at maxDelay)
const api = RequestInterceptor.create({
  baseUrl: 'https://api.example.com',
  retry: { maxRetries: 3 },
});
```

### Lazy Loading with Observers

```typescript
import { IntersectionObserverWrapper } from '@zappzarapp/browser-utils/observe';

const cleanup = IntersectionObserverWrapper.lazyLoad(
  document.querySelectorAll('img[data-src]'),
  (img) => {
    img.src = img.dataset.src!;
  }
);
```

## Documentation

| Module                                      | Module                                        |
| ------------------------------------------- | --------------------------------------------- |
| [a11y](documentation/a11y.md)               | [intl](documentation/intl.md)                 |
| [broadcast](documentation/broadcast.md)     | [keyboard](documentation/keyboard.md)         |
| [cache](documentation/cache.md)             | [logging](documentation/logging.md)           |
| [clipboard](documentation/clipboard.md)     | [media](documentation/media.md)               |
| [color](documentation/color.md)             | [network](documentation/network.md)           |
| [cookie](documentation/cookie.md)           | [notification](documentation/notification.md) |
| [core](documentation/core.md)               | [observe](documentation/observe.md)           |
| [csp](documentation/csp.md)                 | [offline](documentation/offline.md)           |
| [device](documentation/device.md)           | [performance](documentation/performance.md)   |
| [download](documentation/download.md)       | [request](documentation/request.md)           |
| [encryption](documentation/encryption.md)   | [sanitize](documentation/sanitize.md)         |
| [events](documentation/events.md)           | [scroll](documentation/scroll.md)             |
| [features](documentation/features.md)       | [session](documentation/session.md)           |
| [focus](documentation/focus.md)             | [share](documentation/share.md)               |
| [form](documentation/form.md)               | [storage](documentation/storage.md)           |
| [fullscreen](documentation/fullscreen.md)   | [url](documentation/url.md)                   |
| [geolocation](documentation/geolocation.md) | [visibility](documentation/visibility.md)     |
| [html](documentation/html.md)               | [wakelock](documentation/wakelock.md)         |
| [idle](documentation/idle.md)               | [websocket](documentation/websocket.md)       |
| [indexeddb](documentation/indexeddb.md)     | [glossary](documentation/glossary.md)         |

**Recipes:** [Offline-First App](documentation/recipes/offline-first-app.md) ·
[Secure File Upload](documentation/recipes/secure-file-upload.md) ·
[Accessible Form](documentation/recipes/accessible-form.md) ·
[Resilient API Client](documentation/recipes/resilient-api-client.md) ·
[Real-Time Data Sync](documentation/recipes/real-time-data-sync.md) ·
[Progressive Enhancement](documentation/recipes/progressive-enhancement.md)

**Guides:** [Browser Support](documentation/browser-support.md) ·
[Error Handling](documentation/error-handling.md) ·
[Security Guide](documentation/security-guide.md) ·
[Benchmarks](documentation/benchmarks.md)

Generate API docs locally with `pnpm run docs`.

## Versioning

This project follows [Semantic Versioning](https://semver.org/).

## Security

See [SECURITY.md](./SECURITY.md) for vulnerability disclosure policy and
supported versions.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

MIT
