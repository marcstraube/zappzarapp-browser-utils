// Errors
export {
  BrowserUtilsError,
  ValidationError,
  StorageError,
  ClipboardError,
  NetworkError,
  FullscreenError,
  NotificationError,
  CookieError,
  UrlError,
  GeolocationError,
  EncryptionError,
  WebSocketError,
  IndexedDBError,
  BroadcastError,
  CspError,
  ColorError,
  IntlError,
  WakeLockError,
} from './errors/index.js';
export type {
  StorageErrorCode,
  ClipboardErrorCode,
  NetworkErrorCode,
  FullscreenErrorCode,
  NotificationErrorCode,
  CookieErrorCode,
  UrlErrorCode,
  GeolocationErrorCode,
  EncryptionErrorCode,
  WebSocketErrorCode,
  IndexedDBErrorCode,
  BroadcastErrorCode,
  CspErrorCode,
  ColorErrorCode,
  IntlErrorCode,
  WakeLockErrorCode,
} from './errors/index.js';

// Result Type
export { Result } from './result/index.js';
export type { ResultType, Ok, Err } from './result/index.js';

// Validation
export { Validator } from './validation/index.js';
export type { UrlValidationOptions } from './validation/UrlValidator.js';

// Core Types
export type { CleanupFn } from './types.js';
export type { LoggerLike } from './logger.js';
export { noopLogger } from './logger.js';

// Crypto Utilities
export { generateUUID, CryptoError } from './crypto.js';
export type { CryptoErrorCode } from './crypto.js';

// Backoff
export { computeBackoffDelay } from './Backoff.js';
export type { BackoffStrategy } from './Backoff.js';

// Debounce & Throttle
export { debounce } from './Debounce.js';
export type { DebounceOptions, DebouncedFunction } from './Debounce.js';
export { throttle } from './Throttle.js';
export type { ThrottleOptions, ThrottledFunction } from './Throttle.js';
