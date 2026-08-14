/**
 * Common Validation Utilities.
 *
 * General-purpose validators for common types.
 *
 * @internal
 */
import { ValidationError } from '../errors/ValidationError.js';
import { Result } from '../result/Result.js';

/**
 * Maximum clipboard text length (10MB).
 */
const MAX_CLIPBOARD_LENGTH = 10_000_000;

export const CommonValidator = {
  /**
   * Validate value is non-empty.
   * @throws {ValidationError} If value is empty
   */
  nonEmpty(field: string, value: string): void {
    const result = CommonValidator.nonEmptyResult(field, value);
    if (Result.isErr(result)) {
      throw result.error;
    }
  },

  /**
   * Validate value is non-empty and return Result.
   */
  nonEmptyResult(field: string, value: string): Result<string, ValidationError> {
    if (!value) {
      return Result.err(ValidationError.empty(field));
    }
    return Result.ok(value);
  },

  /**
   * Validate number is within range.
   * @throws {ValidationError} If number is out of range
   */
  numberInRange(field: string, value: number, min: number, max: number): void {
    const result = CommonValidator.numberInRangeResult(field, value, min, max);
    if (Result.isErr(result)) {
      throw result.error;
    }
  },

  /**
   * Validate number is within range and return Result.
   */
  numberInRangeResult(
    field: string,
    value: number,
    min: number,
    max: number
  ): Result<number, ValidationError> {
    if (value < min || value > max) {
      return Result.err(ValidationError.outOfRange(field, value, min, max));
    }
    return Result.ok(value);
  },

  /**
   * Validate positive integer.
   */
  positiveIntegerResult(field: string, value: number): Result<number, ValidationError> {
    if (!Number.isInteger(value) || value < 1) {
      return Result.err(
        ValidationError.invalidFormat(field, String(value), 'positive integer (>= 1)')
      );
    }
    return Result.ok(value);
  },

  /**
   * Validate clipboard text length.
   * @throws {ValidationError} If text is too long
   */
  clipboardText(text: string): void {
    const result = CommonValidator.clipboardTextResult(text);
    if (Result.isErr(result)) {
      throw result.error;
    }
  },

  /**
   * Validate clipboard text length and return Result.
   */
  clipboardTextResult(text: string): Result<string, ValidationError> {
    if (text.length > MAX_CLIPBOARD_LENGTH) {
      return Result.err(ValidationError.tooLong('clipboardText', text, MAX_CLIPBOARD_LENGTH));
    }
    return Result.ok(text);
  },
};
