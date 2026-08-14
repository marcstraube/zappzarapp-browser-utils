/**
 * File Downloader.
 *
 * Triggers browser downloads with security validation.
 * All filenames are validated to prevent path traversal and injection attacks.
 *
 * Features:
 * - Automatic Blob URL cleanup (prevents memory leaks)
 * - Filename validation (security)
 * - Multiple content types (JSON, CSV, text, binary)
 * - Fluent API for chaining
 *
 * @example
 * ```TypeScript
 * // Quick downloads
 * Downloader.json({ user: 'data' }, 'export.json');
 * Downloader.csv('a,b,c\n1,2,3', 'data.csv');
 * Downloader.text('Hello World', 'message.txt');
 *
 * // With options
 * Downloader.download('content', DownloadOptions.json('data.json'));
 *
 * // Binary data
 * const blob = new Blob([arrayBuffer], { type: 'image/png' });
 * Downloader.blob(blob, 'image.png');
 * ```
 */
import { DownloadOptions, type DownloadOptionsInput } from './DownloadOptions.js';

export const Downloader = {
  // =========================================================================
  // Core Download Function
  // =========================================================================

  /**
   * Download string content with validated options.
   *
   * @param content - String content to download
   * @param options - Download options (filename, mimeType)
   */
  download(content: string, options: DownloadOptions): void {
    const blob = new Blob([content], { type: options.mimeType });
    Downloader.blob(blob, options.filename);
  },

  /**
   * Download Blob content.
   *
   * @param content - Blob or ArrayBuffer to download
   * @param filename - Validated filename
   */
  blob(content: Blob | ArrayBuffer, filename: string): void {
    // Validate filename
    const options = DownloadOptions.binary(filename);

    const blob = content instanceof Blob ? content : new Blob([content]);

    const url = URL.createObjectURL(blob);

    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = options.filename;
      anchor.style.display = 'none';

      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } finally {
      // Always cleanup to prevent memory leaks
      URL.revokeObjectURL(url);
    }
  },

  // =========================================================================
  // Convenience Methods
  // =========================================================================

  /**
   * Download JSON content.
   *
   * @param content - Object or string to serialize as JSON
   * @param filename - Filename (will add .json if missing)
   * @param indent - JSON indentation (default: 2)
   *
   * @example
   * ```TypeScript
   * Downloader.json({ foo: 'bar' }, 'data.json');
   * Downloader.json(exportData, `export-${Date.now()}.json`);
   * ```
   */
  json(content: unknown, filename: string, indent = 2): void {
    const options = DownloadOptions.json(filename);
    const json = typeof content === 'string' ? content : JSON.stringify(content, null, indent);
    Downloader.download(json, options);
  },

  /**
   * Download CSV content.
   *
   * @param content - CSV string content
   * @param filename - Filename (will add .csv if missing)
   *
   * @example
   * ```TypeScript
   * Downloader.csv('name,age\nAlice,30\nBob,25', 'users.csv');
   * ```
   */
  csv(content: string, filename: string): void {
    const options = DownloadOptions.csv(filename);
    Downloader.download(content, options);
  },

  /**
   * Download plain text content.
   *
   * @param content - Text content
   * @param filename - Filename (will add .txt if missing)
   *
   * @example
   * ```TypeScript
   * Downloader.text('Hello World', 'greeting.txt');
   * ```
   */
  text(content: string, filename: string): void {
    const options = DownloadOptions.text(filename);
    Downloader.download(content, options);
  },

  /**
   * Download HTML content.
   *
   * @param content - HTML content
   * @param filename - Filename (will add .html if missing)
   *
   * @example
   * ```TypeScript
   * Downloader.html('<html><body>Hello</body></html>', 'page.html');
   * ```
   */
  html(content: string, filename: string): void {
    const options = DownloadOptions.html(filename);
    Downloader.download(content, options);
  },

  /**
   * Download with custom options.
   *
   * @param content - Content to download
   * @param input - Download options input
   *
   * @example
   * ```TypeScript
   * Downloader.withOptions('data', {
   *   filename: 'export.dat',
   *   mimeType: 'application/x-custom',
   * });
   * ```
   */
  withOptions(content: string, input: DownloadOptionsInput): void {
    const options = DownloadOptions.create(input);
    Downloader.download(content, options);
  },

  /**
   * Download with sanitized filename (for user input).
   *
   * Use when the filename comes from untrusted user input.
   * Invalid characters will be replaced instead of throwing.
   *
   * @param content - Content to download
   * @param filename - Untrusted filename (will be sanitized)
   * @param mimeType - MIME type (default: application/octet-stream)
   *
   * @example
   * ```TypeScript
   * // User input: "../../../etc/passwd"
   * // Sanitized to: "etc_passwd"
   * Downloader.safe(content, userProvidedFilename);
   * ```
   */
  safe(content: string, filename: string, mimeType = 'application/octet-stream'): void {
    const options = DownloadOptions.create({
      filename,
      mimeType,
      sanitizeFilename: true,
    });
    Downloader.download(content, options);
  },
};
