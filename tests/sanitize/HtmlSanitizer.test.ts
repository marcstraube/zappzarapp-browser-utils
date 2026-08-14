/**
 * HtmlSanitizer Tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HtmlSanitizer } from '../../src/sanitize/index.js';

describe('HtmlSanitizer', () => {
  beforeEach(() => {
    HtmlSanitizer.clearDOMPurify();
  });

  afterEach(() => {
    HtmlSanitizer.clearDOMPurify();
  });

  describe('DOMPurify Integration', () => {
    it('should report DOMPurify as unavailable by default', () => {
      expect(HtmlSanitizer.isDOMPurifyAvailable()).toBe(false);
    });

    it('should report DOMPurify as available after setDOMPurify', () => {
      const mockDOMPurify = {
        sanitize: vi.fn((html: string) => html),
        addHook: vi.fn(),
        removeHook: vi.fn(),
        removeAllHooks: vi.fn(),
      };

      HtmlSanitizer.setDOMPurify(mockDOMPurify);

      expect(HtmlSanitizer.isDOMPurifyAvailable()).toBe(true);
    });

    it('should use DOMPurify when available', () => {
      const mockDOMPurify = {
        sanitize: vi.fn((html: string) => `sanitized:${html}`),
        addHook: vi.fn(),
        removeHook: vi.fn(),
        removeAllHooks: vi.fn(),
      };

      HtmlSanitizer.setDOMPurify(mockDOMPurify);
      const result = HtmlSanitizer.sanitize('<b>test</b>');

      expect(mockDOMPurify.sanitize).toHaveBeenCalled();
      expect(result).toBe('sanitized:<b>test</b>');
    });

    it('should pass options to DOMPurify', () => {
      const mockDOMPurify = {
        sanitize: vi.fn((html: string) => html),
        addHook: vi.fn(),
        removeHook: vi.fn(),
        removeAllHooks: vi.fn(),
      };

      HtmlSanitizer.setDOMPurify(mockDOMPurify);
      HtmlSanitizer.sanitize('<b>test</b>', {
        allowedTags: ['b', 'i'],
        allowedAttributes: ['class'],
        allowDataUrls: true,
      });

      expect(mockDOMPurify.sanitize).toHaveBeenCalledWith('<b>test</b>', {
        ALLOWED_TAGS: ['b', 'i'],
        ALLOWED_ATTR: ['class'],
        ALLOW_DATA_ATTR: true,
      });
    });

    it('should default ALLOW_DATA_ATTR to false when allowDataUrls is unset', () => {
      const mockDOMPurify = {
        sanitize: vi.fn((html: string) => html),
        addHook: vi.fn(),
        removeHook: vi.fn(),
        removeAllHooks: vi.fn(),
      };

      HtmlSanitizer.setDOMPurify(mockDOMPurify);
      HtmlSanitizer.sanitize('<b>test</b>');

      expect(mockDOMPurify.sanitize).toHaveBeenCalledWith(
        '<b>test</b>',
        expect.objectContaining({ ALLOW_DATA_ATTR: false })
      );
    });

    it('should return empty string for empty input without invoking DOMPurify', () => {
      const mockDOMPurify = {
        sanitize: vi.fn((html: string) => html),
        addHook: vi.fn(),
        removeHook: vi.fn(),
        removeAllHooks: vi.fn(),
      };

      HtmlSanitizer.setDOMPurify(mockDOMPurify);

      expect(HtmlSanitizer.sanitize('')).toBe('');
      expect(mockDOMPurify.sanitize).not.toHaveBeenCalled();
    });

    it('should clear DOMPurify instance', () => {
      const mockDOMPurify = {
        sanitize: vi.fn(),
        addHook: vi.fn(),
        removeHook: vi.fn(),
        removeAllHooks: vi.fn(),
      };

      HtmlSanitizer.setDOMPurify(mockDOMPurify);
      expect(HtmlSanitizer.isDOMPurifyAvailable()).toBe(true);

      HtmlSanitizer.clearDOMPurify();
      expect(HtmlSanitizer.isDOMPurifyAvailable()).toBe(false);
    });
  });

  describe('escape', () => {
    it('should escape HTML special characters', () => {
      expect(HtmlSanitizer.escape('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });

    it('should escape ampersand', () => {
      expect(HtmlSanitizer.escape('foo & bar')).toBe('foo &amp; bar');
    });

    it('should escape quotes', () => {
      expect(HtmlSanitizer.escape('"double" and \'single\'')).toBe(
        '&quot;double&quot; and &#39;single&#39;'
      );
    });

    it('should escape less than and greater than', () => {
      expect(HtmlSanitizer.escape('a < b > c')).toBe('a &lt; b &gt; c');
    });

    it('should return empty string for empty input', () => {
      expect(HtmlSanitizer.escape('')).toBe('');
    });

    it('should not modify strings without special characters', () => {
      expect(HtmlSanitizer.escape('hello world')).toBe('hello world');
    });

    it('should escape all special characters in one string', () => {
      expect(HtmlSanitizer.escape('&<>"\'all')).toBe('&amp;&lt;&gt;&quot;&#39;all');
    });
  });

  describe('unescape', () => {
    it('should unescape HTML entities', () => {
      expect(HtmlSanitizer.unescape('&lt;script&gt;')).toBe('<script>');
    });

    it('should unescape ampersand', () => {
      expect(HtmlSanitizer.unescape('foo &amp; bar')).toBe('foo & bar');
    });

    it('should unescape quotes', () => {
      expect(HtmlSanitizer.unescape('&quot;double&quot; and &#39;single&#39;')).toBe(
        '"double" and \'single\''
      );
    });

    it('should unescape hex apostrophe', () => {
      expect(HtmlSanitizer.unescape('&#x27;hex&#x27;')).toBe("'hex'");
    });

    it('should unescape apos entity', () => {
      expect(HtmlSanitizer.unescape('&apos;apos&apos;')).toBe("'apos'");
    });

    it('should return empty string for empty input', () => {
      expect(HtmlSanitizer.unescape('')).toBe('');
    });

    it('should not modify strings without entities', () => {
      expect(HtmlSanitizer.unescape('hello world')).toBe('hello world');
    });

    it('should unescape all common entities', () => {
      expect(HtmlSanitizer.unescape('&amp;&lt;&gt;&quot;&#39;')).toBe('&<>"\'');
    });
  });

  describe('sanitize', () => {
    it('should escape HTML when DOMPurify is not available', () => {
      const result = HtmlSanitizer.sanitize('<b>bold</b>');
      expect(result).toBe('&lt;b&gt;bold&lt;/b&gt;');
    });

    it('should return empty string for empty input', () => {
      expect(HtmlSanitizer.sanitize('')).toBe('');
    });

    it('should strip all HTML when stripAll option is true', () => {
      const result = HtmlSanitizer.sanitize('<p>Hello <b>World</b>!</p>', { stripAll: true });
      expect(result).toBe('Hello World!');
    });

    it('should use default allowed tags with DOMPurify', () => {
      const mockDOMPurify = {
        sanitize: vi.fn(
          (html: string, config?: Record<string, unknown>) => html + (config ? '' : '')
        ),
        addHook: vi.fn(),
        removeHook: vi.fn(),
        removeAllHooks: vi.fn(),
      };

      HtmlSanitizer.setDOMPurify(mockDOMPurify);
      HtmlSanitizer.sanitize('<b>test</b>');

      const call = mockDOMPurify.sanitize.mock.calls[0] as [string, Record<string, unknown>];
      expect(call[1].ALLOWED_TAGS).toContain('b');
      expect(call[1].ALLOWED_TAGS).toContain('p');
      expect(call[1].ALLOWED_TAGS).toContain('a');
    });

    it('should use default allowed attributes with DOMPurify', () => {
      const mockDOMPurify = {
        sanitize: vi.fn(
          (html: string, config?: Record<string, unknown>) => html + (config ? '' : '')
        ),
        addHook: vi.fn(),
        removeHook: vi.fn(),
        removeAllHooks: vi.fn(),
      };

      HtmlSanitizer.setDOMPurify(mockDOMPurify);
      HtmlSanitizer.sanitize('<a href="#">test</a>');

      const call = mockDOMPurify.sanitize.mock.calls[0] as [string, Record<string, unknown>];
      expect(call[1].ALLOWED_ATTR).toContain('href');
      expect(call[1].ALLOWED_ATTR).toContain('src');
      expect(call[1].ALLOWED_ATTR).toContain('class');
    });
  });

  describe('stripTags', () => {
    it('should strip all HTML tags', () => {
      expect(HtmlSanitizer.stripTags('<p>Hello <b>World</b>!</p>')).toBe('Hello World!');
    });

    it('should strip script tags (content may remain in happy-dom)', () => {
      // Note: happy-dom's DOMParser includes script text content
      // Real browsers would exclude it, but we test the tag removal
      const result = HtmlSanitizer.stripTags('Hello<script>alert("xss")</script>World');
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('</script>');
      expect(result).toContain('Hello');
      expect(result).toContain('World');
    });

    it('should strip style tags (content may remain in happy-dom)', () => {
      // Note: happy-dom's DOMParser includes style text content
      // Real browsers would exclude it, but we test the tag removal
      const result = HtmlSanitizer.stripTags('Hello<style>.red{color:red}</style>World');
      expect(result).not.toContain('<style>');
      expect(result).not.toContain('</style>');
      expect(result).toContain('Hello');
      expect(result).toContain('World');
    });

    it('should return empty string for empty input', () => {
      expect(HtmlSanitizer.stripTags('')).toBe('');
    });

    it('should handle nested tags', () => {
      expect(HtmlSanitizer.stripTags('<div><p><span>Nested</span></p></div>')).toBe('Nested');
    });

    it('should normalize whitespace', () => {
      const result = HtmlSanitizer.stripTags('<p>Hello</p>   <p>World</p>');
      // DOM-based stripping preserves structure, regex-based normalizes
      expect(result).toMatch(/Hello\s+World/);
    });

    it('should throw when DOMParser is not available', () => {
      const originalDOMParser = globalThis.DOMParser;
      // @ts-expect-error - Testing undefined
      delete globalThis.DOMParser;

      try {
        expect(() => HtmlSanitizer.stripTags('<p>Hello</p>')).toThrow('DOMParser is not available');
      } finally {
        globalThis.DOMParser = originalDOMParser;
      }
    });
  });

  describe('escapeAttribute', () => {
    it('should escape quotes in attribute values', () => {
      expect(HtmlSanitizer.escapeAttribute('value with "quotes"')).toBe(
        'value with &quot;quotes&quot;'
      );
    });

    it('should escape single quotes', () => {
      expect(HtmlSanitizer.escapeAttribute("value with 'quotes'")).toBe(
        'value with &#39;quotes&#39;'
      );
    });

    it('should escape angle brackets', () => {
      expect(HtmlSanitizer.escapeAttribute('a < b > c')).toBe('a &lt; b &gt; c');
    });

    it('should escape ampersand', () => {
      expect(HtmlSanitizer.escapeAttribute('foo & bar')).toBe('foo &amp; bar');
    });

    it('should return empty string for empty input', () => {
      expect(HtmlSanitizer.escapeAttribute('')).toBe('');
    });

    it('should not modify safe strings', () => {
      expect(HtmlSanitizer.escapeAttribute('safe value')).toBe('safe value');
    });
  });

  describe('isSafeUrl', () => {
    it('should return true for http URLs', () => {
      expect(HtmlSanitizer.isSafeUrl('http://example.com')).toBe(true);
    });

    it('should return true for https URLs', () => {
      expect(HtmlSanitizer.isSafeUrl('https://example.com')).toBe(true);
    });

    it('should return true for relative URLs', () => {
      expect(HtmlSanitizer.isSafeUrl('/path/to/resource')).toBe(true);
    });

    it('should return true for hash URLs', () => {
      expect(HtmlSanitizer.isSafeUrl('#section')).toBe(true);
    });

    it('should return false for javascript: URLs', () => {
      expect(HtmlSanitizer.isSafeUrl('javascript:alert("xss")')).toBe(false);
    });

    it('should return false for javascript: URLs with case variations', () => {
      expect(HtmlSanitizer.isSafeUrl('JAVASCRIPT:alert("xss")')).toBe(false);
      expect(HtmlSanitizer.isSafeUrl('JavaScript:alert("xss")')).toBe(false);
    });

    it('should return false for javascript: URLs with whitespace', () => {
      expect(HtmlSanitizer.isSafeUrl('  javascript:alert("xss")')).toBe(false);
    });

    it('should return false for vbscript: URLs', () => {
      expect(HtmlSanitizer.isSafeUrl('vbscript:msgbox("xss")')).toBe(false);
    });

    it('should return false for data: URLs by default', () => {
      expect(HtmlSanitizer.isSafeUrl('data:text/html,<script>alert("xss")</script>')).toBe(false);
    });

    it('should return true for data: URLs when explicitly allowed', () => {
      expect(HtmlSanitizer.isSafeUrl('data:image/png;base64,abc', true)).toBe(true);
    });

    it('should return false for empty URL', () => {
      expect(HtmlSanitizer.isSafeUrl('')).toBe(false);
    });
  });

  describe('sanitizeUrl', () => {
    it('should return safe URLs unchanged', () => {
      expect(HtmlSanitizer.sanitizeUrl('https://example.com')).toBe('https://example.com');
    });

    it('should return fallback for javascript: URLs', () => {
      expect(HtmlSanitizer.sanitizeUrl('javascript:alert("xss")')).toBe('#');
    });

    it('should return custom fallback when provided', () => {
      expect(HtmlSanitizer.sanitizeUrl('javascript:alert("xss")', '/home')).toBe('/home');
    });

    it('should return fallback for empty URL', () => {
      expect(HtmlSanitizer.sanitizeUrl('')).toBe('#');
    });
  });

  describe('DOM Methods', () => {
    describe('createTextNode', () => {
      it('should create a text node', () => {
        const node = HtmlSanitizer.createTextNode('Hello <World>');
        expect(node).toBeInstanceOf(Text);
        expect(node.textContent).toBe('Hello <World>');
      });

      it('should not interpret HTML in text content', () => {
        const node = HtmlSanitizer.createTextNode('<script>alert("xss")</script>');
        expect(node.textContent).toBe('<script>alert("xss")</script>');
      });
    });

    describe('setTextContent', () => {
      it('should set text content of element', () => {
        const element = document.createElement('div');
        HtmlSanitizer.setTextContent(element, 'Hello World');
        expect(element.textContent).toBe('Hello World');
      });

      it('should not interpret HTML', () => {
        const element = document.createElement('div');
        HtmlSanitizer.setTextContent(element, '<b>Bold</b>');
        expect(element.innerHTML).toBe('&lt;b&gt;Bold&lt;/b&gt;');
        expect(element.textContent).toBe('<b>Bold</b>');
      });

      it('should replace existing content', () => {
        const element = document.createElement('div');
        element.innerHTML = '<span>Old</span>';
        HtmlSanitizer.setTextContent(element, 'New');
        expect(element.textContent).toBe('New');
        expect(element.querySelector('span')).toBeNull();
      });
    });

    describe('setHtmlContent', () => {
      it('should set escaped HTML when DOMPurify is not available', () => {
        const element = document.createElement('div');
        HtmlSanitizer.setHtmlContent(element, '<b>Bold</b>');
        expect(element.innerHTML).toBe('&lt;b&gt;Bold&lt;/b&gt;');
      });

      it('should use DOMPurify when available', () => {
        const mockDOMPurify = {
          sanitize: vi.fn(() => '<b>sanitized</b>'),
          addHook: vi.fn(),
          removeHook: vi.fn(),
          removeAllHooks: vi.fn(),
        };

        HtmlSanitizer.setDOMPurify(mockDOMPurify);

        const element = document.createElement('div');
        // language=text
        const testHtml = '<script>bad</script><b>Bold</b>';
        HtmlSanitizer.setHtmlContent(element, testHtml);

        expect(element.innerHTML).toBe('<b>sanitized</b>');
      });

      it('should pass options to sanitize', () => {
        const mockDOMPurify = {
          sanitize: vi.fn((html: string) => html),
          addHook: vi.fn(),
          removeHook: vi.fn(),
          removeAllHooks: vi.fn(),
        };

        HtmlSanitizer.setDOMPurify(mockDOMPurify);

        const element = document.createElement('div');
        HtmlSanitizer.setHtmlContent(element, '<b>test</b>', { allowedTags: ['b'] });

        expect(mockDOMPurify.sanitize).toHaveBeenCalledWith('<b>test</b>', expect.any(Object));
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle null-like values in escape', () => {
      // @ts-expect-error Testing null input
      expect(HtmlSanitizer.escape(null)).toBe('');
      // @ts-expect-error Testing undefined input
      expect(HtmlSanitizer.escape(undefined)).toBe('');
    });

    it('should handle null-like values in unescape', () => {
      // @ts-expect-error Testing null input
      expect(HtmlSanitizer.unescape(null)).toBe('');
      // @ts-expect-error Testing undefined input
      expect(HtmlSanitizer.unescape(undefined)).toBe('');
    });

    it('should handle null-like values in sanitize', () => {
      // @ts-expect-error Testing null input
      expect(HtmlSanitizer.sanitize(null)).toBe('');
      // @ts-expect-error Testing undefined input
      expect(HtmlSanitizer.sanitize(undefined)).toBe('');
    });

    it('should handle null-like values in stripTags', () => {
      // @ts-expect-error Testing null input
      expect(HtmlSanitizer.stripTags(null)).toBe('');
      // @ts-expect-error Testing undefined input
      expect(HtmlSanitizer.stripTags(undefined)).toBe('');
    });

    it('should handle null-like values in escapeAttribute', () => {
      // @ts-expect-error Testing null input
      expect(HtmlSanitizer.escapeAttribute(null)).toBe('');
      // @ts-expect-error Testing undefined input
      expect(HtmlSanitizer.escapeAttribute(undefined)).toBe('');
    });

    it('should handle complex XSS payloads', () => {
      // language=text
      const xssPayloads = [
        '<img src=x onerror=alert("xss")>',
        '<svg onload=alert("xss")>',
        '<body onload=alert("xss")>',
        '"><script>alert("xss")</script>',
        "'-alert('xss')-'",
        '<iframe src="javascript:alert(\'xss\')">',
      ];

      for (const payload of xssPayloads) {
        const escaped = HtmlSanitizer.escape(payload);
        expect(escaped).not.toContain('<');
        expect(escaped).not.toContain('>');
      }
    });
  });

  // ===========================================================================
  // Coverage Gaps
  // ===========================================================================

  describe('Coverage Gaps', () => {
    it('should return char fallback in escape when entity lookup returns undefined (line 250)', () => {
      // The ?? char fallback is defensive code. The regex /[&<>"']/g only matches
      // characters that are in the HTML_ENTITIES map, so this path can only be
      // triggered by making the map return undefined for a matched character.
      // We intercept String.prototype.replace to inject a call with an unmapped char.
      const originalReplace = String.prototype.replace;

      String.prototype.replace = function (this: string, ...args: any[]): string {
        const [pattern, replacer] = args as [RegExp | string, (...a: string[]) => string];

        // Match the specific escape regex
        if (
          pattern instanceof RegExp &&
          pattern.source === '[&<>"\']' &&
          typeof replacer === 'function'
        ) {
          // Call the replacer with an unmapped char to trigger ?? fallback
          const fallbackResult = replacer('X', '0', this);
          expect(fallbackResult).toBe('X'); // ?? char returns the char itself

          // Restore and call the original for the actual result
          String.prototype.replace = originalReplace;
          return originalReplace.call(this, pattern, replacer);
        }

        return originalReplace.apply(this, args as never);
      };

      try {
        const result = HtmlSanitizer.escape('&test');
        expect(result).toBe('&amp;test');
      } finally {
        String.prototype.replace = originalReplace;
      }
    });

    it('should return entity fallback in unescape when reverse lookup returns undefined (line 263)', () => {
      const originalReplace = String.prototype.replace;

      String.prototype.replace = function (this: string, ...args: any[]): string {
        const [pattern, replacer] = args as [RegExp | string, (...a: string[]) => string];

        // Match the specific unescape regex
        if (
          pattern instanceof RegExp &&
          pattern.source === '&(?:amp|lt|gt|quot|#39|#x27|apos);' &&
          typeof replacer === 'function'
        ) {
          // Call the replacer with an unmapped entity to trigger ?? fallback
          const fallbackResult = replacer('&unknown;', '0', this);
          expect(fallbackResult).toBe('&unknown;'); // ?? entity returns the entity itself

          // Restore and call the original for the actual result
          String.prototype.replace = originalReplace;
          return originalReplace.call(this, pattern, replacer);
        }

        return originalReplace.apply(this, args as never);
      };

      try {
        const result = HtmlSanitizer.unescape('&amp;test');
        expect(result).toBe('&test');
      } finally {
        String.prototype.replace = originalReplace;
      }
    });
  });
});
