/**
 * Storage Key Validation.
 *
 * Validates storage keys and prefixes for localStorage/sessionStorage.
 *
 * @internal
 */
import { ValidationError } from '../errors/ValidationError.js';
import { Result } from '../result/Result.js';

/**
 * Characters forbidden in storage keys (security + compatibility).
 */
const FORBIDDEN_KEY_CHARS = /[;\x00-\x1f]/;

/**
 * Maximum lengths for storage inputs.
 */
const MAX_LENGTHS = {
  storageKey: 128,
  storagePrefix: 32,
} as const;

export const StorageValidator = {
  /**
   * Validate storage key.
   * @throws {ValidationError} If key is invalid
   */
  storageKey(key: string): void {
    const result = StorageValidator.storageKeyResult(key);
    if (Result.isErr(result)) {
      throw result.error;
    }
  },

  /**
   * Validate storage key and return Result.
   */
  storageKeyResult(key: string): Result<string, ValidationError> {
    if (!key) {
      return Result.err(ValidationError.empty('storageKey'));
    }

    if (key.length > MAX_LENGTHS.storageKey) {
      return Result.err(ValidationError.tooLong('storageKey', key, MAX_LENGTHS.storageKey));
    }

    if (FORBIDDEN_KEY_CHARS.test(key)) {
      return Result.err(
        ValidationError.containsForbiddenChars(
          'storageKey',
          key,
          'semicolon, newline, control chars'
        )
      );
    }

    return Result.ok(key);
  },

  /**
   * Validate storage prefix.
   * @throws {ValidationError} If prefix is invalid
   */
  storagePrefix(prefix: string): void {
    const result = StorageValidator.storagePrefixResult(prefix);
    if (Result.isErr(result)) {
      throw result.error;
    }
  },

  /**
   * Validate storage prefix and return Result.
   */
  storagePrefixResult(prefix: string): Result<string, ValidationError> {
    if (!prefix) {
      return Result.err(ValidationError.empty('storagePrefix'));
    }

    if (prefix.length > MAX_LENGTHS.storagePrefix) {
      return Result.err(
        ValidationError.tooLong('storagePrefix', prefix, MAX_LENGTHS.storagePrefix)
      );
    }

    if (FORBIDDEN_KEY_CHARS.test(prefix)) {
      return Result.err(
        ValidationError.containsForbiddenChars(
          'storagePrefix',
          prefix,
          'semicolon, newline, control chars'
        )
      );
    }

    // Prefix should be alphanumeric with optional hyphens/underscores
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(prefix)) {
      return Result.err(
        ValidationError.invalidFormat(
          'storagePrefix',
          prefix,
          'alphanumeric, starting with letter, may contain - or _'
        )
      );
    }

    return Result.ok(prefix);
  },
};
