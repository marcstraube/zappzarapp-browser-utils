/**
 * Cache Key Validation.
 *
 * Validates cache keys for CacheManager.
 * Cache keys allow additional characters (`:`, `/`, `.`) compared to storage keys,
 * supporting namespaced and path-based cache key patterns.
 *
 * @internal
 */
import { ValidationError } from '../errors/ValidationError.js';
import { Result } from '../result/Result.js';

/**
 * Valid cache key pattern: word chars, colons, dots, hyphens, slashes.
 */
const CACHE_KEY_PATTERN = /^[\w:.\-/]+$/;

/**
 * Maximum cache key length.
 */
const MAX_CACHE_KEY_LENGTH = 256;

export const CacheValidator = {
  /**
   * Validate cache key.
   * @throws {ValidationError} If key is invalid
   */
  cacheKey(key: string): void {
    const result = CacheValidator.cacheKeyResult(key);
    if (Result.isErr(result)) {
      throw result.error;
    }
  },

  /**
   * Validate cache key and return Result.
   */
  cacheKeyResult(key: string): Result<string, ValidationError> {
    if (!key) {
      return Result.err(ValidationError.empty('cacheKey'));
    }

    if (key.length > MAX_CACHE_KEY_LENGTH) {
      return Result.err(ValidationError.tooLong('cacheKey', key, MAX_CACHE_KEY_LENGTH));
    }

    if (!CACHE_KEY_PATTERN.test(key)) {
      return Result.err(
        ValidationError.invalidFormat('cacheKey', key, 'alphanumeric, may contain _ - : . /')
      );
    }

    return Result.ok(key);
  },
};
