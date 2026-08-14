/**
 * Request deduplication for identical in-flight requests.
 * Internal module for the RequestInterceptor dedupe feature.
 */
import { RequestError } from './RequestInterceptor.js';

/**
 * Safe methods eligible for deduplication. Deduplicating a request with
 * side effects would silently merge them, so the list is not extensible.
 */
export const DEDUPE_SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'] as const;

/**
 * Methods that may appear in {@link RequestDedupeConfig.methods}.
 */
export type DedupeMethod = (typeof DEDUPE_SAFE_METHODS)[number];

/**
 * Deduplication configuration for the request interceptor.
 * Deduplication is opt-in; without this config no request is ever shared.
 */
export interface RequestDedupeConfig {
  /**
   * HTTP methods eligible for deduplication.
   * Restricted to safe methods — unlike retry there is no opt-in for
   * unsafe methods, because two callers of a request with side effects
   * expect two side effects.
   * @default ['GET', 'HEAD', 'OPTIONS']
   */
  readonly methods?: readonly DedupeMethod[];
}

/**
 * Validated deduplication configuration.
 */
export interface ResolvedDedupeConfig {
  readonly methods: ReadonlySet<string>;
}

/**
 * Validate and resolve a dedupe configuration.
 * @throws {RequestError} INVALID_CONFIG for empty or unsafe method lists
 */
export function resolveDedupeConfig(config: RequestDedupeConfig): ResolvedDedupeConfig {
  const methods = config.methods ?? DEDUPE_SAFE_METHODS;

  if (methods.length === 0) {
    throw RequestError.invalidConfig('dedupe.methods must not be empty');
  }

  for (const method of methods) {
    if (!DEDUPE_SAFE_METHODS.includes(method)) {
      throw RequestError.invalidConfig(
        `dedupe.methods only allows safe methods (${DEDUPE_SAFE_METHODS.join(', ')}), got "${String(method)}"`
      );
    }
  }

  return { methods: new Set(methods) };
}

/**
 * Build the deduplication key from method, resolved URL, and the
 * caller-supplied headers. Instance-level constants (default headers,
 * auth) are identical for every request of an instance and deliberately
 * not part of the key — this also keeps credentials out of it. Header
 * lines are sorted explicitly so the key is insensitive to insertion
 * order regardless of the Headers implementation. The key is serialized
 * with JSON so field boundaries cannot be forged by control characters
 * embedded in the URL.
 */
export function dedupeKey(method: string, url: string, headers: Headers): string {
  const headerLines: string[] = [];
  headers.forEach((value, name) => {
    headerLines.push(`${name.toLowerCase()}:${value}`);
  });
  headerLines.sort();
  return JSON.stringify([method, url, headerLines]);
}

/**
 * A single shared in-flight request. Callers attach to it and receive an
 * independent clone of the shared response; the underlying request is
 * aborted only when every attached caller has aborted.
 */
export interface InFlightRequest {
  /** The shared execution; resolves with the uncloned response. */
  readonly promise: Promise<Response>;
  /** Controls the underlying request (refcounted abort). */
  readonly controller: AbortController;
  /** Callers currently attached and not aborted. */
  activeCallers: number;
  /** Total callers served (initiator + deduplicated). */
  totalCallers: number;
  /** Whether the shared execution has settled. */
  settled: boolean;
}

/**
 * Start a shared in-flight request. The `start` callback receives the
 * shared abort signal and must begin the underlying request.
 */
export function createInFlightRequest(
  start: (sharedSignal: AbortSignal) => Promise<Response>
): InFlightRequest {
  const controller = new AbortController();

  const entry: InFlightRequest = {
    promise: start(controller.signal),
    controller,
    activeCallers: 0,
    totalCallers: 0,
    settled: false,
  };

  const settle = (): void => {
    entry.settled = true;
  };
  entry.promise.then(settle, settle);

  return entry;
}

/**
 * Attach a caller to a shared in-flight request. Returns a promise for an
 * independent clone of the shared response. When the caller's signal
 * aborts, only this caller rejects with ABORTED; the underlying request
 * is aborted once no active callers remain.
 */
export function attachCaller(
  entry: InFlightRequest,
  signal: AbortSignal | undefined,
  url: string
): Promise<Response> {
  if (signal?.aborted === true) {
    return Promise.reject(RequestError.aborted(url));
  }

  entry.activeCallers++;
  entry.totalCallers++;

  const shared = entry.promise.then(
    (response) => response.clone(),
    (error: unknown) => {
      // The shared execution rejects with RequestError; wrap defensively
      // so every caller sees the same error contract
      throw error instanceof Error ? error : RequestError.requestFailed(url, error);
    }
  );

  if (signal === undefined) {
    return shared;
  }

  return new Promise<Response>((resolve, reject) => {
    const onAbort = (): void => {
      entry.activeCallers--;
      if (entry.activeCallers === 0 && !entry.settled) {
        entry.controller.abort();
      }
      reject(RequestError.aborted(url));
    };

    signal.addEventListener('abort', onAbort, { once: true });

    shared.then(
      (response) => {
        signal.removeEventListener('abort', onAbort);
        resolve(response);
      },
      // The shared promise's rejection path already guarantees an Error
      (error: Error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}
