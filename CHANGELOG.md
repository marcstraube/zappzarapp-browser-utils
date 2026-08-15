# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.0](https://github.com/marcstraube/zappzarapp-node-browser-utils/compare/v2.1.0...v2.2.0) (2026-08-14)


### Features

* **keyboard:** make ShortcutManager adoptable as an app-wide shortcut surface ([#168](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/168)) ([119084c](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/119084c91d795c6e40d90705d5a74ffdb9dc59bf))
* **request:** add request deduplication ([#196](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/196)) ([6db8212](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/6db821275870cfbac5694b6bbbf1e279a0505964))
* **request:** support Retry-After header ([#186](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/186)) ([60ea1a1](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/60ea1a12fbee470f4a2de4a66fe372e0129c788c))
* **share:** add Web Share API module ([#193](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/193)) ([6ca1c7e](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/6ca1c7e8ed46229f4697569ed0aefd0a94b01583))
* **wakelock:** add Screen Wake Lock API module ([#176](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/176)) ([1917618](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/191761811ffe3f37890c74296591d795a9e3862f))


### Bug Fixes

* **request:** run error middleware and timing once on throwOnError ([#187](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/187)) ([706329c](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/706329c1fda667aaa870653acc88bbbb8cf5d04f))

## [2.1.0](https://github.com/marcstraube/zappzarapp-node-browser-utils/compare/v2.0.0...v2.1.0) (2026-06-15)


### Features

* **color:** add color module (parse, convert, validate, contrast, manipulate) ([#136](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/136)) ([38f1fef](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/38f1fefc78697fe81951a4066ae9204658e80386))
* **form:** add async loading state, field-change and submit handlers ([#145](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/145)) ([0a44283](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/0a44283aff0064ea8a4c4239fcaf0379596c43f0))
* **intl:** add intl module (Intl-API wrappers + locale negotiation) ([#142](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/142)) ([919785c](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/919785c3168c687b81e2dbf394bd4322a120a3aa))
* **request:** add head() and options() convenience methods ([#143](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/143)) ([3d28fdd](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/3d28fdd7b8cf05da5ac98623090acdaaf001f256))
* **websocket:** add SSE/polling transport fallback ([#148](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/148)) ([2c3870f](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/2c3870f5c1e71452e7fb698bf64e6a06d8a0a66e))


### Bug Fixes

* **form:** gate async validation behind passing sync validation ([#144](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/144)) ([af088ec](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/af088ec8d9db51e0eae9861977a042d5b582b724))

## [2.0.0](https://github.com/marcstraube/zappzarapp-node-browser-utils/compare/v1.3.0...v2.0.0) (2026-06-09)


### ⚠ BREAKING CHANGES

* unify DeviceInfo orientation API into immutable OrientationState ([#125](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/125)) (#126)
* require Node.js 22+ ([#121](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/121))

### Features

* require Node.js 22+ ([#121](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/121)) ([8271272](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/8271272f0d5f6dd08a8f4945c49d1df64d498408))
* unify DeviceInfo orientation API into immutable OrientationState ([#125](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/125)) ([#126](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/126)) ([9250510](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/925051040a78d749f09b7087a3ec9db838f0dd9e))

## [1.3.0](https://github.com/marcstraube/zappzarapp-node-browser-utils/compare/v1.2.0...v1.3.0) (2026-05-01)


### Features

* **request:** add upload progress tracking ([#86](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/86)) ([38f2abc](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/38f2abca0a7853001613595b7dbce077f07f129c))


### Bug Fixes

* **ci:** exempt release-please bot from GPG signature verification ([#92](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/92)) ([9492ce1](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/9492ce1b5d7d8ab6a252fea2f1af8be1ceb1f447))

## [1.2.0](https://github.com/marcstraube/zappzarapp-node-browser-utils/compare/v1.1.0...v1.2.0) (2026-04-19)

### Features

- **cache:** add onRevalidate callback for SWR completion notification
  ([#69](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/69))
  ([ed24830](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/ed24830f06b09bf2d81a3f37cfeca3da5f3b27fc))
- **request:** add fetch streaming/progress utilities
  ([#68](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/68))
  ([2bd1713](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/2bd17130138ada317d04e0af96470bf42666e7aa))

### Bug Fixes

- **ci:** trigger npm publish on GitHub Release event
  ([#65](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/65))
  ([d3a1e40](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/d3a1e4044ddc8acbd3010aed2a1230077b315015))

## [1.1.0](https://github.com/marcstraube/zappzarapp-node-browser-utils/compare/v1.0.3...v1.1.0) (2026-04-17)

### Features

- **network:** add circuit breaker pattern to RetryQueue
  ([#57](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/57))
  ([d0c9204](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/d0c9204c40e51050cc7ed42b4f777b65c45a7944))
- **request:** add Content-Type response validation
  ([#56](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/56))
  ([e3cd5bb](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/e3cd5bb6a9055f87d6100b63563e2511f2f183ab))
- **request:** expose combineAbortSignals as public utility
  ([#54](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/54))
  ([0adb3a9](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/0adb3a95170d1b183a71f9359816c6401f8d6a94))
- **storage:** add custom serializer hook for BaseStorageManager
  ([#58](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/58))
  ([052bf66](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/052bf669c0c264f8d6a2cf01e14760f5769667e8))

### Bug Fixes

- **ci:** exclude CHANGELOG.md from prettier format checks
  ([#63](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/63))
  ([8ea1dae](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/8ea1dae3a6ef45d7f894cfcd0cd9db1f13e53781))
- **ci:** upgrade npm for OIDC trusted publishing support
  ([#40](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/40))
  ([b84b28a](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/b84b28a429cfc0e3b3626260a611eb88b008fb1d))
- **ci:** use npm publish for OIDC trusted publishing
  ([#38](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/38))
  ([9f91a5d](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/9f91a5d3d28ef4f58eea34b7cc9e01fd5a6d1eb3))
- **test:** stabilize flaky OfflineQueue integration test
  ([#62](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/62))
  ([dbce592](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/dbce592ca2cc3bb4bfd32ee5ccc36f7b722ae864))

## [1.0.3](https://github.com/marcstraube/zappzarapp-node-browser-utils/compare/v1.0.2...v1.0.3) (2026-04-10)

### Bug Fixes

- **ci:** use --force for GitLab mirror instead of --mirror
  ([7504d12](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/7504d12042a0bf1f11f2a7f80cbbc3a608771a2a))
- **ci:** use --mirror for GitLab push to handle existing tags
  ([c564881](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/c5648819a08862c5da44386232811d53de0facc0))
- **eslint-plugin:** crash in &lt;code&gt;no-unnecessary-type-arguments&lt;/co…
  ([933a4ed](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/933a4ede0353f6909213368ca59ec933028b84ec))

## [1.0.2](https://github.com/marcstraube/zappzarapp-node-browser-utils/compare/v1.0.1...v1.0.2) (2026-02-13)

### Bug Fixes

- **build:** resolve ERR_UNSUPPORTED_DIR_IMPORT in ESM output
  ([#12](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/12))
  ([fc614eb](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/fc614eb6a419f1073b543bd74920bd3e4247a099))
- **ci:** align CI job names with branch protection required checks
  ([#14](https://github.com/marcstraube/zappzarapp-node-browser-utils/pull/14))
  ([9a6d3f0](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/9a6d3f0b7228859fecce36b238885d2be949045a))
- **hooks:** prevent post-merge hook failure on no dependency changes
  ([#16](https://github.com/marcstraube/zappzarapp-node-browser-utils/issues/16))
  ([f022780](https://github.com/marcstraube/zappzarapp-node-browser-utils/commit/f02278044086f86b8ec2d4b72d0b69cf1b238c62))

## [1.0.1] - 2026-02-13

### Security

- **validation**: Fix ReDoS vulnerability in MIME type regex (`\S+` → `[^\s;]+`)
  ([CWE-1333](https://cwe.mitre.org/data/definitions/1333.html))
- **validation**: Fix incomplete string sanitization — add global flag to
  forbidden character replacement
  ([CWE-116](https://cwe.mitre.org/data/definitions/116.html))
- **request**: Fix incomplete URL scheme check — case-insensitive protocol
  comparison and add `vbscript:` to blocklist
  ([CWE-20](https://cwe.mitre.org/data/definitions/20.html))

## [1.0.0] - 2026-02-12

Initial stable release with 35 modules providing comprehensive browser
utilities. ESM-only, tree-shakeable via subpath exports, zero dependencies.

### Security

- **url**: `UrlBuilder.withProtocol()` validates protocol against allowlist,
  rejecting dangerous protocols like `javascript:`
- **websocket**: `WebSocketManager` heartbeat wraps `heartbeatMessage()` calls
  in try-catch and routes errors to registered error handlers
- **clipboard**: `ClipboardManager.writeTextFallback()` uses try-finally to
  ensure textarea is removed from DOM even if `focus()`/`select()` throws
- **network**: `RetryQueue` constructor validates `baseDelay > 0` and
  `maxDelay > 0`, throwing `NetworkError` with code `NETWORK_INVALID_OPTIONS`
- **device**: `isWindows()`, `isMacOS()`, `isLinux()` use
  `navigator.userAgentData.platform` with `navigator.platform` fallback
- **device**: `orientationAngle()` no longer falls back to deprecated
  `window.orientation`; returns `0` when Screen Orientation API is unavailable

### Added

#### Core

- **core**: Foundation types, Result monad for error handling, Validator for
  input validation, and error classes (BrowserUtilsError, ValidationError,
  StorageError, ClipboardError, NetworkError, FullscreenError,
  NotificationError, CookieError, UrlError, GeolocationError)
- **core/validation**: Centralized `CacheValidator` for cache-specific key rules
  (allows `:` and `/`, max 256 characters)

#### Storage

- **storage**: Type-safe localStorage management with LRU eviction, memory
  fallback, and namespacing via `StorageManager` and `StorageConfig`
- **session**: SessionStorage management with `SessionStorageManager`, mirroring
  storage module API
- **cookie**: Cookie management with secure defaults (Secure, SameSite) via
  `CookieManager` and `CookieOptions`
- **indexeddb**: IndexedDB wrapper for large data storage with
  `IndexedDBManager`, transaction support, and store configuration

#### DOM Utilities

- **html**: HTML escaping via `HtmlEscaper` and DOM helpers via `DomHelper`
- **sanitize**: HTML sanitization utilities via `HtmlSanitizer` with
  DOMPurify-style configuration
- **scroll**: Scroll utilities via `ScrollUtils` for smooth scrolling and
  position tracking
- **focus**: Focus management via `FocusTrap` and `FocusUtils` for modal dialogs
  and accessible navigation
- **fullscreen**: Fullscreen API wrapper via `Fullscreen` class with
  cross-browser support
- **form**: Form serialization via `FormSerializer`, validation via
  `FormValidator`, and utilities via `FormUtils`

#### Events

- **events**: Event utilities including `debounce`, `throttle`, and `EventUtils`
  for delegation
- **keyboard**: Keyboard shortcut management via `KeyboardShortcut`,
  `ShortcutManager`, and `ShortcutGroup`
- **idle**: requestIdleCallback utilities via `IdleCallback` with task queue
  support

#### Observers

- **observe**: Observer wrappers including `IntersectionObserverWrapper`,
  `ResizeObserverWrapper`, and `MutationObserverWrapper`

#### Network and Communication

- **network**: Network status detection via `NetworkStatus` and retry queue via
  `RetryQueue` with exponential backoff
- **websocket**: WebSocket management via `WebSocketManager` with auto-reconnect
  and connection state tracking
- **broadcast**: Cross-tab communication via `BroadcastManager` using
  BroadcastChannel API
- **request**: HTTP request interceptor via `RequestInterceptor` with middleware
  support, authentication, and timing
- **offline**: Offline-first queue via `OfflineQueue` for background sync with
  conflict resolution

#### Browser APIs

- **clipboard**: Clipboard API wrapper via `ClipboardManager` with fallback
  support
- **notification**: Browser notification API via `BrowserNotification` with
  permission handling
- **geolocation**: Geolocation API wrapper via `GeolocationManager` with options
  for accuracy and timeout
- **visibility**: Page Visibility API via `VisibilityManager` for detecting tab
  visibility changes

#### Device and Environment

- **device**: Device information detection via `DeviceInfo` including
  orientation, screen size, and touch support
- **features**: Browser feature detection via `FeatureDetect` with comprehensive
  capability reporting
- **media**: Media query utilities via `MediaQuery` for responsive design with
  breakpoint management

#### URL and Navigation

- **url**: URL building via `UrlBuilder`, query parameter handling via
  `QueryParams`, and history management via `HistoryManager`

#### Logging and Monitoring

- **logging**: Console logging with configurable levels via `Logger` and
  `LoggerConfig`
- **performance**: Performance monitoring via `PerformanceMonitor` for tracking
  Core Web Vitals and custom metrics

#### Security

- **csp**: Content Security Policy utilities via `CspUtils` for violation
  monitoring and nonce generation
- **encryption**: Client-side encryption via `EncryptedStorage` with AES-GCM and
  PBKDF2 key derivation

#### Caching

- **cache**: Cache API wrapper via `CacheManager` for request/response caching
  with expiration and size limits

#### Accessibility

- **a11y**: Accessibility utilities with `AriaUtils` for safe ARIA attribute
  management, `LiveAnnouncer` for screen reader live region announcements,
  `ReducedMotion` for `prefers-reduced-motion` detection and monitoring, and
  `SkipLink` for accessible skip navigation links

#### Download

- **download**: File download utilities via `Downloader` and `DownloadOptions`
  for generating and triggering file downloads

[1.0.1]:
  https://github.com/marcstraube/zappzarapp-node-browser-utils/compare/v1.0.0...v1.0.1
[1.0.0]:
  https://github.com/marcstraube/zappzarapp-node-browser-utils/releases/tag/v1.0.0
