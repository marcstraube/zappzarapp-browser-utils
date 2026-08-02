/**
 * Retry-After header parsing (RFC 9110, Section 10.2.3).
 *
 * Supports both header formats:
 * - delta-seconds: `Retry-After: 120`
 * - HTTP-date: `Retry-After: Fri, 31 Dec 1999 23:59:59 GMT`
 *
 * @example
 * ```TypeScript
 * const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'));
 * if (retryAfterMs !== null) {
 *   await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
 * }
 * ```
 */

/**
 * Parse a `Retry-After` header value into a delay in milliseconds.
 *
 * @param value Raw header value (or null when the header is absent)
 * @returns Delay in milliseconds (>= 0), or null when the value is absent or invalid.
 *          An HTTP-date in the past yields 0 (retry immediately).
 */
export function parseRetryAfter(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }

  // delta-seconds: non-negative integer
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }

  // HTTP-date - every valid format contains letters (month name, "GMT").
  // Reject letter-free garbage like "1.5" or "-5" that Date.parse would
  // otherwise leniently interpret as a date.
  if (!/[a-z]/i.test(trimmed)) {
    return null;
  }

  const timestamp = Date.parse(trimmed);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.max(0, timestamp - Date.now());
}
