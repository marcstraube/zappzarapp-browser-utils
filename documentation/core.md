# Core Module

Core utilities providing types, errors, Result type, validation, and
cryptographic functions.

## Quick Start

```typescript
import {
  Result,
  ValidationError,
  BrowserUtilsError,
  Validator,
  generateUUID,
} from '@zappzarapp/browser-utils/core';

// Result type for error handling
const result = Result.fromTry(() => JSON.parse(text));
if (Result.isOk(result)) {
  console.log('Parsed:', result.value);
} else {
  console.error('Failed:', result.error);
}

// Input validation
Validator.filename(userInput); // throws ValidationError if invalid

// Secure UUID generation
const id = generateUUID(); // "550e8400-e29b-41d4-a716-446655440000"
```

## Features

| Feature       | Description                                 |
| ------------- | ------------------------------------------- |
| Result Type   | Rust-inspired type-safe error handling      |
| Error Classes | Structured error hierarchy with codes       |
| Validator     | Input validation for security-critical data |
| CleanupFn     | Standard cleanup function type              |
| generateUUID  | Cryptographically secure UUID v4 generation |

## Exports

| Export                | Type     | Description                                |
| --------------------- | -------- | ------------------------------------------ |
| `Result`              | Object   | Result type constructors and utilities     |
| `BrowserUtilsError`   | Class    | Abstract base error class                  |
| `ValidationError`     | Class    | Validation failure error                   |
| `StorageError`        | Class    | Storage operation error                    |
| `ClipboardError`      | Class    | Clipboard operation error                  |
| `NetworkError`        | Class    | Network operation error                    |
| `FullscreenError`     | Class    | Fullscreen API error                       |
| `NotificationError`   | Class    | Notification API error                     |
| `CookieError`         | Class    | Cookie operation error                     |
| `UrlError`            | Class    | URL validation/parsing error               |
| `GeolocationError`    | Class    | Geolocation API error                      |
| `EncryptionError`     | Class    | Encryption operation error                 |
| `CryptoError`         | Class    | Crypto API error                           |
| `Validator`           | Object   | Unified validation facade                  |
| `generateUUID`        | Function | Secure UUID v4 generation                  |
| `computeBackoffDelay` | Function | Retry delay computation (backoff + jitter) |
| `BackoffStrategy`     | Type     | Backoff strategy type                      |
| `CleanupFn`           | Type     | Cleanup function type                      |

---

## Result Type

Rust-inspired error handling that makes errors visible in type signatures.

### Why Use Result?

- Errors are visible in the type signature
- Forces explicit error handling
- Enables functional composition with `map`/`flatMap`
- No hidden control flow (unlike exceptions)

### Types

```typescript
interface Ok<T> {
  readonly _tag: 'Ok';
  readonly value: T;
}

interface Err<E> {
  readonly _tag: 'Err';
  readonly error: E;
}

type Result<T, E> = Ok<T> | Err<E>;
```

### Constructors

#### Result.ok()

Create a success result.

```typescript
const result = Result.ok(42);
// { _tag: 'Ok', value: 42 }
```

#### Result.err()

Create a failure result.

```typescript
const result = Result.err(new Error('Failed'));
// { _tag: 'Err', error: Error }
```

### Type Guards

#### Result.isOk()

Check if result is success.

```typescript
const result = parseJson(text);
if (Result.isOk(result)) {
  console.log(result.value); // TypeScript knows value exists
}
```

#### Result.isErr()

Check if result is failure.

```typescript
if (Result.isErr(result)) {
  console.error(result.error); // TypeScript knows error exists
}
```

### Extractors

#### Result.unwrap()

Extract value or throw if error.

```typescript
const value = Result.unwrap(result); // throws if Err
```

#### Result.unwrapOr()

Extract value or return default.

```typescript
const value = Result.unwrapOr(result, defaultValue);
```

#### Result.unwrapOrElse()

Extract value or compute from error.

```typescript
const value = Result.unwrapOrElse(result, (error) => {
  console.error(error);
  return fallbackValue;
});
```

