/**
 * Result Type - Rust-inspired error handling.
 *
 * A Result represents either success (Ok) or failure (Err).
 * Provides a type-safe alternative to throwing exceptions.
 *
 * Benefits over exceptions:
 * - Errors are visible in the type signature
 * - Forces explicit error handling
 * - Enables functional composition with map/flatMap
 * - No hidden control flow
 *
 * @example
 * ```TypeScript
 * function parseJson(text: string): Result<unknown, ValidationError> {
 *   try {
 *     return Result.ok(JSON.parse(text));
 *   } catch (e) {
 *     return Result.err(ValidationError.invalidFormat('json', text, 'valid JSON'));
 *   }
 * }
 *
 * const result = parseJson('{"foo": 42}');
 *
 * // Pattern 1: Check and extract
 * if (result.isOk()) {
 *   console.log(result.value);
 * }
 *
 * // Pattern 2: Provide default
 * const data = result.unwrapOr({ default: true });
 *
 * // Pattern 3: Transform
 * const mapped = result.map(data => data.foo);
 *
 * // Pattern 4: Chain operations
 * const chained = result
 *   .flatMap(data => validateData(data))
 *   .map(valid => processValid(valid));
 * ```
 *
 * @remarks
 * ## Migration Guide: From Throwing to Result Pattern
 *
 * ### Why Result Pattern?
 *
 * The Result pattern makes error handling explicit and type-safe:
 * - **No uncaught exceptions** - Errors cannot be ignored or forgotten
 * - **Visible in signatures** - Function types document potential failures
 * - **Composable** - Chain operations without nested try/catch blocks
 * - **Type-safe** - TypeScript knows exactly which errors can occur
 *
 * ### Before: Throwing API
 *
 * Traditional try/catch approach:
 *
 * ```TypeScript
 * import { CookieValidator } from '@zappzarapp/browser-utils/core';
 *
 * // Throws ValidationError if invalid
 * try {
 *   CookieValidator.cookieName('my-cookie');
 *   console.log('Valid cookie name');
 * } catch (error) {
 *   if (error instanceof ValidationError) {
 *     console.error('Invalid:', error.message);
 *   }
 * }
 *
 * // Problem: Easy to forget error handling
 * CookieValidator.cookieName(userInput); // Can throw! Type system doesn't warn.
 * ```
 *
 * ### After: Result-based API
 *
 * Same validation with explicit error handling:
 *
 * ```TypeScript
 * import { CookieValidator, Result } from '@zappzarapp/browser-utils/core';
 *
 * // Returns Result<string, ValidationError>
 * const result = CookieValidator.cookieNameResult('my-cookie');
 *
 * // TypeScript forces you to handle both cases
 * if (Result.isOk(result)) {
 *   console.log('Valid cookie name:', result.value);
 * } else {
 *   console.error('Invalid:', result.error.message);
 * }
 * ```
 *
 * ### Common Patterns
 *
 * #### 1. Mapping over Results
 *
 * Transform success values without checking:
 *
 * ```TypeScript
 * // Before: Manual error propagation
 * function processName(name: string): string {
 *   try {
 *     CookieValidator.cookieName(name);
 *     return name.toUpperCase();
 *   } catch (error) {
 *     throw error; // Re-throw
 *   }
 * }
 *
 * // After: Automatic error propagation
 * function processName(name: string): Result<string, ValidationError> {
 *   return Result.map(
 *     CookieValidator.cookieNameResult(name),
 *     (validName) => validName.toUpperCase()
 *   );
 * }
 * ```
 *
 * #### 2. Chaining Results with flatMap
 *
 * Combine multiple operations that can fail:
 *
 * ```TypeScript
 * // Before: Nested try/catch
 * function validateAndStore(name: string, value: string): void {
 *   try {
 *     CookieValidator.cookieName(name);
 *     CookieValidator.cookieValue(value);
 *     document.cookie = `${name}=${value}`;
 *   } catch (error) {
 *     console.error('Failed:', error);
 *   }
 * }
 *
 * // After: Flat composition
 * function validateAndStore(name: string, value: string): Result<void, ValidationError> {
 *   return Result.flatMap(
 *     CookieValidator.cookieNameResult(name),
 *     (validName) => Result.flatMap(
 *       CookieValidator.cookieValueResult(value),
 *       (validValue) => {
 *         document.cookie = `${validName}=${validValue}`;
 *         return Result.ok(undefined);
 *       }
 *     )
 *   );
 * }
 * ```
 *
 * #### 3. Providing Defaults with unwrapOr
 *
 * Handle errors by supplying fallback values:
 *
 * ```TypeScript
 * // Before: Try/catch with fallback
 * function getValidNameOrDefault(input: string): string {
 *   try {
 *     CookieValidator.cookieName(input);
 *     return input;
 *   } catch {
 *     return 'default-cookie';
 *   }
 * }
 *
 * // After: Direct fallback
 * function getValidNameOrDefault(input: string): string {
 *   return Result.unwrapOr(
 *     CookieValidator.cookieNameResult(input),
 *     'default-cookie'
 *   );
 * }
 * ```
 *
 * #### 4. Converting Throwing Code with fromTry
 *
 * Wrap existing throwing functions:
 *
 * ```TypeScript
 * // Before: Throwing JSON.parse
 * function parseConfig(json: string): Config {
 *   return JSON.parse(json); // Can throw
 * }
 *
 * // After: Result-returning version
 * function parseConfig(json: string): Result<Config, ValidationError> {
 *   return Result.fromTry(
 *     () => JSON.parse(json),
 *     (error) => ValidationError.invalidFormat(
 *       'json',
 *       json,
 *       'valid JSON',
 *       { cause: error }
 *     )
 *   );
 * }
 * ```
 *
 * #### 5. Async Operations with fromPromise
 *
 * Convert Promises to Results:
 *
 * ```TypeScript
 * // Before: Promise rejection
 * async function fetchData(url: string): Promise<Data> {
 *   const response = await fetch(url);
 *   if (!response.ok) {
 *     throw new Error('Fetch failed');
 *   }
 *   return response.json();
 * }
 *
 * // After: Result-based async
 * async function fetchData(url: string): Promise<Result<Data, Error>> {
 *   return Result.fromPromise(
 *     fetch(url).then(r => {
 *       if (!r.ok) throw new Error('Fetch failed');
 *       return r.json();
 *     })
 *   );
 * }
 * ```
 *
 * #### 6. Pattern Matching with match
 *
 * Handle both cases in one expression:
 *
 * ```TypeScript
 * // Before: If/else branches
 * function displayResult(name: string): string {
 *   try {
 *     CookieValidator.cookieName(name);
 *     return `Valid: ${name}`;
 *   } catch (error) {
 *     return `Invalid: ${error.message}`;
 *   }
 * }
 *
 * // After: Pattern matching
 * function displayResult(name: string): string {
 *   return Result.match(
 *     CookieValidator.cookieNameResult(name),
 *     {
 *       ok: (validName) => `Valid: ${validName}`,
 *       err: (error) => `Invalid: ${error.message}`
 *     }
 *   );
 * }
 * ```
 *
 * #### 7. Transforming Errors with mapErr
 *
 * Convert error types:
 *
 * ```TypeScript
 * import { ValidationError } from '@zappzarapp/browser-utils/core';
 *
 * // Convert ValidationError to custom error type
 * interface AppError {
 *   code: string;
 *   message: string;
 * }
 *
 * const result = Result.mapErr(
 *   CookieValidator.cookieNameResult(userInput),
 *   (validationError): AppError => ({
 *     code: 'VALIDATION_FAILED',
 *     message: validationError.message
 *   })
 * );
 * // Type: Result<string, AppError>
 * ```
 *
 * ### Migration Steps
 *
 * Follow these steps to migrate your codebase:
 *
 * **1. Identify throwing functions**
 *
 * Find functions that use try/catch or throw errors:
 *
 * ```bash
 * # Search for try/catch blocks
 * git grep -n "try {" -- "*.ts"
 * # Search for throw statements
 * git grep -n "throw " -- "*.ts"
 * ```
 *
 * **2. Add Result-based variants**
 *
 * Many modules already provide both APIs (e.g., `validate()` and `validateResult()`).
 * Start using the Result-based versions:
 *
 * ```TypeScript
 * // Old API (still available)
 * CookieValidator.cookieName(name);
 *
 * // New API (recommended)
 * const result = CookieValidator.cookieNameResult(name);
 * ```
 *
 * **3. Update call sites incrementally**
 *
 * Replace try/catch with Result handling:
 *
 * ```TypeScript
 * // Before
 * try {
 *   const value = riskyOperation();
 *   return process(value);
 * } catch (error) {
 *   return handleError(error);
 * }
 *
 * // After
 * return Result.match(
 *   riskyOperation(),
 *   {
 *     ok: (value) => process(value),
 *     err: (error) => handleError(error)
 *   }
 * );
 * ```
 *
 * **4. Chain operations**
 *
 * Replace nested try/catch with flatMap:
 *
 * ```TypeScript
 * // Before: Nested error handling
 * try {
 *   const step1 = operation1();
 *   const step2 = operation2(step1);
 *   const step3 = operation3(step2);
 *   return step3;
 * } catch (error) {
 *   throw error;
 * }
 *
 * // After: Flat composition
 * return Result.flatMap(
 *   operation1(),
 *   step1 => Result.flatMap(
 *     operation2(step1),
 *     step2 => operation3(step2)
 *   )
 * );
 * ```
 *
 * **5. Update type signatures**
 *
 * Make errors explicit in function signatures:
 *
 * ```TypeScript
 * // Before: Errors hidden
 * function processInput(input: string): ProcessedData {
 *   // Can throw ValidationError, but not documented in type
 * }
 *
 * // After: Errors visible
 * function processInput(input: string): Result<ProcessedData, ValidationError> {
 *   // TypeScript ensures callers handle ValidationError
 * }
 * ```
 *
 * **6. Handle boundary cases**
 *
 * At API boundaries, convert between throwing and Result:
 *
 * ```TypeScript
 * // Express.js route handler expects thrown errors
 * app.post('/api/data', (req, res) => {
 *   const result = processData(req.body);
 *
 *   if (Result.isErr(result)) {
 *     throw result.error; // Convert back to throwing for framework
 *   }
 *
 *   res.json(result.value);
 * });
 *
 * // Or use unwrap() to throw
 * app.post('/api/data', (req, res) => {
 *   const data = Result.unwrap(processData(req.body));
 *   res.json(data);
 * });
 * ```
 *
 * ### Best Practices
 *
 * - **Use Result for recoverable errors** - Use throwing exceptions only for programmer errors
 * - **Document error types** - Use TypeScript's union types to show all possible errors
 * - **Avoid unwrap() in libraries** - Let callers decide how to handle errors
 * - **Use match for side effects** - When you need to perform different actions based on result
 * - **Use map/flatMap for transformations** - When you need to transform success values
 * - **Prefer unwrapOr for defaults** - When errors can be handled with fallback values
 */

