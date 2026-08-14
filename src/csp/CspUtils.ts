/**
 * CSP (Content Security Policy) Utilities.
 *
 * Provides utilities for working with Content Security Policy in browsers.
 * Helps detect CSP restrictions and work within them safely.
 *
 * @example
 * ```TypeScript
 * // Check if inline scripts are allowed
 * if (CspUtils.allowsInlineScript()) {
 *   // Use inline script
 * } else {
 *   // Use external script or nonce
 * }
 *
 * // Check if eval is allowed
 * if (CspUtils.allowsEval()) {
 *   // Use eval (not recommended)
 * } else {
 *   // Use alternative approach
 * }
 *
 * // Generate nonce for CSP headers
 * const nonce = CspUtils.generateNonce();
 * ```
 */
import { CryptoError } from '../core/index.js';

/**
 * CSP directive names.
 */
export type CspDirective =
  | 'default-src'
  | 'script-src'
  | 'style-src'
  | 'img-src'
  | 'connect-src'
  | 'font-src'
  | 'object-src'
  | 'media-src'
  | 'frame-src'
  | 'sandbox'
  | 'report-uri'
  | 'child-src'
  | 'form-action'
  | 'frame-ancestors'
  | 'plugin-types'
  | 'base-uri'
  | 'report-to'
  | 'worker-src'
  | 'manifest-src'
  | 'prefetch-src'
  | 'navigate-to'
  | 'script-src-elem'
  | 'script-src-attr'
  | 'style-src-elem'
  | 'style-src-attr';

/**
 * CSP violation event detail.
 */
export interface CspViolationDetail {
  /** The directive that was violated */
  readonly violatedDirective: string;
  /** The effective directive (may differ from violatedDirective) */
  readonly effectiveDirective: string;
  /** The blocked URI */
  readonly blockedUri: string;
  /** The document URI where violation occurred */
  readonly documentUri: string;
  /** The original policy */
  readonly originalPolicy: string;
  /** The sample of the violating code (if available) */
  readonly sample?: string;
  /** Line number where violation occurred */
  readonly lineNumber?: number;
  /** Column number where violation occurred */
  readonly columnNumber?: number;
  /** The source file where violation occurred */
  readonly sourceFile?: string;
}

/**
 * CSP violation handler function.
 */
export type CspViolationHandler = (detail: CspViolationDetail) => void;

/**
 * Check if wildcard source allows the URL.
 */
function checkWildcardSource(url: string, sources: string[]): boolean {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.startsWith('data:') || lowerUrl.startsWith('blob:')) {
    return sources.includes('data:') || sources.includes('blob:');
  }
  return true;
}

/**
 * Check if a single CSP source matches the URL.
 */
function isSourceMatch(source: string, urlObj: URL, selfOrigin: string): boolean {
  // Check 'self' keyword
  if (source === "'self'") {
    return urlObj.origin === selfOrigin;
  }

  // Check data: and blob: schemes
  if (source === 'data:' && urlObj.protocol === 'data:') {
    return true;
  }
  if (source === 'blob:' && urlObj.protocol === 'blob:') {
    return true;
  }

  // Check scheme-source (e.g., "https:")
  if (source.endsWith(':') && !source.includes('/')) {
    return urlObj.protocol === source;
  }

  // Check host-source
  return isHostSourceMatch(source, urlObj);
}

/**
 * Check if a host-source matches the URL.
 */
function isHostSourceMatch(source: string, urlObj: URL): boolean {
  // Handle wildcards in host-source (e.g., "*.example.com")
  if (source.startsWith('*.')) {
    const sourceHost = source.slice(2);
    return urlObj.hostname.endsWith('.' + sourceHost) || urlObj.hostname === sourceHost;
  }

  // Exact or prefix match
  const sourceUrl = source.includes('://') ? source : `https://${source}`;
  try {
    const sourceObj = new URL(sourceUrl);
    if (urlObj.hostname === sourceObj.hostname) {
      return sourceObj.pathname === '/' || urlObj.pathname.startsWith(sourceObj.pathname);
    }
  } catch {
    // Invalid source
  }
  return false;
}

/**
 * Cache for CSP detection results.
 */
type CspCacheKey = 'inlineScriptAllowed' | 'evalAllowed' | 'inlineStyleAllowed';

const cspCache = new Map<CspCacheKey, boolean>();