#### Result.unwrapErr()

Extract error or throw if success.

```typescript
const error = Result.unwrapErr(result); // throws if Ok
```

### Transformers

#### Result.map()

Transform success value.

```typescript
const doubled = Result.map(result, (x) => x * 2);
// Ok(42) -> Ok(84)
// Err(e) -> Err(e)
```

#### Result.mapErr()

Transform error value.

```typescript
const mapped = Result.mapErr(result, (e) => new CustomError(e.message));
```

#### Result.flatMap()

Chain operations that return Results.

```typescript
const result = Result.flatMap(
  parseResult,
  (data) => validateData(data) // returns Result
);
```

### Utilities

#### Result.fromTry()

Convert throwing function to Result.

```typescript
const result = Result.fromTry(() => JSON.parse(text));

// With error mapping
const result = Result.fromTry(
  () => JSON.parse(text),
  (e) => ValidationError.invalidFormat('json', text, 'valid JSON')
);
```

#### Result.fromPromise()

Convert Promise to Promise<Result>.

```typescript
const result = await Result.fromPromise(fetch('/api/data'));

// With error mapping
const result = await Result.fromPromise(
  fetch('/api/data'),
  (e) => new NetworkError('FETCH_FAILED', e.message)
);
```

#### Result.tap()

Execute side effect on success.

```typescript
const result = Result.tap(parseResult, (value) => {
  console.log('Parsed:', value);
});
```

#### Result.tapErr()

Execute side effect on error.

```typescript
const result = Result.tapErr(parseResult, (error) => {
  console.error('Failed:', error);
});
```

#### Result.match()

Pattern match on Result.

```typescript
const message = Result.match(result, {
  ok: (value) => `Success: ${value}`,
  err: (error) => `Error: ${error.message}`,
});
```

### Example: Chaining Operations

```typescript
function processUserInput(
  input: string
): Result<ProcessedData, ValidationError> {
  return Result.flatMap(Validator.nonEmptyResult('input', input), () =>
    Result.flatMap(parseJson(input), (data) => validateSchema(data))
  );
}

// Or using tap for logging
const result = Result.tap(
  Result.map(parseJson(input), (data) => transform(data)),
  (value) => console.log('Processed:', value)
);
```

---

## Error Classes

Structured error hierarchy with error codes for programmatic handling.

### BrowserUtilsError

Abstract base class for all errors.

```typescript
abstract class BrowserUtilsError extends Error {
  abstract readonly code: string;
  readonly cause?: unknown;

  toFormattedString(): string; // "[CODE] message"
}
```

### Error Handling

```typescript
try {
  storage.set('key', value);
} catch (error) {
  if (error instanceof BrowserUtilsError) {
    console.error(`[${error.code}] ${error.message}`);

    // Handle specific error types
    if (error instanceof StorageError) {
      if (error.code === 'QUOTA_EXCEEDED') {
        // Handle quota exceeded
      }
    }
  }
}
```

### ValidationError

Thrown when input validation fails.

```typescript
class ValidationError extends BrowserUtilsError {
  readonly code = 'VALIDATION_ERROR';
  readonly field: string; // Field that failed
  readonly value: string; // Sanitized value
  readonly constraint: string; // Violated constraint
}

// Factory methods
ValidationError.empty(field);
ValidationError.containsForbiddenChars(field, value, chars);
ValidationError.invalidFilename(filename, reason);
ValidationError.tooLong(field, value, maxLength);
ValidationError.invalidFormat(field, value, expectedFormat);
ValidationError.outOfRange(field, value, min, max);
```

### Domain-Specific Errors

Each module has its own error class with specific error codes:

