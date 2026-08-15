/**
 * Filename Validation.
 *
 * Validates and sanitizes filenames for downloads.
 * Prevents path traversal, reserved names, and forbidden characters.
 *
 * @internal
 */
import { ValidationError } from '../errors/ValidationError.js';
import { Result } from '../result/Result.js';

/**
 * Characters forbidden in filenames (security + cross-platform).
 */
const FORBIDDEN_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/;

/**
 * Path traversal patterns.
 */
const PATH_TRAVERSAL_PATTERN = /(?:^|[/\\])\.\.(?:[/\\]|$)/;

/**
 * Reserved Windows filenames.
 */
const RESERVED_FILENAMES = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i;

/**
 * Maximum filename length.
 */
const MAX_FILENAME_LENGTH = 255;

/**
 * Maximum MIME type length.
 */
const MAX_MIMETYPE_LENGTH = 127;

export const FilenameValidator = {
  /**
   * Validate filename for download.
   * @throws {ValidationError} If filename is invalid
   */
  filename(filename: string): void {
    const result = FilenameValidator.filenameResult(filename);
    if (Result.isErr(result)) {
      throw result.error;
    }
  },

  /**
   * Validate filename and return Result.
   */
  filenameResult(filename: string): Result<string, ValidationError> {
    if (!filename) {
      return Result.err(ValidationError.empty('filename'));
    }

    if (filename.length > MAX_FILENAME_LENGTH) {
      return Result.err(ValidationError.tooLong('filename', filename, MAX_FILENAME_LENGTH));
    }

    // Check for forbidden characters
    if (FORBIDDEN_FILENAME_CHARS.test(filename)) {
      return Result.err(
        ValidationError.containsForbiddenChars(
          'filename',
          filename,
          '< > : " / \\ | ? * control chars'
        )
      );
    }

    // Check for path traversal
    if (PATH_TRAVERSAL_PATTERN.test(filename)) {
      return Result.err(ValidationError.invalidFilename(filename, 'path traversal detected'));
    }

    // Check for reserved Windows names
    if (RESERVED_FILENAMES.test(filename)) {
      return Result.err(ValidationError.invalidFilename(filename, 'reserved system name'));
    }

    // Check for leading/trailing dots or spaces
    if (filename.startsWith('.') || filename.startsWith(' ')) {
      return Result.err(
        ValidationError.invalidFilename(filename, 'cannot start with dot or space')
      );
    }

    if (filename.endsWith('.') || filename.endsWith(' ')) {
      return Result.err(ValidationError.invalidFilename(filename, 'cannot end with dot or space'));
    }

    return Result.ok(filename);
  },

  /**
   * Sanitize filename by removing/replacing invalid characters.
   * Use when you want to accept user input but make it safe.
   */
  sanitizeFilename(filename: string, replacement = '_'): string {
    if (!filename) {
      return 'download';
    }

    let sanitized = filename
      // Remove forbidden characters (global replacement)
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, replacement)
      // Remove path traversal
      .replace(/\.\./g, replacement)
      // Trim dots and spaces from ends
      .replace(/^[.\s]+|[.\s]+$/g, '');

    // Handle reserved names
    if (RESERVED_FILENAMES.test(sanitized)) {
      sanitized = `_${sanitized}`;
    }

    // Ensure not empty after sanitization
    if (!sanitized) {
      return 'download';
    }

    // Truncate if too long
    if (sanitized.length > MAX_FILENAME_LENGTH) {
      const ext = sanitized.lastIndexOf('.');
      if (ext > 0 && ext > sanitized.length - 10) {
        // Preserve extension
        const extension = sanitized.substring(ext);
        const base = sanitized.substring(0, MAX_FILENAME_LENGTH - extension.length);
        sanitized = base + extension;
      } else {
        sanitized = sanitized.substring(0, MAX_FILENAME_LENGTH);
      }
    }

    return sanitized;
  },

  /**
   * Validate MIME type format.
   * @throws {ValidationError} If MIME type is invalid
   */
  mimeType(mimeType: string): void {
    const result = FilenameValidator.mimeTypeResult(mimeType);
    if (Result.isErr(result)) {
      throw result.error;
    }
  },

  /**
   * Validate MIME type and return Result.
   */
  mimeTypeResult(mimeType: string): Result<string, ValidationError> {
    if (!mimeType) {
      return Result.err(ValidationError.empty('mimeType'));
    }

    if (mimeType.length > MAX_MIMETYPE_LENGTH) {
      return Result.err(ValidationError.tooLong('mimeType', mimeType, MAX_MIMETYPE_LENGTH));
    }

    // Basic MIME type format: type/subtype with optional parameters
    // e.g., "text/plain", "application/json", "text/html; charset=utf-8"
    // eslint-disable-next-line security/detect-unsafe-regex -- Safe: [^\s;]+ cannot backtrack with outer group since ; is excluded
    if (!/^[a-z]+\/[a-z0-9.+-]+(?:;\s*[a-z0-9-]+=[^\s;]+)*$/i.test(mimeType)) {
      return Result.err(
        ValidationError.invalidFormat('mimeType', mimeType, 'type/subtype (e.g., text/plain)')
      );
    }

    return Result.ok(mimeType);
  },
};
