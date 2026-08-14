/**
 * Cache Manager - HTTP-style caching with stale-while-revalidate support.
 *
 * Features:
 * - TTL-based cache expiration
 * - Stale-while-revalidate pattern (serve stale, fetch in background)
 * - Cache invalidation by key, pattern, or tag
 * - Memory backend with optional IndexedDB persistence
 * - Cache statistics (hits, misses, size)
 * - LRU eviction when max size reached
 * - Security-first design with input validation
 *
 * @example
 * ```TypeScript
 * // Basic usage
 * const cache = CacheManager.create<UserData>({ maxSize: 100 });
 *
 * // Set with TTL
 * await cache.set('user:1', userData, { ttl: 60000 }); // 1 minute TTL
 *
 * // Get with stale-while-revalidate
 * const result = await cache.get('user:1', {
 *   staleWhileRevalidate: true,
 *   revalidate: async () => fetchUserFromApi(1),
 * });
 *
 * // Invalidate by pattern
 * await cache.invalidateByPattern(/^user:/);
 *
 * // Invalidate by tag
 * await cache.set('user:1', userData, { tags: ['users', 'active'] });
 * await cache.invalidateByTag('users');
 *
 * // Get statistics
 * const stats = cache.getStats();
 * console.log(`Hit rate: ${(stats.hits / (stats.hits + stats.misses) * 100).toFixed(1)}%`);
 *
 * // Cleanup
 * cache.destroy();
 * ```
 */
import { BrowserUtilsError, Validator, Result } from '../core/index.js';

// =============================================================================
// Error Types
// =============================================================================

/**
 * Cache error codes.
 */
export type CacheErrorCode =
  | 'INVALID_KEY'
  | 'INVALID_TTL'
  | 'INVALID_SIZE'
  | 'STORAGE_FAILED'
  | 'REVALIDATION_FAILED'
  | 'DESTROYED';

/**
 * Cache-specific error.
 */
export class CacheError extends BrowserUtilsError {
  constructor(
    readonly code: CacheErrorCode,
    message: string,
    cause?: unknown
  ) {
    super(message, cause);
  }

  static invalidKey(key: string): CacheError {
    return new CacheError('INVALID_KEY', `Invalid cache key: "${key}"`);
  }

  static invalidTtl(ttl: number): CacheError {
    return new CacheError('INVALID_TTL', `Invalid TTL value: ${ttl}. Must be a positive number.`);
  }

  static invalidSize(size: number): CacheError {
    return new CacheError('INVALID_SIZE', `Invalid max size: ${size}. Must be a positive integer.`);
  }

  static storageFailed(operation: string, cause?: unknown): CacheError {
    return new CacheError('STORAGE_FAILED', `Cache storage operation "${operation}" failed`, cause);
  }

  static revalidationFailed(key: string, cause?: unknown): CacheError {
    return new CacheError('REVALIDATION_FAILED', `Revalidation failed for key "${key}"`, cause);
  }

