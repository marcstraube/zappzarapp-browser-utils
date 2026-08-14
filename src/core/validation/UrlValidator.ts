/**
 * URL Validation.
 *
 * Validates URLs for safety using protocol allowlist (Defense-in-Depth).
 *
 * @internal
 */
import { ValidationError } from '../errors/ValidationError.js';
import { Result } from '../result/Result.js';

/**
 * Safe URL protocols that are explicitly allowed.
 * Uses allowlist approach for security (Defense-in-Depth).
 */
const DEFAULT_SAFE_PROTOCOLS: readonly string[] = [
  'http',
  'https',
  'ws',
  'wss',
  'mailto',
  'ftp',
  'ftps',
] as const;

/**
 * Options for URL validation.
 */
export interface UrlValidationOptions {
  /**
   * Additional protocols to allow beyond the default safe protocols.
   * Examples: 'tel', 'sms', 'geo'
   */
  readonly additionalProtocols?: readonly string[];
}

/**
 * Build regex pattern for allowed protocols.
 * @param options - Optional validation options
 * @returns RegExp pattern matching allowed protocols
 */
function buildProtocolPattern(options?: UrlValidationOptions): RegExp {
  const protocols = [...DEFAULT_SAFE_PROTOCOLS];

  if (options?.additionalProtocols) {
    for (const protocol of options.additionalProtocols) {
      // Validate protocol format (alphanumeric, plus, dot, hyphen only per RFC 3986)
      if (/^[a-z][a-z0-9+.-]*$/i.test(protocol)) {
        protocols.push(protocol.toLowerCase());
      }
    }
  }

  // Escape special regex characters and join with |
  const escaped = protocols.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // eslint-disable-next-line security/detect-non-literal-regexp -- Safe: protocols are validated above (alphanumeric + limited special chars only)
  return new RegExp(`^(?:${escaped.join('|')}):`, 'i');
}

/**
 * Default pattern for safe protocols.
 */
const DEFAULT_SAFE_PATTERN = buildProtocolPattern();

export const UrlValidator = {
  /**
   * Default safe protocols that are allowed.
   */
  DEFAULT_SAFE_PROTOCOLS,

  /**
   * Validate URL uses a safe protocol (allowlist approach).
   * @param url - The URL to validate
   * @param options - Optional validation options for custom protocols
   * @throws {ValidationError} If URL uses a non-allowed protocol
   */
  urlSafe(url: string, options?: UrlValidationOptions): void {
    const result = UrlValidator.urlSafeResult(url, options);
    if (Result.isErr(result)) {
      throw result.error;
    }
  },

  /**
   * Validate URL uses a safe protocol and return Result.
   * @param url - The URL to validate
   * @param options - Optional validation options for custom protocols
   */
  urlSafeResult(url: string, options?: UrlValidationOptions): Result<string, ValidationError> {
    if (!url) {
      return Result.err(ValidationError.empty('url'));
    }

    // Check for protocol presence
    const colonIndex = url.indexOf(':');
    if (colonIndex === -1) {
      // No protocol - could be relative URL, consider safe
      return Result.ok(url);
    }

    // Build pattern based on options
    const pattern = options?.additionalProtocols
      ? buildProtocolPattern(options)
      : DEFAULT_SAFE_PATTERN;

    if (!pattern.test(url)) {
      const allowedList = options?.additionalProtocols
        ? [...DEFAULT_SAFE_PROTOCOLS, ...options.additionalProtocols].join(', ')
        : DEFAULT_SAFE_PROTOCOLS.join(', ');

      return Result.err(
        ValidationError.invalidFormat('url', url, `allowed protocol (${allowedList})`)
      );
    }

    return Result.ok(url);
  },
};
