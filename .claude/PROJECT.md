# Project Configuration

Project-specific settings for Claude agents. Agents reference this file for
package info, structure, and tooling details.

## Package

| Field       | Value                                                        |
| ----------- | ------------------------------------------------------------ |
| Name        | `@zappzarapp/browser-utils`                                  |
| Description | Zero-dependency browser utilities with security-first design |
| Node.js     | `>=22.0.0`                                                   |
| License     | MIT                                                          |

## Directory Structure

```text
src/
├── core/               # Core utilities (types, errors, validation, result, logger, crypto, debounce, throttle, backoff)
│   ├── errors/         # Error classes (BrowserUtilsError, ValidationError, etc.)
│   ├── result/         # Result<T,E> type for explicit error handling
│   ├── validation/     # Input validation utilities (incl. CacheValidator)
│   ├── types.ts        # Shared type definitions
│   ├── logger.ts       # LoggerLike interface, noopLogger
│   ├── crypto.ts       # Cryptographic randomness helpers
│   ├── Backoff.ts      # Backoff delay computation
│   ├── Debounce.ts     # Debounce utility (pure function)
│   └── Throttle.ts     # Throttle utility (pure function)
├── a11y/               # Accessibility utilities (AriaUtils, LiveAnnouncer, ReducedMotion, SkipLink)
├── broadcast/          # BroadcastChannel cross-tab messaging
├── cache/              # HTTP cache with stale-while-revalidate
├── clipboard/          # Clipboard API wrapper
├── color/              # Color parse/convert/contrast/manipulate
├── cookie/             # Cookie management with secure defaults
├── csp/                # Content Security Policy utilities
├── device/             # Device information detection
├── download/           # File download utilities
├── encryption/         # AES-GCM encrypted storage (PBKDF2)
├── events/             # Event delegation (re-exports debounce/throttle from core)
├── features/           # Browser feature detection
├── focus/              # Focus management and focus trap
├── form/               # Form serialization and validation
├── fullscreen/         # Fullscreen API wrapper
├── geolocation/        # Geolocation API wrapper
├── html/               # HTML escaping and DOM helpers
├── idle/               # requestIdleCallback utilities
├── indexeddb/          # IndexedDB wrapper for large data
├── intl/               # Intl formatting + locale negotiation
├── keyboard/           # Keyboard shortcut management
├── logging/            # Console logging with levels
├── media/              # Media queries and responsive utilities
├── network/            # Network status and retry queue
├── notification/       # Browser notification API
├── observe/            # Observer wrappers (Intersection, Resize, Mutation)
├── offline/            # Offline queue for data sync
├── performance/        # Performance measurement utilities
├── request/            # Fetch interceptor (middleware, auth, retry, dedupe)
├── sanitize/           # HTML sanitization utilities
├── scroll/             # Scroll utilities
├── session/            # SessionStorage management
├── share/              # Web Share API with clipboard fallback
├── storage/            # LocalStorage management with fallback
├── url/                # URL building and query params
├── visibility/         # Page Visibility API wrapper
├── wakelock/           # Screen Wake Lock API wrapper
└── websocket/          # WebSocket with auto-reconnect

(no src/index.ts — the package is subpath-exports only, one entry per module)

tests/
└── [mirrors src/ structure]

.github/
└── workflows/
    └── ci.yml          # GitHub Actions CI/CD

dist/                   # Compiled output (generated, ESM only)
└── <module>/           # One directory per module (index.js + index.d.ts)
```

## Configuration Files

| Tool       | Config File        | Purpose                         |
| ---------- | ------------------ | ------------------------------- |
| TypeScript | `tsconfig.json`    | Type checking (strict)          |
| ESLint     | `eslint.config.js` | Linting + Security + Boundaries |
| Vitest     | `vitest.config.ts` | Testing + Coverage              |
| Prettier   | `.prettierrc`      | Code formatting                 |
| pnpm       | `package.json`     | Dependencies and scripts        |

### Architectural Enforcement

Module boundaries are enforced via `eslint-plugin-boundaries`:

