/**
 * HTML Sanitizer - Safe HTML sanitization utilities.
 *
 * Provides HTML sanitization with optional DOMPurify integration.
 * Falls back to basic escaping when DOMPurify is not available.
 *
 * **API Pattern:** Stateless utility object with static methods (no instantiation needed).
 *
 * **Recommended Usage:**
 * - Use `escape()` for untrusted user input that should not contain HTML
 * - Use `sanitize()` with DOMPurify for rich text that needs safe HTML rendering
 * - Always call `setDOMPurify()` at app startup if you need rich sanitization
 *
 * @example
 * ```TypeScript
 * // Basic sanitization (escapes all HTML)
 * const safe = HtmlSanitizer.escape('<script>alert("xss")</script>');
 * // Result: '&lt;script&gt;alert("xss")&lt;/script&gt;'
 *
 * // Rich sanitization (if DOMPurify is available)
 * const rich = HtmlSanitizer.sanitize('<b>Bold</b><script>bad</script>');
 * // Result: '<b>Bold</b>' (script removed, b preserved)
 *
 * // Check if DOMPurify is available
 * if (HtmlSanitizer.isDOMPurifyAvailable()) {
 *   // Use rich sanitization
 * }
 * ```
 */

/**
 * DOMPurify-compatible interface.
 * This allows using DOMPurify when available without requiring it as a dependency.
 */
interface DOMPurifyInterface {
  sanitize(dirty: string, config?: DOMPurifyConfig): string;
  addHook(
    hookName:
      | 'beforeSanitizeElements'
      | 'afterSanitizeElements'
      | 'beforeSanitizeAttributes'
      | 'afterSanitizeAttributes'
      | 'uponSanitizeElement'
      | 'uponSanitizeAttribute',
    callback: (node: Node, data: unknown, config: unknown) => void
  ): void;
  removeHook(hookName: string): void;
  removeAllHooks(): void;
}

/**
 * DOMPurify configuration options.
 */
export interface DOMPurifyConfig {
  /** Allowed HTML tags */
  readonly ALLOWED_TAGS?: readonly string[];
  /** Allowed HTML attributes */
  readonly ALLOWED_ATTR?: readonly string[];
  /** Forbid specific tags */
  readonly FORBID_TAGS?: readonly string[];
  /** Forbid specific attributes */
  readonly FORBID_ATTR?: readonly string[];
  /** Allow data: URIs */
  readonly ALLOW_DATA_ATTR?: boolean;
  /** Add custom allowed URI schemes */
  readonly ADD_URI_SAFE_ATTR?: readonly string[];
  /** Return DOM instead of string */
  readonly RETURN_DOM?: boolean;
  /** Return DocumentFragment */
  readonly RETURN_DOM_FRAGMENT?: boolean;
  /** Whole document mode */
  readonly WHOLE_DOCUMENT?: boolean;
  /** Keep content of removed elements */
  readonly KEEP_CONTENT?: boolean;
  /** Allow self-close in HTML */
  readonly SELF_CLOSE_IN_HTML?: boolean;
  /** Force body */
  readonly FORCE_BODY?: boolean;
  /** Allow <style> tags */
  readonly ALLOW_STYLE?: boolean;
}

/**
 * Sanitizer configuration options.
 */
export interface SanitizerOptions {
  /**
   * Allowed HTML tags.
   * Only used when DOMPurify is available.
   * @default Common safe tags (p, br, b, i, u, a, ul, ol, li, etc.)
   */
  readonly allowedTags?: readonly string[];

  /**
   * Allowed HTML attributes.
   * Only used when DOMPurify is available.
   * @default ['href', 'src', 'alt', 'title', 'class', 'id']
   */
  readonly allowedAttributes?: readonly string[];

  /**
   * Allow data: URIs in src/href.
   * @default false (security risk)
   */
  readonly allowDataUrls?: boolean;

  /**
   * Strip all HTML and return plain text.
   * @default false
   */
  readonly stripAll?: boolean;
}

/**
 * Default allowed tags (safe subset).
 */
const DEFAULT_ALLOWED_TAGS = [
  'p',
  'br',
  'hr',
  'b',
  'i',
  'u',
  's',
  'strong',
  'em',
  'mark',
  'small',
  'del',
  'ins',
  'sub',
  'sup',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'a',
  'img',
  'blockquote',
  'pre',
  'code',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'div',
  'span',
] as const;

/**
 * Default allowed attributes.
 */
const DEFAULT_ALLOWED_ATTRS = [
  'href',
  'src',
  'alt',
  'title',
  'class',
  'id',
  'target',
  'rel',
] as const;

/**
 * HTML entity map for escaping.
 */
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Reverse entity map for unescaping.
 */
const REVERSE_ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&apos;': "'",
};

/**
 * Global DOMPurify instance (set via setDOMPurify).
 */
let domPurifyInstance: DOMPurifyInterface | null = null;

