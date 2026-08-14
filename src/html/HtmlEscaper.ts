/**
 * HTML Escaper - XSS Prevention Utilities.
 *
 * Provides secure HTML escaping to prevent Cross-Site Scripting (XSS) attacks.
 * Always escape untrusted content before inserting into HTML.
 *
 * Security: Defense in Depth
 * - Always escape user input
 * - Use textContent instead of innerHTML when possible
 * - Validate and sanitize at every boundary
 *
 * @example
 * ```TypeScript
 * // Escape user input
 * const safe = HtmlEscaper.escape(userInput);
 * element.innerHTML = `<span>${safe}</span>`;
 *
 * // Better: Use textContent (no escaping needed)
 * element.textContent = userInput;
 *
 * // Build safe HTML
 * const html = HtmlEscaper.tag('span', { class: 'highlight' }, userInput);
 * ```
 */

import { ValidationError } from '../core/index.js';

/**
 * HTML entity map for escaping.
 */
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;',
  '`': '&#x60;',
};

/**
 * Pattern matching characters that need escaping.
 */
const HTML_ESCAPE_PATTERN = /[&<>"'`]/g;

/**
 * Attribute name validation pattern.
 * Allows alphanumeric, hyphens, underscores, and data-* attributes.
 */
const SAFE_ATTR_NAME = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/**
 * Dangerous attribute names that can execute JavaScript.
 */
const DANGEROUS_ATTRS = new Set([
  'onclick',
  'ondblclick',
  'onmousedown',
  'onmouseup',
  'onmouseover',
  'onmousemove',
  'onmouseout',
  'onmouseenter',
  'onmouseleave',
  'onkeydown',
  'onkeypress',
  'onkeyup',
  'onfocus',
  'onblur',
  'onsubmit',
  'onreset',
  'onselect',
  'onchange',
  'oninput',
  'onload',
  'onerror',
  'onabort',
  'onscroll',
  'onresize',
  'oncontextmenu',
  'ondrag',
  'ondragend',
  'ondragenter',
  'ondragleave',
  'ondragover',
  'ondragstart',
  'ondrop',
  'onanimationstart',
  'onanimationend',
  'onanimationiteration',
  'ontransitionend',
  'formaction',
  'action',
  'href', // Can be javascript:
  'src', // Can be javascript:
  'srcdoc',
  'xlink:href',
]);

export const HtmlEscaper = {
  /**
   * Escape HTML special characters.
   *
   * Converts characters that have special meaning in HTML to their
   * entity equivalents, preventing XSS attacks.
   *
   * @param text - Untrusted text to escape
   * @returns Escaped text safe for HTML insertion
   */
  escape(text: string): string {
    if (!text) {
      return '';
    }
    // Fallback to char is defensive - pattern only matches mapped entities
    return text.replace(
      HTML_ESCAPE_PATTERN,
      (char) => HTML_ENTITIES[char] /* v8 ignore next */ ?? char
    );
  },

  /**
   * Escape and truncate text (for display).
   *
   * @param text - Text to escape and truncate
   * @param maxLength - Maximum length (default: 100)
   * @param suffix - Suffix for truncated text (default: '...')
   */
  truncate(text: string, maxLength = 100, suffix = '...'): string {
    if (!text) {
      return '';
    }

    const escaped = HtmlEscaper.escape(text);

    if (escaped.length <= maxLength) {
      return escaped;
    }

    return escaped.substring(0, maxLength - suffix.length) + suffix;
  },

  /**
   * Build a safe HTML tag with escaped content.
   *
   * @param tagName - HTML tag name (validated)
   * @param attrs - Attributes (values escaped, dangerous attrs filtered)
   * @param content - Content (escaped) or null for self-closing
   */
  tag(
    tagName: string,
    attrs: Record<string, string | number | boolean> = {},
    content?: string | null
  ): string {
    // Validate tag name
    if (!SAFE_ATTR_NAME.test(tagName)) {
      throw ValidationError.invalidFormat('tagName', tagName, 'valid HTML tag name');
    }

    const attrParts: string[] = [];

    for (const [name, value] of Object.entries(attrs)) {
      // Skip dangerous attributes
      if (DANGEROUS_ATTRS.has(name.toLowerCase())) {
        continue;
      }

      // Validate attribute name
      if (!SAFE_ATTR_NAME.test(name)) {
        continue;
      }

      // Handle boolean attributes
      if (typeof value === 'boolean') {
        if (value) {
          attrParts.push(name);
        }
        continue;
      }

      // Escape attribute value
      const escapedValue = HtmlEscaper.escapeAttr(String(value));
      attrParts.push(`${name}="${escapedValue}"`);
    }

    const attrStr = attrParts.length > 0 ? ' ' + attrParts.join(' ') : '';

    // Self-closing if no content
    if (content === null || content === undefined) {
      return `<${tagName}${attrStr} />`;
    }

    return `<${tagName}${attrStr}>${HtmlEscaper.escape(content)}</${tagName}>`;
  },

  /**
   * Escape text for use in HTML attributes.
   * More aggressive escaping for attribute context.
   */
  escapeAttr(text: string): string {
    if (!text) {
      return '';
    }
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/`/g, '&#x60;')
      .replace(/\//g, '&#x2F;');
  },

  /**
   * Check if a URL is safe (not javascript:, data:, etc.).
   */
  isSafeUrl(url: string): boolean {
    if (!url) {
      return false;
    }

    const normalized = url.trim().toLowerCase();

    // Block dangerous protocols
    return (
      !normalized.startsWith('javascript:') &&
      !normalized.startsWith('data:') &&
      !normalized.startsWith('vbscript:')
    );
  },

  /**
   * Sanitize URL for safe use in href/src.
   * Returns empty string if URL is dangerous.
   */
  sanitizeUrl(url: string): string {
    if (!HtmlEscaper.isSafeUrl(url)) {
      return '';
    }
    return HtmlEscaper.escapeAttr(url);
  },
};