- **Core** (`src/core/`) — may only import from itself
- **Domain modules** (`src/*/`) — may only import from `core/` and themselves
- **Allowed exceptions:**
  - `session/` → `storage/` (extends BaseStorageManager)
  - `offline/` → `indexeddb/` + `network/` (integration module)
  - `share/` → `clipboard/` (clipboard fallback reuses ClipboardManager)

See `docs/ARCHITECTURE.md` for the full dependency documentation.

## npm Scripts

### Primary Commands

| Command                  | Purpose                             |
| ------------------------ | ----------------------------------- |
| `pnpm run quality`       | Run all checks (format, lint, test) |
| `pnpm test`              | Run Vitest tests                    |
| `pnpm run test:coverage` | Run tests with coverage report      |
| `pnpm run build`         | Compile TypeScript                  |
| `pnpm run typecheck`     | Type check without emitting         |

### Linting & Formatting

| Command                 | Purpose                  |
| ----------------------- | ------------------------ |
| `pnpm run lint`         | Run ESLint               |
| `pnpm run lint:fix`     | Run ESLint with auto-fix |
| `pnpm run format`       | Format all files         |
| `pnpm run format:check` | Check formatting         |

### Development

| Command               | Purpose              |
| --------------------- | -------------------- |
| `pnpm run dev`        | Watch mode for build |
| `pnpm run test:watch` | Watch mode for tests |

### Documentation

| Command         | Purpose                    |
| --------------- | -------------------------- |
| `pnpm run docs` | Generate API documentation |

## Quality Targets

| Metric     | Target     |
| ---------- | ---------- |
| TypeScript | Strict     |
| ESLint     | 0 warnings |
| Statements | 99%+       |
| Branches   | 95%+       |
| Functions  | 99%+       |
| Lines      | 99%+       |

## Current Modules (39)

| Module       | Path                | Purpose                                                                    |
| ------------ | ------------------- | -------------------------------------------------------------------------- |
| core         | `src/core/`         | Types, errors, validation, Result, LoggerLike, debounce, throttle, backoff |
| a11y         | `src/a11y/`         | Accessibility (AriaUtils, LiveAnnouncer, ReducedMotion, SkipLink)          |
| broadcast    | `src/broadcast/`    | BroadcastChannel cross-tab messaging                                       |
| cache        | `src/cache/`        | HTTP cache with stale-while-revalidate                                     |
| clipboard    | `src/clipboard/`    | Clipboard API with fallback                                                |
| color        | `src/color/`        | Color parse/convert/validate/contrast/manipulate                           |
| cookie       | `src/cookie/`       | Cookie management (Secure, SameSite)                                       |
| csp          | `src/csp/`          | CSP-aware security utilities                                               |
| device       | `src/device/`       | Device/browser detection                                                   |
| download     | `src/download/`     | File download with validation                                              |
| encryption   | `src/encryption/`   | AES-GCM encrypted storage (PBKDF2)                                         |
| events       | `src/events/`       | Event delegation (re-exports debounce/throttle from core)                  |
| features     | `src/features/`     | Browser feature detection                                                  |
| focus        | `src/focus/`        | Focus trap, focusable elements                                             |
| form         | `src/form/`         | Serialization, validation                                                  |
| fullscreen   | `src/fullscreen/`   | Fullscreen API wrapper                                                     |
| geolocation  | `src/geolocation/`  | Geolocation API wrapper                                                    |
| html         | `src/html/`         | HTML escaping, DOM helpers                                                 |
| idle         | `src/idle/`         | requestIdleCallback utilities                                              |
| indexeddb    | `src/indexeddb/`    | IndexedDB wrapper (large data)                                             |
| intl         | `src/intl/`         | Intl formatting (number/date/plural/collator) + locale negotiation         |
| keyboard     | `src/keyboard/`     | Keyboard shortcut manager                                                  |
| logging      | `src/logging/`      | Console logging with levels                                                |
| media        | `src/media/`        | Media queries, breakpoints                                                 |
| network      | `src/network/`      | Network status, retry queue                                                |
| notification | `src/notification/` | Browser notifications                                                      |
| observe      | `src/observe/`      | Intersection/Resize/Mutation                                               |
| offline      | `src/offline/`      | Offline queue for data sync                                                |
| performance  | `src/performance/`  | Performance measurement utilities                                          |
| request      | `src/request/`      | Fetch interceptor: middleware, auth, retry, dedupe                         |
| sanitize     | `src/sanitize/`     | HTML sanitization                                                          |
| scroll       | `src/scroll/`       | Scroll utilities                                                           |
| session      | `src/session/`      | SessionStorage management                                                  |
| share        | `src/share/`        | Web Share API with clipboard fallback                                      |
| storage      | `src/storage/`      | LocalStorage with memory fallback                                          |
| url          | `src/url/`          | URL builder, query params                                                  |
| visibility   | `src/visibility/`   | Page Visibility API wrapper                                                |
| wakelock     | `src/wakelock/`     | Screen Wake Lock API wrapper                                               |
| websocket    | `src/websocket/`    | WebSocket with auto-reconnect                                              |