| Error Class         | Module       | Example Codes                            |
| ------------------- | ------------ | ---------------------------------------- |
| `StorageError`      | Storage      | `QUOTA_EXCEEDED`, `KEY_NOT_FOUND`        |
| `ClipboardError`    | Clipboard    | `NOT_SUPPORTED`, `PERMISSION_DENIED`     |
| `NetworkError`      | Network      | `TIMEOUT`, `OFFLINE`                     |
| `FullscreenError`   | Fullscreen   | `NOT_SUPPORTED`, `ELEMENT_NOT_FOUND`     |
| `NotificationError` | Notification | `NOT_SUPPORTED`, `PERMISSION_DENIED`     |
| `CookieError`       | Cookie       | `INVALID_NAME`, `INVALID_VALUE`          |
| `UrlError`          | URL          | `INVALID_URL`, `UNSAFE_PROTOCOL`         |
| `GeolocationError`  | Geolocation  | `NOT_SUPPORTED`, `PERMISSION_DENIED`     |
| `EncryptionError`   | Encryption   | `ENCRYPTION_FAILED`, `DECRYPTION_FAILED` |
| `CryptoError`       | Crypto       | `CRYPTO_UNAVAILABLE`                     |

---

## Validator

Centralized input validation for security-critical inputs.

### Validation Strategy

- **Throw on invalid**: Use `Validator.method(value)` - throws `ValidationError`
- **Return Result**: Use `Validator.methodResult(value)` - returns
  `Result<T, ValidationError>`

### Method Reference

| Facade Method             | Domain Validator    | Validates                       |
| ------------------------- | ------------------- | ------------------------------- |
| `storageKey()`            | `StorageValidator`  | Storage key format and length   |
| `storageKeyResult()`      | `StorageValidator`  | _(Result variant)_              |
| `storagePrefix()`         | `StorageValidator`  | Storage prefix format           |
| `storagePrefixResult()`   | `StorageValidator`  | _(Result variant)_              |
| `cacheKey()`              | `CacheValidator`    | Cache key format and length     |
| `cacheKeyResult()`        | `CacheValidator`    | _(Result variant)_              |
| `filename()`              | `FilenameValidator` | Path traversal, reserved names  |
| `filenameResult()`        | `FilenameValidator` | _(Result variant)_              |
| `sanitizeFilename()`      | `FilenameValidator` | Sanitize to safe filename       |
| `mimeType()`              | `FilenameValidator` | MIME type format                |
| `mimeTypeResult()`        | `FilenameValidator` | _(Result variant)_              |
| `cookieName()`            | `CookieValidator`   | RFC 6265 cookie name            |
| `cookieNameResult()`      | `CookieValidator`   | _(Result variant)_              |
| `cookieValue()`           | `CookieValidator`   | RFC 6265 cookie value           |
| `cookieValueResult()`     | `CookieValidator`   | _(Result variant)_              |
| `urlSafe()`               | `UrlValidator`      | Blocks javascript:, data:, etc. |
| `urlSafeResult()`         | `UrlValidator`      | _(Result variant)_              |
| `nonEmpty()`              | `CommonValidator`   | Non-empty string                |
| `nonEmptyResult()`        | `CommonValidator`   | _(Result variant)_              |
| `numberInRange()`         | `CommonValidator`   | Number within min/max bounds    |
| `numberInRangeResult()`   | `CommonValidator`   | _(Result variant)_              |
| `positiveIntegerResult()` | `CommonValidator`   | Positive integer (Result only)  |
| `clipboardText()`         | `CommonValidator`   | Clipboard text content          |
| `clipboardTextResult()`   | `CommonValidator`   | _(Result variant)_              |

### Storage Validation

```typescript
// Throws on invalid
Validator.storageKey(key);
Validator.storagePrefix(prefix);

// Returns Result
const result = Validator.storageKeyResult(key);
const result = Validator.storagePrefixResult(prefix);
```

### Filename Validation

```typescript
// Throws on invalid
Validator.filename(filename);
Validator.mimeType(mimeType);

// Returns Result
const result = Validator.filenameResult(filename);
const result = Validator.mimeTypeResult(mimeType);

// Sanitize (never throws)
const safe = Validator.sanitizeFilename(filename);
const safe = Validator.sanitizeFilename(filename, '_'); // custom replacement
```

### Cookie Validation

```typescript
// Throws on invalid
Validator.cookieName(name);
Validator.cookieValue(value);

// Returns Result
const result = Validator.cookieNameResult(name);
const result = Validator.cookieValueResult(value);
```