export const HtmlSanitizer = {
  // =========================================================================
  // DOMPurify Integration
  // =========================================================================

  /**
   * Check if DOMPurify is available.
   */
  isDOMPurifyAvailable(): boolean {
    return domPurifyInstance !== null;
  },

  /**
   * Set the DOMPurify instance to use.
   * Call this at application startup if you want rich sanitization.
   *
   * @example
   * ```TypeScript
   * import DOMPurify from 'dompurify';
   * HtmlSanitizer.setDOMPurify(DOMPurify);
   * ```
   */
  setDOMPurify(instance: DOMPurifyInterface): void {
    domPurifyInstance = instance;
  },

  /**
   * Clear the DOMPurify instance.
   */
  clearDOMPurify(): void {
    domPurifyInstance = null;
  },

  // =========================================================================
  // Core Sanitization
  // =========================================================================

  /**
   * Escape HTML special characters.
   * Always safe - converts all HTML to entities.
   *
   * @param html Raw HTML string
   * @returns Escaped string safe for insertion into HTML
   */
  escape(html: string): string {
    if (!html) return '';
    return html.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char] ?? char);
  },

  /**
   * Unescape HTML entities back to characters.
   *
   * @param escaped Escaped HTML string
   * @returns Unescaped string
   */
  unescape(escaped: string): string {
    if (!escaped) return '';
    return escaped.replace(
      /&(?:amp|lt|gt|quot|#39|#x27|apos);/g,
      (entity) => REVERSE_ENTITIES[entity] ?? entity
    );
  },

  /**
   * Sanitize HTML allowing safe tags.
   *
   * If DOMPurify is available, uses it for rich sanitization.
   * Otherwise, falls back to escaping all HTML.
   *
   * @param html Raw HTML string
   * @param options Sanitization options
   * @returns Sanitized HTML string
   */
  sanitize(html: string, options: SanitizerOptions = {}): string {
    if (!html) return '';

    // Strip all HTML if requested
    if (options.stripAll === true) {
      return HtmlSanitizer.stripTags(html);
    }

    // Use DOMPurify if available
    if (domPurifyInstance) {
      const config: DOMPurifyConfig = {
        ALLOWED_TAGS: options.allowedTags ?? [...DEFAULT_ALLOWED_TAGS],
        ALLOWED_ATTR: options.allowedAttributes ?? [...DEFAULT_ALLOWED_ATTRS],
        ALLOW_DATA_ATTR: options.allowDataUrls ?? false,
      };

      return domPurifyInstance.sanitize(html, config);
    }

    // Fallback: escape everything
    return HtmlSanitizer.escape(html);
  },

  /**
   * Strip all HTML tags and return plain text.
   *
   * @param html HTML string
   * @returns Plain text without HTML tags
   */
  stripTags(html: string): string {
    if (!html) return '';

    // Use DOM parser if available (browser)
    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return doc.body.textContent;
    }

    // Fail-secure: DOMParser is required for safe HTML processing
    throw new Error(
      'DOMParser is not available. HTML sanitization requires a browser environment or a DOM polyfill (e.g., happy-dom, jsdom).'
    );
  },

  // =========================================================================
  // Attribute Sanitization
  // =========================================================================

  /**
   * Sanitize an attribute value for safe insertion.
   *
   * @param value Attribute value
   * @returns Escaped attribute value
   */
  escapeAttribute(value: string): string {
    if (!value) return '';
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  /**
   * Check if a URL is safe for use in href/src attributes.
   *
   * @param url URL to check
   * @param allowData Allow data: URLs
   * @returns True if URL is safe
   */
  isSafeUrl(url: string, allowData = false): boolean {
    if (!url) return false;

    const trimmed = url.trim().toLowerCase();

    // Block javascript: and vbscript:
    if (trimmed.startsWith('javascript:') || trimmed.startsWith('vbscript:')) {
      return false;
    }

    // Block data: unless explicitly allowed
    return !trimmed.startsWith('data:') || allowData;
  },

  /**
   * Sanitize a URL for safe use in href/src.
   *
   * @param url URL to sanitize
   * @param fallback Fallback URL if unsafe
   * @returns Safe URL or fallback
   */
  sanitizeUrl(url: string, fallback = '#'): string {
    return HtmlSanitizer.isSafeUrl(url) ? url : fallback;
  },

  // =========================================================================
  // Convenience Methods
  // =========================================================================

  /**
   * Create a text node from potentially unsafe content.
   * Safest way to insert user content into the DOM.
   *
   * @param text Text content
   * @returns Text node
   */
  createTextNode(text: string): Text {
    return document.createTextNode(text);
  },

  /**
   * Set text content of an element safely.
   *
   * @param element Target element
   * @param text Text content
   */
  setTextContent(element: Element, text: string): void {
    element.textContent = text;
  },

  /**
   * Set HTML content of an element with sanitization.
   *
   * WARNING: Only use this when you need to render HTML.
   * Prefer setTextContent for plain text.
   *
   * **Security Note:** The use of `innerHTML` is safe here because `sanitize()` acts as a
   * mandatory gate that removes all potentially dangerous content before assignment. The HTML
   * is either processed through DOMPurify (if available) to allow only safe tags/attributes,
   * or escaped entirely as a fallback. This ensures no script execution or XSS vectors remain.
   *
   * CSP nonce handling is intentionally omitted from this client-side utility. Inline script
   * nonces must be generated server-side (e.g., via `@zappzarapp/php-security`) and injected
   * into the HTML response headers and inline scripts. Client-side nonce generation would
   * provide no security benefit as CSP policies are enforced by the browser based on the
   * server-provided nonce.
   *
   * @param element Target element
   * @param html HTML content
   * @param options Sanitization options
   */
  setHtmlContent(element: Element, html: string, options?: SanitizerOptions): void {
    element.innerHTML = HtmlSanitizer.sanitize(html, options);
  },
};
