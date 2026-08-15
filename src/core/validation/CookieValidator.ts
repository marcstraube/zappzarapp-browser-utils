/**
 * Cookie Validation.
 *
 * Validates cookie names and values per RFC 6265.
 *
 * @internal
 */
import { ValidationError } from '../errors/ValidationError.js';
import { Result } from '../result/Result.js';

/**
 * Maximum lengths for cookie inputs.
 */
const MAX_LENGTHS = {
  cookieName: 256,
  cookieValue: 4096,
} as const;

/**
 * RFC 6265 compliant cookie name pattern.
 * Cookie names cannot contain: control chars, spaces, tabs, or separators
 */
const COOKIE_NAME_FORBIDDEN = /[()<>@,;:\\"/[\]?={}\s\x00-\x1f\x7f]/;

/**
 * Cookie value forbidden characters (no semicolons, control chars).
 */
const COOKIE_VALUE_FORBIDDEN = /[;\x00-\x1f\x7f]/;

export const CookieValidator = {
  /**
   * Validate cookie name per RFC 6265.
   * @throws {ValidationError} If name is invalid
   */
  cookieName(name: string): void {
    const result = CookieValidator.cookieNameResult(name);
    if (Result.isErr(result)) {
      throw result.error;
    }
  },

  /**
   * Validate cookie name and return Result.
   */
  cookieNameResult(name: string): Result<string, ValidationError> {
    if (!name) {
      return Result.err(ValidationError.empty('cookieName'));
    }

    if (name.length > MAX_LENGTHS.cookieName) {
      return Result.err(ValidationError.tooLong('cookieName', name, MAX_LENGTHS.cookieName));
    }

    if (COOKIE_NAME_FORBIDDEN.test(name)) {
      return Result.err(
        ValidationError.containsForbiddenChars(
          'cookieName',
          name,
          'spaces, tabs, separators, control chars'
        )
      );
    }

    return Result.ok(name);
  },

  /**
   * Validate cookie value.
   * @throws {ValidationError} If value is invalid
   */
  cookieValue(value: string): void {
    const result = CookieValidator.cookieValueResult(value);
    if (Result.isErr(result)) {
      throw result.error;
    }
  },

  /**
   * Validate cookie value and return Result.
   */
  cookieValueResult(value: string): Result<string, ValidationError> {
    if (value.length > MAX_LENGTHS.cookieValue) {
      return Result.err(ValidationError.tooLong('cookieValue', value, MAX_LENGTHS.cookieValue));
    }

    if (COOKIE_VALUE_FORBIDDEN.test(value)) {
      return Result.err(
        ValidationError.containsForbiddenChars('cookieValue', value, 'semicolons, control chars')
      );
    }

    return Result.ok(value);
  },
};