### URL Validation

```typescript
// Throws on invalid (blocks javascript:, data:, etc.)
Validator.urlSafe(url);

// Returns Result
const result = Validator.urlSafeResult(url);
```

### Common Validation

```typescript
// Non-empty check
Validator.nonEmpty('username', value);
const result = Validator.nonEmptyResult('username', value);

// Number range check
Validator.numberInRange('age', value, 0, 150);
const result = Validator.numberInRangeResult('age', value, 0, 150);

// Positive integer check
const result = Validator.positiveIntegerResult('count', value);

// Clipboard text validation
Validator.clipboardText(text);
const result = Validator.clipboardTextResult(text);
```

### Tree-Shaking

For smaller bundles, import domain validators directly:

```typescript
import { StorageValidator } from '@zappzarapp/browser-utils/core/validation';
import { FilenameValidator } from '@zappzarapp/browser-utils/core/validation';
import { CookieValidator } from '@zappzarapp/browser-utils/core/validation';
import { UrlValidator } from '@zappzarapp/browser-utils/core/validation';
import { CommonValidator } from '@zappzarapp/browser-utils/core/validation';
```

---

## CleanupFn Type

Standard type for cleanup functions returned by event subscriptions.

```typescript
type CleanupFn = () => void;
```

### Usage Pattern

```typescript
// Subscribe returns cleanup function
const cleanup = VisibilityManager.onChange((state) => {
  console.log('State:', state);
});

// Call cleanup to unsubscribe
cleanup();
```

### Combining Cleanup Functions

```typescript
function setupListeners(): CleanupFn {
  const cleanups: CleanupFn[] = [];

  cleanups.push(VisibilityManager.onChange(handleVisibility));
  cleanups.push(PerformanceMonitor.onMetric('lcp', handleLcp));

  // Return combined cleanup
  return () => cleanups.forEach((fn) => fn());
}

const cleanup = setupListeners();
// Later: cleanup all at once
cleanup();
```

---

## generateUUID

Cryptographically secure UUID v4 generation.

```typescript
import { generateUUID, CryptoError } from '@zappzarapp/browser-utils/core';

try {
  const id = generateUUID();
  console.log(id); // "550e8400-e29b-41d4-a716-446655440000"
} catch (e) {
  if (e instanceof CryptoError) {
    console.error('Crypto API unavailable');
  }
}
```

### Security

- Uses `crypto.randomUUID()` when available (modern browsers)
- Falls back to `crypto.getRandomValues()` for older browsers
- **Never falls back to `Math.random()`** - throws `CryptoError` instead
- Fail-secure design: better to fail than use insecure randomness

### CryptoError

```typescript
class CryptoError extends BrowserUtilsError {
  readonly code: 'CRYPTO_UNAVAILABLE';
}

// Factory method
CryptoError.unavailable();
```

---

## Security Considerations

1. **Input Validation** - Always validate user input before processing:
   - Filenames: Prevent path traversal, null bytes, reserved names
   - Storage keys: Prevent injection, control characters
   - URLs: Prevent javascript: and data: protocols
   - Cookies: Prevent header injection

2. **Error Information** - Validation errors sanitize values before including in
   error messages to prevent information leakage.

3. **Cryptographic Security** - UUID generation uses only cryptographically
   secure random sources; insecure fallbacks are explicitly rejected.

4. **Defense in Depth** - URL validation uses an allowlist approach, only
   permitting known-safe protocols.

---

## Browser Support

| Feature                  | Chrome | Firefox | Safari | Edge |
| ------------------------ | ------ | ------- | ------ | ---- |
| crypto.randomUUID()      | 92+    | 95+     | 15.4+  | 92+  |
| crypto.getRandomValues() | 11+    | 21+     | 5+     | 12+  |
| Error.cause              | 93+    | 91+     | 15+    | 93+  |

**Note:** All core functionality works in all modern browsers. The crypto
fallback ensures UUID generation works in older browsers that support
`crypto.getRandomValues()`.
