/**
 * Request URL validation and security utilities.
 * Internal module for URL validation, SSRF protection, and input validation.
 */

import { RequestError } from './RequestInterceptor.js';

/**
 * Check if a hostname is an IPv4 address in a private range.
 */
function isPrivateIPv4(hostname: string): boolean {
  // Match IPv4 address pattern
  const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = ipv4Pattern.exec(hostname);
  if (!match) return false;

  // Extract octets - match groups are guaranteed to exist due to regex
  const octet1 = match[1];
  const octet2 = match[2];
  const octet3 = match[3];
  const octet4 = match[4];

  // Type guard: verify all groups exist
  /* v8 ignore start -- regex match guarantees all four capture groups exist */
  if (
    octet1 === undefined ||
    octet2 === undefined ||
    octet3 === undefined ||
    octet4 === undefined
  ) {
    return false;
  }
  /* v8 ignore stop */

  const octets = [
    parseInt(octet1, 10),
    parseInt(octet2, 10),
    parseInt(octet3, 10),
    parseInt(octet4, 10),
  ];

  // Validate octets are in range 0-255
  /* v8 ignore start -- URL parsing rejects octets > 255 before this point */
  if (octets.some((octet) => octet > 255)) {
    return false;
  }
  /* v8 ignore stop */

  const first = octets[0];
  const second = octets[1];

  // Type guard: verify octets exist
  /* v8 ignore start */
  if (first === undefined || second === undefined) {
    return false;
  }
  /* v8 ignore stop */

  // 127.0.0.0/8 - Loopback
  if (first === 127) return true;

  // 0.0.0.0/8 - Unspecified
  if (first === 0) return true;

  // 10.0.0.0/8 - Private
  if (first === 10) return true;

  // 172.16.0.0/12 - Private (172.16.0.0 - 172.31.255.255)
  if (first === 172 && second >= 16 && second <= 31) return true;

  // 192.168.0.0/16 - Private
  if (first === 192 && second === 168) return true;

  // 169.254.0.0/16 - Link-local
  return first === 169 && second === 254;
}

/**
 * Check if a hostname is an IPv6 address in a private range.
 */
function isPrivateIPv6(hostname: string): boolean {
  // Remove brackets if present (e.g., [::1])
  const cleaned = hostname.replace(/^\[|]$/g, '');

  // Normalize IPv6 address for easier checking
  const lower = cleaned.toLowerCase();

  // ::1 - Loopback
  if (
    lower === '::1' ||
    lower === '0:0:0:0:0:0:0:1' ||
    lower === '0000:0000:0000:0000:0000:0000:0000:0001'
  ) {
    return true;
  }

  // :: - Unspecified
  if (
    lower === '::' ||
    lower === '0:0:0:0:0:0:0:0' ||
    lower === '0000:0000:0000:0000:0000:0000:0000:0000'
  ) {
    return true;
  }

  // fc00::/7 - Unique local addresses (private)
  // Starts with fc or fd
  if (lower.startsWith('fc') || lower.startsWith('fd')) {
    return true;
  }

  // fe80::/10 - Link-local
  // Starts with fe8, fe9, fea, or feb
  return (
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb')
  );
}

/**
 * Check if a hostname is a private IP address.
 */
function isPrivateIP(hostname: string): boolean {
  return isPrivateIPv4(hostname) || isPrivateIPv6(hostname);
}

/**
 * Validate URL against allowed protocols and blocked patterns.
 */
export function validateUrl(
  url: string,
  allowedProtocols: readonly string[],
  blockedPatterns: readonly RegExp[],
  blockPrivateIPs: boolean
): void {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw RequestError.invalidUrl(url, 'malformed URL');
  }

  // Check protocol
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw RequestError.invalidUrl(url, `protocol "${parsed.protocol}" is not allowed`);
  }

  // Check blocked patterns
  for (const pattern of blockedPatterns) {
    if (pattern.test(url)) {
      throw RequestError.invalidUrl(url, 'URL matches blocked pattern');
    }
  }

  // Block dangerous protocols (defense in depth)
  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:'];
  if (dangerousProtocols.includes(parsed.protocol.toLowerCase())) {
    throw RequestError.invalidUrl(url, 'dangerous protocol');
  }

  // SSRF protection: block private IPs if enabled
  if (blockPrivateIPs) {
    const hostname = parsed.hostname;
    if (isPrivateIP(hostname)) {
      throw RequestError.ssrfBlocked(hostname);
    }
  }
}

/**
 * Validate credential origin safety.
 */
export function validateCredentialOrigin(
  url: string,
  baseUrl: string,
  hasAuth: boolean,
  validateOrigin: boolean
): void {
  if (!validateOrigin || !hasAuth || !baseUrl) return;

  const requestUrl = new URL(url);
  const baseUrlParsed = new URL(baseUrl);

  if (requestUrl.origin !== baseUrlParsed.origin) {
    throw RequestError.credentialLeak(
      `Attempted to send credentials to different origin: ${requestUrl.origin} (base: ${baseUrlParsed.origin})`
    );
  }
}

/**
 * Combine multiple AbortSignals into one.
 * Thin wrapper around `AbortSignal.any()`, kept as a stable public utility.
 * The signal dependency is platform-managed, so combining does not
 * accumulate listeners on long-lived source signals.
 */
export function combineAbortSignals(signal1: AbortSignal, signal2: AbortSignal): AbortSignal {
  return AbortSignal.any([signal1, signal2]);
}

/**
 * Extract base MIME type (type/subtype) from a Content-Type header,
 * stripping parameters like charset.
 */
function parseBaseContentType(contentType: string | null): string | null {
  if (contentType === null || contentType === '') {
    return null;
  }
  const semicolonIndex = contentType.indexOf(';');
  const base = semicolonIndex === -1 ? contentType : contentType.substring(0, semicolonIndex);
  const trimmed = base.trim().toLowerCase();
  return trimmed === '' ? null : trimmed;
}

/**
 * Validate response Content-Type header against expected types.
 * Fails closed: missing Content-Type with expectedContentType set throws.
 *
 * @param responseHeaders - Response headers
 * @param expectedContentType - Expected MIME type(s)
 * @throws {RequestError} If Content-Type does not match expected type(s)
 */
export function validateContentType(
  responseHeaders: Headers,
  expectedContentType: string | readonly string[]
): void {
  const rawContentType = responseHeaders.get('content-type');
  const actualBase = parseBaseContentType(rawContentType);

  const expected: readonly string[] = Array.isArray(expectedContentType)
    ? expectedContentType
    : [expectedContentType];

  const normalizedExpected = expected.map((t) => t.toLowerCase().trim());

  if (actualBase === null || !normalizedExpected.includes(actualBase)) {
    throw RequestError.contentTypeMismatch(expectedContentType, rawContentType);
  }
}
