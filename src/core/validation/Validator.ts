/**
 * Input Validation Utilities.
 *
 * Centralized validation for security-critical inputs.
 * Defense in Depth: Validate at every boundary.
 *
 * Security considerations:
 * - Filenames: Prevent path traversal, null bytes, reserved names
 * - Storage keys: Prevent injection, control characters
 * - URLs: Prevent javascript: and data: protocols
 *
 * @example
 * ```TypeScript
 * // Validate or throw
 * Validator.filename(userInput); // throws ValidationError if invalid
 *
 * // Validate and get Result
 * const result = Validator.filenameResult(userInput);
 * if (Result.isErr(result)) {
 *   console.error(result.error.message);
 * }
 * ```
 */
import { StorageValidator } from './StorageValidator.js';
import { CacheValidator } from './CacheValidator.js';
import { FilenameValidator } from './FilenameValidator.js';
import { CookieValidator } from './CookieValidator.js';
import { UrlValidator } from './UrlValidator.js';
import { CommonValidator } from './CommonValidator.js';
import type { Result } from '../result/index.js';
import type { ValidationError } from '../errors/index.js';

/**
 * Unified Validator facade.
 *
 * Combines all domain-specific validators into a single API.
 * For tree-shaking, import domain validators directly.
 *
 * Note: Arrow functions wrap domain validator methods to ensure proper
 * binding when methods are extracted from this facade object.
 */
export const Validator = {
  // =========================================================================
  // Storage Validation (from StorageValidator)
  // =========================================================================

  /** @see StorageValidator.storageKey */
  storageKey: (key: string): void => StorageValidator.storageKey(key),

  /** @see StorageValidator.storageKeyResult */
  storageKeyResult: (key: string): Result<string, ValidationError> =>
    StorageValidator.storageKeyResult(key),

  /** @see StorageValidator.storagePrefix */
  storagePrefix: (prefix: string): void => StorageValidator.storagePrefix(prefix),

  /** @see StorageValidator.storagePrefixResult */
  storagePrefixResult: (prefix: string): Result<string, ValidationError> =>
    StorageValidator.storagePrefixResult(prefix),

  // =========================================================================
  // Cache Validation (from CacheValidator)
  // =========================================================================

  /** @see CacheValidator.cacheKey */
  cacheKey: (key: string): void => CacheValidator.cacheKey(key),

  /** @see CacheValidator.cacheKeyResult */
  cacheKeyResult: (key: string): Result<string, ValidationError> =>
    CacheValidator.cacheKeyResult(key),

  // =========================================================================
  // Filename Validation (from FilenameValidator)
  // =========================================================================

  /** @see FilenameValidator.filename */
  filename: (filename: string): void => FilenameValidator.filename(filename),

  /** @see FilenameValidator.filenameResult */
  filenameResult: (filename: string): Result<string, ValidationError> =>
    FilenameValidator.filenameResult(filename),

  /** @see FilenameValidator.sanitizeFilename */
  sanitizeFilename: (filename: string, replacement?: string): string =>
    FilenameValidator.sanitizeFilename(filename, replacement),

  /** @see FilenameValidator.mimeType */
  mimeType: (mimeType: string): void => FilenameValidator.mimeType(mimeType),

  /** @see FilenameValidator.mimeTypeResult */
  mimeTypeResult: (mimeType: string): Result<string, ValidationError> =>
    FilenameValidator.mimeTypeResult(mimeType),

  // =========================================================================
  // Cookie Validation (from CookieValidator)
  // =========================================================================

  /** @see CookieValidator.cookieName */
  cookieName: (name: string): void => CookieValidator.cookieName(name),

  /** @see CookieValidator.cookieNameResult */
  cookieNameResult: (name: string): Result<string, ValidationError> =>
    CookieValidator.cookieNameResult(name),

  /** @see CookieValidator.cookieValue */
  cookieValue: (value: string): void => CookieValidator.cookieValue(value),

  /** @see CookieValidator.cookieValueResult */
  cookieValueResult: (value: string): Result<string, ValidationError> =>
    CookieValidator.cookieValueResult(value),

  // =========================================================================
  // URL Validation (from UrlValidator)
  // =========================================================================

  /** @see UrlValidator.urlSafe */
  urlSafe: (url: string): void => UrlValidator.urlSafe(url),

  /** @see UrlValidator.urlSafeResult */
  urlSafeResult: (url: string): Result<string, ValidationError> => UrlValidator.urlSafeResult(url),

  // =========================================================================
  // Common Validation (from CommonValidator)
  // =========================================================================

  /** @see CommonValidator.nonEmpty */
  nonEmpty: (field: string, value: string): void => CommonValidator.nonEmpty(field, value),

  /** @see CommonValidator.nonEmptyResult */
  nonEmptyResult: (field: string, value: string): Result<string, ValidationError> =>
    CommonValidator.nonEmptyResult(field, value),

  /** @see CommonValidator.numberInRange */
  numberInRange: (field: string, value: number, min: number, max: number): void =>
    CommonValidator.numberInRange(field, value, min, max),

  /** @see CommonValidator.numberInRangeResult */
  numberInRangeResult: (
    field: string,
    value: number,
    min: number,
    max: number
  ): Result<number, ValidationError> => CommonValidator.numberInRangeResult(field, value, min, max),

  /** @see CommonValidator.positiveIntegerResult */
  positiveIntegerResult: (field: string, value: number): Result<number, ValidationError> =>
    CommonValidator.positiveIntegerResult(field, value),

  /** @see CommonValidator.clipboardText */
  clipboardText: (text: string): void => CommonValidator.clipboardText(text),

  /** @see CommonValidator.clipboardTextResult */
  clipboardTextResult: (text: string): Result<string, ValidationError> =>
    CommonValidator.clipboardTextResult(text),
};

// Re-export domain validators for tree-shaking
export { StorageValidator } from './StorageValidator.js';
export { CacheValidator } from './CacheValidator.js';
export { FilenameValidator } from './FilenameValidator.js';
export { CookieValidator } from './CookieValidator.js';
export { UrlValidator } from './UrlValidator.js';
export { CommonValidator } from './CommonValidator.js';