/**
 * Success variant of Result.
 */
export interface Ok<T> {
  readonly _tag: 'Ok';
  readonly value: T;
}

/**
 * Failure variant of Result.
 */
export interface Err<E> {
  readonly _tag: 'Err';
  readonly error: E;
}

export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Result utility functions and constructors.
 */
export const Result = {
  // =========================================================================
  // Constructors
  // =========================================================================

  /**
   * Create a success result.
   */
  ok<T, E = never>(value: T): Result<T, E> {
    return { _tag: 'Ok', value };
  },

  /**
   * Create a failure result.
   */
  err<E, T = never>(error: E): Result<T, E> {
    return { _tag: 'Err', error };
  },

  // =========================================================================
  // Type Guards
  // =========================================================================

  /**
   * Check if result is success.
   */
  isOk<T, E>(result: Result<T, E>): result is Ok<T> {
    return result._tag === 'Ok';
  },

  /**
   * Check if result is failure.
   */
  isErr<T, E>(result: Result<T, E>): result is Err<E> {
    return result._tag === 'Err';
  },

  // =========================================================================
  // Extractors
  // =========================================================================

  /**
   * Extract value or throw if error.
   * Use only when you're certain the result is Ok.
   */
  unwrap<T, E>(result: Result<T, E>): T {
    if (result._tag === 'Ok') {
      return result.value;
    }
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- Result.Err can contain any error type, not just Error instances
    throw result.error;
  },

  /**
   * Extract value or return default.
   */
  unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
    if (result._tag === 'Ok') {
      return result.value;
    }
    return defaultValue;
  },

  /**
   * Extract value or compute default from error.
   */
  unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T {
    if (result._tag === 'Ok') {
      return result.value;
    }
    return fn(result.error);
  },

  /**
   * Extract error or throw if success.
   * Use only when you're certain the result is Err.
   */
  unwrapErr<T, E>(result: Result<T, E>): E {
    if (result._tag === 'Err') {
      return result.error;
    }
    throw new Error('Called unwrapErr on Ok value');
  },

  // =========================================================================
  // Transformers
  // =========================================================================

  /**
   * Transform success value.
   */
  map<T, E, U>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
    if (result._tag === 'Ok') {
      return Result.ok(fn(result.value));
    }
    return result;
  },

  /**
   * Transform error value.
   */
  mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
    if (result._tag === 'Err') {
      return Result.err(fn(result.error));
    }
    return result;
  },

  /**
   * Chain operations that return Results.
   */
  flatMap<T, E, U>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
    if (result._tag === 'Ok') {
      return fn(result.value);
    }
    return result;
  },

  // =========================================================================
  // Utilities
  // =========================================================================

  /**
   * Convert throwing function to Result-returning function.
   */
  fromTry<T, E = Error>(fn: () => T, mapError?: (e: unknown) => E): Result<T, E> {
    try {
      return Result.ok(fn());
    } catch (e) {
      if (mapError) {
        return Result.err(mapError(e));
      }
      return Result.err(e as E);
    }
  },

  /**
   * Convert Promise to Promise<Result>.
   */
  async fromPromise<T, E = Error>(
    promise: Promise<T>,
    mapError?: (e: unknown) => E
  ): Promise<Result<T, E>> {
    try {
      const value = await promise;
      return Result.ok(value);
    } catch (e) {
      if (mapError) {
        return Result.err(mapError(e));
      }
      return Result.err(e as E);
    }
  },

  /**
   * Execute side effect on success.
   */
  tap<T, E>(result: Result<T, E>, fn: (value: T) => void): Result<T, E> {
    if (result._tag === 'Ok') {
      fn(result.value);
    }
    return result;
  },

  /**
   * Execute side effect on error.
   */
  tapErr<T, E>(result: Result<T, E>, fn: (error: E) => void): Result<T, E> {
    if (result._tag === 'Err') {
      fn(result.error);
    }
    return result;
  },

  /**
   * Pattern match on Result.
   */
  match<T, E, U>(result: Result<T, E>, handlers: { ok: (value: T) => U; err: (error: E) => U }): U {
    if (result._tag === 'Ok') {
      return handlers.ok(result.value);
    }
    return handlers.err(result.error);
  },
};