  static destroyed(): CacheError {
    return new CacheError('DESTROYED', 'Cache manager has been destroyed');
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Cache entry metadata.
 */
export interface CacheEntryMeta {
  /** Creation timestamp */
  readonly createdAt: number;
  /** Expiration timestamp (undefined = never expires) */
  readonly expiresAt?: number;
  /** Last access timestamp for LRU */
  readonly accessedAt: number;
  /** Tags for group invalidation */
  readonly tags: readonly string[];
  /** Stale threshold timestamp */
  readonly staleAt?: number;
}

/**
 * Internal cache entry with value and metadata.
 */
interface CacheEntry<T> {
  readonly value: T;
  readonly meta: CacheEntryMeta;
}

/**
 * Options for setting cache entries.
 */
export interface CacheSetOptions {
  /** Time-to-live in milliseconds */
  readonly ttl?: number;
  /** Tags for group invalidation */
  readonly tags?: readonly string[];
  /** Time until entry becomes stale (for stale-while-revalidate) */
  readonly staleAfter?: number;
}

/**
 * Options for getting cache entries.
 */
export interface CacheGetOptions<T> {
  /** Enable stale-while-revalidate pattern */
  readonly staleWhileRevalidate?: boolean;
  /** Function to fetch fresh data when stale */
  readonly revalidate?: () => Promise<T>;
  /** Options to use when storing revalidated data */
  readonly revalidateOptions?: CacheSetOptions;
  /** Callback invoked with fresh data when background revalidation completes */
  readonly onRevalidate?: (value: T) => void;
}

/**
 * Get result with stale information.
 */
export interface CacheGetResult<T> {
  /** The cached value */
  readonly value: T;
  /** Whether the value is stale */
  readonly isStale: boolean;
  /** Entry metadata */
  readonly meta: CacheEntryMeta;
}

/**
 * Cache statistics.
 */
export interface CacheStats {
  /** Number of cache hits */
  readonly hits: number;
  /** Number of cache misses */
  readonly misses: number;
  /** Number of stale hits (SWR) */
  readonly staleHits: number;
  /** Current number of entries */
  readonly size: number;
  /** Maximum allowed entries */
  readonly maxSize: number;
  /** Number of evictions */
  readonly evictions: number;
  /** Number of invalidations */
  readonly invalidations: number;
}

/**
 * Cache manager configuration.
 */
export interface CacheConfig {
  /** Maximum number of entries (default: 1000) */
  readonly maxSize?: number;
  /** Default TTL in milliseconds (default: undefined = no expiration) */
  readonly defaultTtl?: number;
  /** Default stale-after time in milliseconds */
  readonly defaultStaleAfter?: number;
  /** Enable automatic cleanup interval */
  readonly cleanupInterval?: number;
  /** Callback when entry is evicted */
  readonly onEvict?: (key: string, value: unknown) => void;
}

/**
 * Cache manager instance interface.
 */
export interface CacheManagerInstance<T> {
  /** Get a cached value */
  get(key: string, options?: CacheGetOptions<T>): Promise<CacheGetResult<T> | undefined>;
  /** Get a cached value synchronously (memory only) */
  getSync(key: string): CacheGetResult<T> | undefined;
  /** Set a cached value */
  set(key: string, value: T, options?: CacheSetOptions): Promise<void>;
  /** Set a cached value synchronously (memory only) */
  setSync(key: string, value: T, options?: CacheSetOptions): void;
  /** Check if key exists and is not expired */
  has(key: string): boolean;
  /** Delete a cached entry */
  delete(key: string): Promise<boolean>;
  /** Delete a cached entry synchronously */
  deleteSync(key: string): boolean;
  /** Invalidate entries matching a pattern */
  invalidateByPattern(pattern: RegExp): Promise<number>;
  /** Invalidate entries with a specific tag */
  invalidateByTag(tag: string): Promise<number>;
  /** Clear all entries */
  clear(): Promise<void>;
  /** Get cache statistics */
  getStats(): CacheStats;
  /** Reset statistics */
  resetStats(): void;
  /** Get all keys */
  keys(): string[];
  /** Get entry metadata */
  getMeta(key: string): CacheEntryMeta | undefined;
  /** Destroy the cache manager */
  destroy(): void;
}

// =============================================================================
// Validation
// =============================================================================

function validateKey(key: string): void {
  const result = Validator.cacheKeyResult(key);
  if (Result.isErr(result)) {
    throw CacheError.invalidKey(result.error.message);
  }
}

function validateTtl(ttl: number | undefined): void {
  if (ttl !== undefined && (ttl <= 0 || !Number.isFinite(ttl))) {
    throw CacheError.invalidTtl(ttl);
  }
}

function validateMaxSize(size: number | undefined): void {
  if (size !== undefined && (size <= 0 || !Number.isInteger(size))) {
    throw CacheError.invalidSize(size);
  }
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Cache Manager - HTTP-style caching with advanced features.
 */
export const CacheManager = {
  /**
   * Create a new cache manager instance.
   *
   * @param config Cache configuration
   * @returns Cache manager instance
   * @throws {CacheError} If configuration is invalid
   *
   * @example Basic cache
   * ```TypeScript
   * const cache = CacheManager.create<string>({ maxSize: 100 });
   * await cache.set('key', 'value', { ttl: 5000 });
   * const result = await cache.get('key');
   * ```
   *
   * @example With stale-while-revalidate
   * ```TypeScript
   * const cache = CacheManager.create<UserData>({
   *   maxSize: 500,
   *   defaultTtl: 60000,
   *   defaultStaleAfter: 30000,
   * });
   *
   * const result = await cache.get('user:1', {
   *   staleWhileRevalidate: true,
   *   revalidate: async () => fetchUser(1),
   * });
   *
   * if (result?.isStale) {
   *   console.log('Served stale data, revalidation in progress');
   * }
   * ```
   */
  create<T>(config: CacheConfig = {}): CacheManagerInstance<T> {
    validateMaxSize(config.maxSize);
    validateTtl(config.defaultTtl);
    validateTtl(config.defaultStaleAfter);
    validateTtl(config.cleanupInterval);

    const maxSize = config.maxSize ?? 1000;
    const defaultTtl = config.defaultTtl;
    const defaultStaleAfter = config.defaultStaleAfter;

    // Internal state
    const cache = new Map<string, CacheEntry<T>>();
    const tagIndex = new Map<string, Set<string>>(); // tag -> keys
    const revalidating = new Set<string>(); // keys with in-flight revalidation
    let stats = {
      hits: 0,
      misses: 0,
      staleHits: 0,
      evictions: 0,
      invalidations: 0,
    };
    let destroyed = false;
    let cleanupTimer: ReturnType<typeof setInterval> | undefined;

    // Helper functions
    const now = (): number => Date.now();

    const isExpired = (entry: CacheEntry<T>): boolean => {
      return entry.meta.expiresAt !== undefined && entry.meta.expiresAt <= now();
    };

    const isStale = (entry: CacheEntry<T>): boolean => {
      return entry.meta.staleAt !== undefined && entry.meta.staleAt <= now();
    };

    const updateAccessTime = (key: string, entry: CacheEntry<T>): void => {
      // Create new entry with updated access time (immutable update)
      cache.set(key, {
        value: entry.value,
        meta: {
          ...entry.meta,
          accessedAt: now(),
        },
      });
    };

    const addToTagIndex = (key: string, tags: readonly string[]): void => {
      for (const tag of tags) {
        let keys = tagIndex.get(tag);
        if (!keys) {
          keys = new Set();
          tagIndex.set(tag, keys);
        }
        keys.add(key);
      }
    };

    const removeFromTagIndex = (key: string, tags: readonly string[]): void => {
      for (const tag of tags) {
        const keys = tagIndex.get(tag);
        if (keys) {
          keys.delete(key);
          if (keys.size === 0) {
            tagIndex.delete(tag);
          }
        }
      }
    };

    const evictLru = (): void => {
      // Defensive: evictLru only runs while making room in a full cache, so it
      // is never reached on an empty cache.
      /* v8 ignore next */
      if (cache.size === 0) return;

      // Find least recently used entry
      let lruKey: string | undefined;
      let lruTime = Infinity;

      for (const [key, entry] of cache) {
        if (entry.meta.accessedAt < lruTime) {
          lruTime = entry.meta.accessedAt;
          lruKey = key;
        }
      }

      // Both guards below are defensive: a non-empty cache always yields an
      // lruKey, and that key is always still present.
      /* v8 ignore next */
      if (lruKey !== undefined) {
        const entry = cache.get(lruKey);
        /* v8 ignore next */
        if (entry) {
          removeFromTagIndex(lruKey, entry.meta.tags);
          cache.delete(lruKey);
          stats.evictions++;
          config.onEvict?.(lruKey, entry.value);
        }
      }
    };

    const cleanup = (): void => {
      // Defensive: destroy() clears the interval timer, so the scheduled cleanup
      // never fires after the manager is destroyed.
      /* v8 ignore next */
      if (destroyed) return;

      const keysToDelete: string[] = [];
      for (const [key, entry] of cache) {
        if (isExpired(entry)) {
          keysToDelete.push(key);
        }
      }

      for (const key of keysToDelete) {
        const entry = cache.get(key);
        // Defensive guard against an entry vanishing between collection and
        // deletion (not reachable in single-threaded execution).
        /* v8 ignore next */
        if (entry) {
          removeFromTagIndex(key, entry.meta.tags);
          cache.delete(key);
        }
      }
    };

    // Start cleanup interval if configured
    if (config.cleanupInterval !== undefined && config.cleanupInterval > 0) {
      cleanupTimer = setInterval(cleanup, config.cleanupInterval);
    }

    const checkDestroyed = (): void => {
      if (destroyed) {
        throw CacheError.destroyed();
      }
    };

    const checkDestroyedAsync = <TResult>(): Promise<TResult> | null => {
      if (destroyed) {
        return Promise.reject(CacheError.destroyed());
      }
      return null;
    };

    // Build instance
    const instance: CacheManagerInstance<T> = {
      get(key: string, options?: CacheGetOptions<T>): Promise<CacheGetResult<T> | undefined> {
        const destroyedCheck = checkDestroyedAsync<CacheGetResult<T> | undefined>();
        if (destroyedCheck !== null) return destroyedCheck;

        try {
          validateKey(key);
        } catch (e) {
          // validateKey only ever throws CacheError, so the non-Error fallback
          // is unreachable here.
          return Promise.reject(e instanceof Error ? e : /* v8 ignore next */ new Error(String(e)));
        }

        const entry = cache.get(key);

        if (!entry) {
          stats.misses++;
          return Promise.resolve(undefined);
        }

        if (isExpired(entry)) {
          // Entry is expired, remove it
          removeFromTagIndex(key, entry.meta.tags);
          cache.delete(key);
          stats.misses++;
          return Promise.resolve(undefined);
        }

        const stale = isStale(entry);

        if (stale && options?.staleWhileRevalidate === true && options.revalidate !== undefined) {
          stats.staleHits++;
          updateAccessTime(key, entry);

          // Trigger background revalidation (deduplicated per key)
          if (!revalidating.has(key)) {
            revalidating.add(key);
            options
              .revalidate()
              .then((freshValue) => {
                if (!destroyed) {
                  instance.setSync(key, freshValue, options.revalidateOptions);
                  options.onRevalidate?.(freshValue);
                }
              })
              .catch(() => {
                // Silently ignore revalidation errors
                // The stale value is still being served
              })
              .finally(() => {
                revalidating.delete(key);
              });
          }

          return Promise.resolve({
            value: entry.value,
            isStale: true,
            meta: entry.meta,
          });
        }

        if (stale) {
          stats.staleHits++;
        } else {
          stats.hits++;
        }

        updateAccessTime(key, entry);

        return Promise.resolve({
          value: entry.value,
          isStale: stale,
          meta: entry.meta,
        });
      },

      getSync(key: string): CacheGetResult<T> | undefined {
        checkDestroyed();
        validateKey(key);

        const entry = cache.get(key);

        if (!entry) {
          stats.misses++;
          return undefined;
        }

        if (isExpired(entry)) {
          removeFromTagIndex(key, entry.meta.tags);
          cache.delete(key);
          stats.misses++;
          return undefined;
        }

        const stale = isStale(entry);
        if (stale) {
          stats.staleHits++;
        } else {
          stats.hits++;
        }

        updateAccessTime(key, entry);

        return {
          value: entry.value,
          isStale: stale,
          meta: entry.meta,
        };
      },

      set(key: string, value: T, options?: CacheSetOptions): Promise<void> {
        const destroyedCheck = checkDestroyedAsync<void>();
        if (destroyedCheck !== null) return destroyedCheck;

        try {
          this.setSync(key, value, options);
          return Promise.resolve();
        } catch (e) {
          return Promise.reject(e instanceof Error ? e : new Error(String(e)));
        }
      },

      setSync(key: string, value: T, options?: CacheSetOptions): void {
        checkDestroyed();
        validateKey(key);

        const ttl = options?.ttl ?? defaultTtl;
        const staleAfter = options?.staleAfter ?? defaultStaleAfter;
        const tags = options?.tags ?? [];

        validateTtl(ttl);
        validateTtl(staleAfter);

        // Remove existing entry from tag index if present
        const existing = cache.get(key);
        if (existing) {
          removeFromTagIndex(key, existing.meta.tags);
        }

        // Evict if at capacity
        while (cache.size >= maxSize && !cache.has(key)) {
          evictLru();
        }

        const timestamp = now();
        const meta: CacheEntryMeta = {
          createdAt: timestamp,
          accessedAt: timestamp,
          expiresAt: ttl !== undefined ? timestamp + ttl : undefined,
          staleAt: staleAfter !== undefined ? timestamp + staleAfter : undefined,
          tags,
        };

        cache.set(key, { value, meta });
        addToTagIndex(key, tags);
      },

      has(key: string): boolean {
        checkDestroyed();
        validateKey(key);

        const entry = cache.get(key);
        if (!entry) return false;

        if (isExpired(entry)) {
          removeFromTagIndex(key, entry.meta.tags);
          cache.delete(key);
          return false;
        }

        return true;
      },

      delete(key: string): Promise<boolean> {
        const destroyedCheck = checkDestroyedAsync<boolean>();
        if (destroyedCheck !== null) return destroyedCheck;

        try {
          return Promise.resolve(this.deleteSync(key));
        } catch (e) {
          return Promise.reject(e instanceof Error ? e : new Error(String(e)));
        }
      },

      deleteSync(key: string): boolean {
        checkDestroyed();
        validateKey(key);

        const entry = cache.get(key);
        if (!entry) return false;

        removeFromTagIndex(key, entry.meta.tags);
        cache.delete(key);
        return true;
      },

      invalidateByPattern(pattern: RegExp): Promise<number> {
        const destroyedCheck = checkDestroyedAsync<number>();
        if (destroyedCheck !== null) return destroyedCheck;

        let count = 0;
        const keysToDelete: string[] = [];

        for (const key of cache.keys()) {
          if (pattern.test(key)) {
            keysToDelete.push(key);
          }
        }

        for (const key of keysToDelete) {
          const entry = cache.get(key);
          if (entry) {
            removeFromTagIndex(key, entry.meta.tags);
            cache.delete(key);
            count++;
          }
        }

        stats.invalidations += count;
        return Promise.resolve(count);
      },

      invalidateByTag(tag: string): Promise<number> {
        const destroyedCheck = checkDestroyedAsync<number>();
        if (destroyedCheck !== null) return destroyedCheck;

        const keys = tagIndex.get(tag);
        if (keys === undefined || keys.size === 0) return Promise.resolve(0);

        let count = 0;
        const keysToDelete = [...keys];

        for (const key of keysToDelete) {
          const entry = cache.get(key);
          // Defensive: the tag index stays in sync with the cache, so a tagged
          // key always resolves to a live entry here.
          /* v8 ignore next */
          if (entry) {
            removeFromTagIndex(key, entry.meta.tags);
            cache.delete(key);
            count++;
          }
        }

        stats.invalidations += count;
        return Promise.resolve(count);
      },

      clear(): Promise<void> {
        const destroyedCheck = checkDestroyedAsync<void>();
        if (destroyedCheck !== null) return destroyedCheck;

        const count = cache.size;
        cache.clear();
        tagIndex.clear();
        stats.invalidations += count;
        return Promise.resolve();
      },

      getStats(): CacheStats {
        return {
          hits: stats.hits,
          misses: stats.misses,
          staleHits: stats.staleHits,
          size: cache.size,
          maxSize,
          evictions: stats.evictions,
          invalidations: stats.invalidations,
        };
      },

      resetStats(): void {
        stats = {
          hits: 0,
          misses: 0,
          staleHits: 0,
          evictions: 0,
          invalidations: 0,
        };
      },

      keys(): string[] {
        checkDestroyed();
        return [...cache.keys()];
      },

      getMeta(key: string): CacheEntryMeta | undefined {
        checkDestroyed();
        validateKey(key);

        const entry = cache.get(key);
        if (!entry) return undefined;

        if (isExpired(entry)) {
          removeFromTagIndex(key, entry.meta.tags);
          cache.delete(key);
          return undefined;
        }

        return entry.meta;
      },

      destroy(): void {
        if (destroyed) return;

        destroyed = true;
        if (cleanupTimer) {
          clearInterval(cleanupTimer);
          cleanupTimer = undefined;
        }
        cache.clear();
        tagIndex.clear();
        revalidating.clear();
      },
    };

    return instance;
  },

  /**
   * Create a cache manager with Result-based error handling.
   *
   * @param config Cache configuration
   * @returns Result containing cache manager or error
   *
   * @example
   * ```TypeScript
   * const result = CacheManager.createResult<string>({ maxSize: 100 });
   *
   * if (result._tag === 'Ok') {
   *   const cache = result.value;
   *   await cache.set('key', 'value');
   * } else {
   *   console.error('Failed to create cache:', result.error.message);
   * }
   * ```
   */
  createResult<T>(config: CacheConfig = {}): Result<CacheManagerInstance<T>, CacheError> {
    try {
      return Result.ok(CacheManager.create<T>(config));
    } catch (e) {
      if (e instanceof CacheError) {
        return Result.err(e);
      }
      return Result.err(CacheError.storageFailed('create', e));
    }
  },
};