export const CspUtils = {
  /**
   * Check if inline scripts are allowed by CSP.
   *
   * Tests by attempting to create and execute an inline script.
   * Results are cached for performance.
   */
  allowsInlineScript(): boolean {
    if (cspCache.has('inlineScriptAllowed')) {
      return cspCache.get('inlineScriptAllowed')!;
    }

    if (typeof document === 'undefined') {
      cspCache.set('inlineScriptAllowed', false);
      return false;
    }

    try {
      // Try to create and execute an inline script
      const script = document.createElement('script');
      const testKey = '__csp_inline_test__' + Date.now();
      script.textContent = `window.${testKey}=true`;

      document.head.appendChild(script);
      document.head.removeChild(script);

      // Check if the script executed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- Dynamic window property access for CSP inline-script test
      const result = (window as any)[testKey] === true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- Cleanup dynamic test property from window
      delete (window as any)[testKey];

      cspCache.set('inlineScriptAllowed', result);
      return result;
    } catch {
      cspCache.set('inlineScriptAllowed', false);
      return false;
    }
  },

  /**
   * Check if eval() and new Function() are allowed by CSP.
   *
   * Tests by attempting to use eval. Results are cached.
   */
  allowsEval(): boolean {
    if (cspCache.has('evalAllowed')) {
      return cspCache.get('evalAllowed')!;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval -- Intentionally testing if CSP allows Function constructor
      const fn = new Function('return true');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- Function constructor returns untyped callable; intentional for CSP eval test
      const result = fn() === true;
      cspCache.set('evalAllowed', result);
      return result;
    } catch {
      cspCache.set('evalAllowed', false);
      return false;
    }
  },

  /**
   * Check if inline styles are allowed by CSP.
   *
   * Tests by attempting to apply an inline style.
   * Results are cached for performance.
   */
  allowsInlineStyle(): boolean {
    if (cspCache.has('inlineStyleAllowed')) {
      return cspCache.get('inlineStyleAllowed')!;
    }

    if (typeof document === 'undefined') {
      cspCache.set('inlineStyleAllowed', false);
      return false;
    }

    try {
      // Try to create and apply an inline style
      const style = document.createElement('style');
      const testClass = '__csp_style_test__' + Date.now();
      style.textContent = `.${testClass} { display: block !important; }`;

      document.head.appendChild(style);

      // Create test element
      const testEl = document.createElement('div');
      testEl.className = testClass;
      testEl.style.display = 'none';
      document.body.appendChild(testEl);

      // Check if style was applied
      const computed = window.getComputedStyle(testEl);
      const result = computed.display === 'block';

      // Cleanup
      document.head.removeChild(style);
      document.body.removeChild(testEl);

      cspCache.set('inlineStyleAllowed', result);
      return result;
    } catch {
      cspCache.set('inlineStyleAllowed', false);
      return false;
    }
  },

  /**
   * Clear the CSP detection cache.
   *
   * Useful for testing or when CSP may have changed.
   *
   * @example Reset cache in tests
   * ```TypeScript
   * beforeEach(() => {
   *   CspUtils.clearCache();
   * });
   *
   * test('detects CSP restrictions', () => {
   *   // Fresh detection on each test
   *   expect(CspUtils.allowsInlineScript()).toBe(false);
   * });
   * ```
   */
  clearCache(): void {
    cspCache.clear();
  },

  /**
   * Generate a cryptographically secure nonce.
   *
   * Can be used for script-src 'nonce-xxx' CSP directives.
   *
   * @param length Length in bytes (default 16, produces 22 chars base64)
   * @returns Base64-encoded nonce string
   *
   * @example Add nonce to inline script
   * ```TypeScript
   * const nonce = CspUtils.generateNonce();
   * const script = document.createElement('script');
   * script.nonce = nonce;
   * script.textContent = 'console.log("Hello")';
   * document.head.appendChild(script);
   * // CSP header should include: script-src 'nonce-${nonce}'
   * ```
   *
   * @example Server-side nonce generation
   * ```TypeScript
   * // Generate nonce for each request
   * const nonce = CspUtils.generateNonce(32);
   *
   * // Set CSP header
   * res.setHeader('Content-Security-Policy',
   *   `script-src 'nonce-${nonce}'`
   * );
   *
   * // Include nonce in HTML template
   * res.send(`<script nonce="${nonce}">...</script>`);
   * ```
   */
  generateNonce(length = 16): string {
    // Check for crypto availability (may be undefined in non-browser environments)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- Runtime check for non-browser environments
    if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
      throw CryptoError.unavailable();
    }

    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);

    // Convert to base64 using Array.from for type safety
    const binary = Array.from(bytes)
      .map((byte) => String.fromCharCode(byte))
      .join('');

    return btoa(binary);
  },

  /**
   * Calculate a SHA-256 hash for use with integrity attributes.
   *
   * Can be used for script-src 'sha256-xxx' CSP directives.
   *
   * @param content The content to hash
   * @returns Promise resolving to base64-encoded hash, or undefined if unavailable
   *
   * @example Generate hash for inline script
   * ```TypeScript
   * const scriptContent = 'console.log("Hello")';
   * const hash = await CspUtils.calculateHash(scriptContent);
   *
   * if (hash) {
   *   // CSP header: script-src 'sha256-xxxxx...'
   *   console.log(`Add to CSP: '${hash}'`);
   * }
   * ```
   *
   * @example Subresource integrity for external scripts
   * ```TypeScript
   * const response = await fetch('https://cdn.example.com/lib.js');
   * const content = await response.text();
   * const hash = await CspUtils.calculateHash(content);
   *
   * const script = document.createElement('script');
   * script.src = 'https://cdn.example.com/lib.js';
   * script.integrity = hash ?? '';
   * script.crossOrigin = 'anonymous';
   * document.head.appendChild(script);
   * ```
   */
  async calculateHash(content: string): Promise<string | undefined> {
    // Check for crypto availability (may be undefined in non-browser environments)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- Runtime check for non-browser environments
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      return undefined;
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(content);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = new Uint8Array(hashBuffer);

      // Convert to base64 using Array.from for type safety
      const binary = Array.from(hashArray)
        .map((byte) => String.fromCharCode(byte))
        .join('');

      return 'sha256-' + btoa(binary);
    } catch {
      return undefined;
    }
  },

  /**
   * Register a handler for CSP violations.
   *
   * @param handler Function to call when a CSP violation occurs
   * @returns Cleanup function to unregister the handler
   *
   * @example Log violations to console
   * ```TypeScript
   * const cleanup = CspUtils.onViolation((detail) => {
   *   console.warn('CSP Violation:', {
   *     directive: detail.violatedDirective,
   *     blockedUri: detail.blockedUri,
   *     sourceFile: detail.sourceFile,
   *     lineNumber: detail.lineNumber,
   *   });
   * });
   *
   * // Later: stop monitoring
   * cleanup();
   * ```
   *
   * @example Report violations to analytics
   * ```TypeScript
   * CspUtils.onViolation((detail) => {
   *   analytics.track('csp_violation', {
   *     directive: detail.effectiveDirective,
   *     blockedUri: detail.blockedUri,
   *     documentUri: detail.documentUri,
   *   });
   * });
   * ```
   *
   * @example Detect third-party script injection attempts
   * ```TypeScript
   * CspUtils.onViolation((detail) => {
   *   if (detail.effectiveDirective === 'script-src') {
   *     securityLogger.warn('Blocked script injection', {
   *       uri: detail.blockedUri,
   *       sample: detail.sample,
   *     });
   *   }
   * });
   * ```
   */
  onViolation(handler: CspViolationHandler): () => void {
    if (typeof document === 'undefined') {
      return () => {};
    }

    const listener = (event: SecurityPolicyViolationEvent): void => {
      handler({
        violatedDirective: event.violatedDirective,
        effectiveDirective: event.effectiveDirective,
        blockedUri: event.blockedURI,
        documentUri: event.documentURI,
        originalPolicy: event.originalPolicy,
        sample: event.sample || undefined,
        lineNumber: event.lineNumber || undefined,
        columnNumber: event.columnNumber || undefined,
        sourceFile: event.sourceFile || undefined,
      });
    };

    document.addEventListener('securitypolicyviolation', listener);

    return (): void => {
      document.removeEventListener('securitypolicyviolation', listener);
    };
  },

  /**
   * Check if a URL is allowed by a specific CSP directive.
   *
   * This is a heuristic check - the browser makes the final determination.
   *
   * @param url URL to check
   * @param selfOrigin The document's origin (for 'self' keyword)
   * @param directiveValue The CSP directive value to check against
   * @returns True if the URL appears to be allowed
   *
   * @example Check if image source is allowed
   * ```TypeScript
   * const imgSrcPolicy = "'self' https://cdn.example.com";
   * const origin = window.location.origin;
   *
   * // Check internal image
   * CspUtils.isUrlAllowedByDirective('/images/logo.png', origin, imgSrcPolicy);
   * // Returns: true
   *
   * // Check CDN image
   * CspUtils.isUrlAllowedByDirective('https://cdn.example.com/img.jpg', origin, imgSrcPolicy);
   * // Returns: true
   *
   * // Check unknown source
   * CspUtils.isUrlAllowedByDirective('https://evil.com/img.jpg', origin, imgSrcPolicy);
   * // Returns: false
   * ```
   *
   * @example Validate before loading external resource
   * ```TypeScript
   * async function loadScript(url: string): Promise<void> {
   *   const scriptPolicy = "'self' https://trusted-cdn.com";
   *
   *   if (!CspUtils.isUrlAllowedByDirective(url, location.origin, scriptPolicy)) {
   *     console.warn('Script blocked by CSP:', url);
   *     return;
   *   }
   *
   *   const script = document.createElement('script');
   *   script.src = url;
   *   document.head.appendChild(script);
   * }
   * ```
   */
  isUrlAllowedByDirective(url: string, selfOrigin: string, directiveValue: string): boolean {
    const sources = directiveValue.split(/\s+/).filter(Boolean);

    if (sources.includes("'none'")) {
      return false;
    }

    if (sources.includes('*')) {
      return checkWildcardSource(url, sources);
    }

    try {
      const urlObj = new URL(url, selfOrigin);
      return sources.some((source) => isSourceMatch(source, urlObj, selfOrigin));
    } catch {
      return false;
    }
  },
};