## Planned Modules

All originally planned modules have been implemented.

## Module Exports

Package uses subpath exports for tree-shaking:

```typescript
import { StorageManager } from '@zappzarapp/browser-utils/storage';
import { Logger } from '@zappzarapp/browser-utils/logging';
import { CookieManager } from '@zappzarapp/browser-utils/cookie';
import { debounce, throttle } from '@zappzarapp/browser-utils/core';
// Also available via: '@zappzarapp/browser-utils/events'
import { FocusTrap } from '@zappzarapp/browser-utils/focus';
import { FormValidator } from '@zappzarapp/browser-utils/form';
import { MediaQuery } from '@zappzarapp/browser-utils/media';
import { RetryQueue } from '@zappzarapp/browser-utils/network';
import {
  AriaUtils,
  LiveAnnouncer,
  ReducedMotion,
  SkipLink,
} from '@zappzarapp/browser-utils/a11y';
// ... etc.
```

## Security Considerations

### Banned Patterns

- `eval()` - Code injection risk
- `new Function()` - Code injection risk
- `innerHTML` without sanitization - XSS risk (use `DomHelper.setHtml` with
  warning)
- `document.write()` - XSS risk
- `Math.random()` for security - Use `crypto.getRandomValues()`

### Secure Defaults

| Setting         | Default   | Reason                    |
| --------------- | --------- | ------------------------- |
| Cookie Secure   | `true`    | HTTPS only                |
| Cookie SameSite | `Strict`  | CSRF protection           |
| Storage prefix  | Required  | Prevents key collisions   |
| URL protocols   | Allowlist | Blocks javascript:, data: |

### Input Validation

All external input is validated via `Validator`:

- Storage keys: Format validation, control character rejection
- Filenames: Path traversal prevention, reserved name blocking
- Cookie names/values: RFC 6265 compliance
- URLs: Protocol allowlist, XSS prevention
- MIME types: Format validation

## Commit Conventions

### Format

```text
<type>(<scope>): <description>

[optional body]

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Types

| Type       | Description                      |
| ---------- | -------------------------------- |
| `feat`     | New feature                      |
| `fix`      | Bug fix                          |
| `docs`     | Documentation                    |
| `style`    | Code style (no logic change)     |
| `refactor` | Refactoring (no behavior change) |
| `test`     | Tests                            |
| `chore`    | Maintenance                      |
| `security` | Security fix                     |

### Scopes

`core`, `a11y`, `broadcast`, `cache`, `clipboard`, `color`, `cookie`, `csp`,
`device`, `download`, `encryption`, `events`, `features`, `focus`, `form`,
`fullscreen`, `geolocation`, `html`, `idle`, `indexeddb`, `intl`, `keyboard`,
`logging`, `media`, `network`, `notification`, `observe`, `offline`,
`performance`, `request`, `sanitize`, `scroll`, `session`, `share`, `storage`,
`url`, `visibility`, `wakelock`, `websocket`, `build`, `deps`, `ci`

## CI/CD

### GitHub Actions (`.github/workflows/ci.yml`)

| Job      | Purpose                       |
| -------- | ----------------------------- |
| quality  | Format, lint, typecheck, test |
| build    | TypeScript build verification |
| security | pnpm audit                    |

### Required for Merge

- All CI checks pass
- Linear history (rebase)
