/**
 * Cookie Manager - CRUD operations for browser cookies.
 *
 * Features:
 * - Security-first defaults (Secure, SameSite=Strict)
 * - Validation of names and values
 * - Result-based error handling option
 * - Warning for insecure cookies on HTTPS
 *
 * @example
 * ```TypeScript
 * // Set a cookie
 * CookieManager.set('theme', 'dark', CookieOptions.persistent('theme', 30));
 *
 * // Get a cookie
 * const theme = CookieManager.get('theme'); // 'dark' | null
 *
 * // Check if cookie exists
 * if (CookieManager.has('theme')) {
 *   // ...
 * }
 *
 * // Remove a cookie
 * CookieManager.remove('theme');
 *
 * // Get all cookies
 * const all = CookieManager.all(); // { theme: 'dark', ... }
 * ```
 */
import { Result, Validator, ValidationError, CookieError } from '../core/index.js';
import { CookieOptions, type CookieOptionsInput } from './CookieOptions.js';

export const CookieManager = {
  // =========================================================================
  // CRUD Operations
  // =========================================================================

  /**
   * Set a cookie.
   * @param name Cookie name
   * @param value Cookie value
   * @param options Cookie options (uses secure defaults if not provided)
   * @throws {ValidationError} If name or value is invalid
   * @throws {CookieError} If cookies are disabled
   */
  set(name: string, value: string, options?: CookieOptions | CookieOptionsInput): void {
    Validator.cookieName(name);
    Validator.cookieValue(value);

    if (!CookieManager.isEnabled()) {
      throw CookieError.disabled();
    }

    const opts =
      options instanceof CookieOptions ? options : CookieOptions.create(options ?? { name });

    // Warn if setting insecure cookie on HTTPS
    if (!opts.secure && typeof window !== 'undefined' && window.location.protocol === 'https:') {
      console.warn('[CookieManager] Setting insecure cookie on HTTPS. Consider using Secure flag.');
    }

    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; ${opts.toAttributeString()}`;
  },

  /**
   * Set a cookie with Result (no exceptions).
   */
  setResult(
    name: string,
    value: string,
    options?: CookieOptions | CookieOptionsInput
  ): Result<void, ValidationError | CookieError> {
    const nameResult = Validator.cookieNameResult(name);
    if (Result.isErr(nameResult)) {
      return nameResult;
    }

    const valueResult = Validator.cookieValueResult(value);
    if (Result.isErr(valueResult)) {
      return valueResult;
    }

    if (!CookieManager.isEnabled()) {
      return Result.err(CookieError.disabled());
    }

    const opts =
      options instanceof CookieOptions ? options : CookieOptions.create(options ?? { name });

    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; ${opts.toAttributeString()}`;

    return Result.ok(undefined);
  },

  /**
   * Get a cookie value.
   * @param name Cookie name
   * @returns Cookie value or null if not found
   * @throws {ValidationError} If name is invalid
   */
  get(name: string): string | null {
    Validator.cookieName(name);
    return CookieManager.findCookie(name);
  },

  /**
   * Get a cookie value with Result (no exceptions).
   */
  getResult(name: string): Result<string | null, ValidationError> {
    const nameResult = Validator.cookieNameResult(name);
    if (Result.isErr(nameResult)) {
      return nameResult;
    }

    return Result.ok(CookieManager.findCookie(name));
  },

  /**
   * Check if a cookie exists.
   * @param name Cookie name
   * @throws {ValidationError} If name is invalid
   */
  has(name: string): boolean {
    Validator.cookieName(name);
    return CookieManager.findCookie(name) !== null;
  },

  /**
   * Remove a cookie.
   * @param name Cookie name
   * @param options Options with path/domain matching the original cookie
   * @throws {ValidationError} If name is invalid
   */
  remove(name: string, options?: Pick<CookieOptionsInput, 'path' | 'domain'>): void {
    Validator.cookieName(name);

    const path = options?.path ?? '/';
    const domain = options?.domain;

    let cookieString = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}`;

    if (domain !== undefined) {
      cookieString += `; domain=${domain}`;
    }

    document.cookie = cookieString;
  },

  /**
   * Get all cookies as a record.
   */
  all(): Record<string, string> {
    const cookies: Record<string, string> = {};

    if (typeof document === 'undefined' || !document.cookie) {
      return cookies;
    }

    const pairs = document.cookie.split(';');

    for (const pair of pairs) {
      const trimmed = pair.trim();
      if (!trimmed) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;

      const name = decodeURIComponent(trimmed.substring(0, eqIndex));
      cookies[name] = decodeURIComponent(trimmed.substring(eqIndex + 1));
    }

    return cookies;
  },

  /**
   * Get all cookie names.
   */
  keys(): string[] {
    return Object.keys(CookieManager.all());
  },

  /**
   * Clear all cookies (for the current path).
   * Note: Can only clear cookies accessible to JavaScript (not HttpOnly).
   * @param options Options with path to clear cookies for
   */
  clear(options?: Pick<CookieOptionsInput, 'path' | 'domain'>): void {
    const names = CookieManager.keys();
    for (const name of names) {
      CookieManager.remove(name, options);
    }
  },

  // =========================================================================
  // Utility Methods
  // =========================================================================

  /**
   * Check if cookies are enabled in the browser.
   */
  isEnabled(): boolean {
    if (typeof document === 'undefined') {
      return false;
    }

    // Try to set a test cookie
    const testName = '__cookie_test__';
    const testValue = 'test';

    try {
      document.cookie = `${testName}=${testValue}`;
      const enabled = document.cookie.includes(testName);
      // Clean up test cookie
      document.cookie = `${testName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      return enabled;
    } catch {
      return false;
    }
  },

  // =========================================================================
  // Internal
  // =========================================================================

  /**
   * Find a cookie by name in document.cookie.
   */
  findCookie(name: string): string | null {
    if (typeof document === 'undefined' || !document.cookie) {
      return null;
    }

    const encodedName = encodeURIComponent(name);
    const pairs = document.cookie.split(';');

    for (const pair of pairs) {
      const trimmed = pair.trim();
      const eqIndex = trimmed.indexOf('=');

      if (eqIndex === -1) continue;

      const cookieName = trimmed.substring(0, eqIndex);
      if (cookieName === encodedName) {
        return decodeURIComponent(trimmed.substring(eqIndex + 1));
      }
    }

    return null;
  },
};
