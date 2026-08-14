/**
 * Offline Queue - Queue operations for offline-first applications with IndexedDB persistence.
 *
 * Features:
 * - IndexedDB persistence for durability across page reloads
 * - Auto-sync when coming back online
 * - Optional rate limiting (prevents reconnect storms)
 * - Conflict resolution strategies (last-write-wins or custom)
 * - Event-based notifications (onSync, onError, onConflict)
 * - Factory pattern with OfflineQueue.create()
 *
 * @remarks
 * ## Queue Lifecycle
 *
 * ```text
 * ┌──────────┐
 * │   idle   │◄──────────────────────────────┐
 * └────┬─────┘                               │
 *      │                                     │
 *      │ add() called OR                     │
 *      │ network online event                │
 *      ▼                                     │
 * ┌──────────┐                               │
 * │processing│                               │
 * └────┬─────┘                               │
 *      │                                     │
 *      │ queue.size > 0                      │
 *      ▼                                     │
 * ┌──────────┐                               │
 * │ syncing  │                               │
 * └────┬─────┘                               │
 *      │                                     │
 *      │ All items processed OR              │
 *      │ network offline OR                  │
 *      │ destroyed                           │
 *      └─────────────────────────────────────┘
 * ```
 *
 * ## Online/Offline State Handling
 *
 * ```text
 * Queue created
 *      │
 *      ▼
 * autoSync=true? ──no──► (manual sync only)
 *      │ yes
 *      ▼
 * Register network listener
 *      │
 *      ├──► Network online event
 *      │         │
 *      │         ▼
 *      │    Schedule sync after syncDelay
 *      │         │
 *      │         └──► Trigger sync
 *      │
 *      └──► Network offline event
 *                │
 *                └──► Cancel pending sync, wait for online
 *
 * Manual sync():
 *      │
 *      ▼
 * isOnline()? ──no──► Return (no-op)
 *      │ yes
 *      └──► Trigger sync immediately
 * ```
 *
 * ## Item Processing Flow
 *
 * ```text
 * syncAll() triggered
 *      │
 *      ▼
 * syncing=true? ──yes──► Return (already syncing)
 *      │ no
 *      ▼
 * isOnline()? ──no──► Return (offline)
 *      │ yes
 *      ▼
 * syncing = true
 *      │
 *      ▼
 * Load all items from IndexedDB
 *      │
 *      ▼
 * Sort by priority (asc), then createdAt (asc)
 *      │
 *      └──► For each item:
 *              │
 *              ├──► destroyed? ──yes──► Break loop
 *              │         no
 *              ├──► isOnline()? ──no──► Break loop
 *              │         yes
 *              ▼
 *         Rate limit enabled?
 *              │
 *              ├──no──► Process item
 *              │
 *              └──yes──► checkRateLimit()
 *                           │
 *                           ├──pass──► Process item
 *                           │
 *                           └──fail──► Calculate delay
 *                                       │
 *                                       ▼
 *                                   Wait delay ms
 *                                       │
 *                                       ▼
 *                                  Re-check limit
 *                                       │
 *                                       ├──pass──► Process item
 *                                       │
 *                                       └──fail──► Schedule sync, break loop
 * Finally:
 *   syncing = false
 * ```
 *
 * ## Single Item Processing
 *
 * ```text
 * processItem(item)
 *      │
 *      ▼
 * Call processor(item.data)
 *      │
 *      ├──success──► Delete from IndexedDB
 *      │               │
 *      │               ▼
 *      │          Emit onSync event
 *      │               │
 *      │               ▼
 *      │          Record operation timestamp (rate limiting)
 *      │               │
 *      │               └──► Return true
 *      │
 *      └──error──► Increment retryCount
 *                     │
 *                     ▼
 *                retryCount >= maxRetries?
 *                     │
 *                     ├──yes──► Delete from IndexedDB
 *                     │             │
 *                     │             ▼
 *                     │        Emit onError event
 *                     │             │
 *                     │             └──► Return false
 *                     │
 *                     └──no──► Update item in IndexedDB
 *                                 (new retryCount, lastError)
 *                                    │
 *                                    ▼
 *                               Emit onError event
 *                                    │
 *                                    └──► Return false
 * ```
 *
 * ## Rate Limit Integration
 *
 * ```text
 * Rate limit configured?
 *      │
 *      ├──no──► Process all items without restriction
 *      │
 *      └──yes──► Track operation timestamps[]
 *                     │
 *                     └──► Before each processItem():
 *                             │
 *                             ▼
 *                        checkRateLimit()
 *                             │
 *                             ▼
 *                        Remove timestamps older than windowMs
 *                             │
 *                             ▼
 *                        timestamps.length < maxRequestsPerWindow?
 *                             │
 *                             ├──yes──► Allow (return true)
 *                             │
 *                             └──no──► Calculate delay until oldest expires
 *                                         │
 *                                         └──► Return false, delay value
 *
 * After successful processItem():
 *   recordOperation()
 *      │
 *      └──► Push Date.now() to timestamps[]
 * ```
 *
 * @example Basic usage
 * ```TypeScript
 * // Create queue with default last-write-wins strategy
 * const queue = await OfflineQueue.create<ApiRequest>({
 *   name: 'api-requests',
 *   processor: async (item) => {
 *     await fetch(item.url, { method: item.method, body: item.body });
 *   },
 * });
 *
 * // Add items to queue (persisted in IndexedDB)
 * await queue.add({ url: '/api/data', method: 'POST', body: '{}' });
 *
 * // Subscribe to events
 * queue.onSync((item) => console.log('Synced:', item));
 * queue.onError((error, item) => console.error('Failed:', error, item));
 *
 * // Clean up when done
 * queue.destroy();
 * ```
 *
 * @example With rate limiting
 * ```TypeScript
 * // Limit sync to 20 items per 10 seconds to prevent overwhelming the server
 * const queue = await OfflineQueue.create({
 *   name: 'api-requests',
 *   processor: async (item) => {
 *     await fetch(item.url, { method: item.method, body: item.body });
 *   },
 *   rateLimit: {
 *     maxRequestsPerWindow: 20,
 *     windowMs: 10000,
 *   },
 * });
 * ```
 */
import { BrowserUtilsError, generateUUID, CryptoError, type CleanupFn } from '../core/index.js';
import { IndexedDBManager, type IndexedDBInstance } from '../indexeddb/index.js';
import { NetworkStatus } from '../network/index.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Offline queue error codes.
 */
export type OfflineQueueErrorCode =
  'NOT_SUPPORTED' | 'DATABASE_ERROR' | 'PROCESSOR_ERROR' | 'CRYPTO_UNAVAILABLE' | 'QUEUE_DESTROYED';

/**
 * Offline queue-specific error.
 */
export class OfflineQueueError extends BrowserUtilsError {
  constructor(
    readonly code: OfflineQueueErrorCode,
    message: string,
    cause?: unknown
  ) {
    super(message, cause);
  }

  static notSupported(): OfflineQueueError {
    return new OfflineQueueError(
      'NOT_SUPPORTED',
      'OfflineQueue requires IndexedDB support which is not available'
    );
  }

  static databaseError(operation: string, cause?: unknown): OfflineQueueError {
    return new OfflineQueueError(
      'DATABASE_ERROR',
      `Database operation "${operation}" failed`,
      cause
    );
  }

  static processorError(cause?: unknown): OfflineQueueError {
    return new OfflineQueueError('PROCESSOR_ERROR', 'Queue item processor failed', cause);
  }

  static cryptoUnavailable(): OfflineQueueError {
    return new OfflineQueueError(
      'CRYPTO_UNAVAILABLE',
      'Crypto API is not available. Secure random ID generation requires crypto.randomUUID() or crypto.getRandomValues()'
    );
  }

  static queueDestroyed(): OfflineQueueError {
    return new OfflineQueueError('QUEUE_DESTROYED', 'Queue has been destroyed');
  }
}

/**
 * Conflict resolution result.
 */
export type ConflictResolution<T> = 'keep-local' | 'keep-remote' | { merged: T };

/**
 * Conflict resolution strategy.
 */
export type ConflictResolver<T> = (local: T, remote: T) => ConflictResolution<T>;

/**
 * Queue item processor function.
 * Should throw if processing fails (item will be retried).
 */
export type ItemProcessor<T> = (item: T) => Promise<void>;

/**
 * Stored queue item with metadata.
 */
export interface QueueItem<T> {
  /** Unique item identifier */
  readonly id: string;
  /** The queued data */
  readonly data: T;
  /** Timestamp when item was added (ms since epoch) */
  readonly createdAt: number;
  /** Number of retry attempts */
  readonly retryCount: number;
  /** Last error message if any */
  readonly lastError?: string;
  /** Priority (lower = higher priority) */
  readonly priority: number;
}

/**
 * Configuration for creating an offline queue.
 */
export interface OfflineQueueConfig<T> {
  /** Queue name (used as database name) */
  readonly name: string;
  /** Function to process queue items when online */
  readonly processor: ItemProcessor<T>;
  /** Conflict resolution strategy (default: last-write-wins) */
  readonly conflictResolver?: ConflictResolver<T>;
  /** Maximum retry attempts before item is discarded (default: 3) */
  readonly maxRetries?: number;
  /** Delay between sync attempts in ms (default: 1000) */
  readonly syncDelay?: number;
  /** Auto-sync when coming online (default: true) */
  readonly autoSync?: boolean;
  /**
   * Rate limiting configuration (optional, disabled by default).
   * Limits how many items can be processed within a time window
   * to prevent reconnect storms.
   */
  readonly rateLimit?: {
    /**
     * Maximum number of items allowed to be processed in the time window.
     */
    readonly maxRequestsPerWindow: number;
    /**
     * Time window in milliseconds.
     */
    readonly windowMs: number;
  };
}

/**
 * Queue statistics.
 */
export interface QueueStats {
  /** Number of items in queue */
  readonly size: number;
  /** Number of items that have failed at least once */
  readonly failedCount: number;
  /** Whether queue is currently syncing */
  readonly isSyncing: boolean;
  /** Whether network is online */
  readonly isOnline: boolean;
}

/**
 * Sync event handler.
 */
export type SyncHandler<T> = (item: QueueItem<T>) => void;

/**
 * Error event handler.
 */
export type ErrorHandler<T> = (error: OfflineQueueError, item: QueueItem<T>) => void;

/**
 * Conflict event handler.
 */
export type ConflictHandler<T> = (resolution: ConflictResolution<T>, local: T, remote: T) => void;

/**
 * Offline queue instance.
 */
export interface OfflineQueueInstance<T> {
  /** Queue name */
  readonly name: string;

  /**
   * Add an item to the queue.
   *
   * @param data Item data to queue
   * @param priority Priority (lower = higher priority, default: 0)
   * @returns The created queue item
   */
  add(data: T, priority?: number): Promise<QueueItem<T>>;

  /**
   * Remove an item from the queue.
   *
   * @param id Item ID to remove
   * @returns True if item was removed, false if not found
   */
  remove(id: string): Promise<boolean>;

  /**
   * Peek at the next item in the queue without removing it.
   *
   * @returns The next item or undefined if queue is empty
   */
  peek(): Promise<QueueItem<T> | undefined>;

  /**
   * Clear all items from the queue.
   */
  clear(): Promise<void>;

  /**
   * Get the current queue size.
   */
  size(): Promise<number>;

  /**
   * Get all items in the queue.
   */
  getAll(): Promise<readonly QueueItem<T>[]>;

  /**
   * Get queue statistics.
   */
  getStats(): Promise<QueueStats>;

  /**
   * Manually trigger sync (processes all queued items).
   * Will only process if online.
   */
  sync(): Promise<void>;

  /**
   * Subscribe to sync events (called when item is successfully processed).
   *
   * @param handler Sync event handler
   * @returns Cleanup function to unsubscribe
   */
  onSync(handler: SyncHandler<T>): CleanupFn;

  /**
   * Subscribe to error events (called when item processing fails).
   *
   * @param handler Error event handler
   * @returns Cleanup function to unsubscribe
   */
  onError(handler: ErrorHandler<T>): CleanupFn;

  /**
   * Subscribe to conflict events.
   *
   * @param handler Conflict event handler
   * @returns Cleanup function to unsubscribe
   */
  onConflict(handler: ConflictHandler<T>): CleanupFn;

  /**
   * Resolve a conflict between local and remote data.
   * Uses the configured conflict resolver.
   *
   * @param local Local data
   * @param remote Remote data
   * @returns Conflict resolution result
   */
  resolveConflict(local: T, remote: T): ConflictResolution<T>;

  /**
   * Destroy the queue and clean up resources.
   * The queue instance should not be used after calling this.
   */
  destroy(): void;
}

// =============================================================================
// Internal Helpers
// =============================================================================

const STORE_NAME = 'queue';
const DB_VERSION = 1;

/**
 * Generate a unique ID using shared crypto utility.
 * Wraps CryptoError as OfflineQueueError for API consistency.
 */
function generateId(): string {
  try {
    return generateUUID();
  } catch (e) {
    if (e instanceof CryptoError) {
      throw OfflineQueueError.cryptoUnavailable();
    }
    throw e;
  }
}

/**
 * Default conflict resolver: last-write-wins (keep local).
 */
function lastWriteWins<T>(): ConflictResolution<T> {
  return 'keep-local';
}

// =============================================================================
// OfflineQueue
// =============================================================================

export const OfflineQueue = {
  /**
   * Check if OfflineQueue is supported.
   * Requires IndexedDB support.
   *
   * @example
   * ```TypeScript
   * if (OfflineQueue.isSupported()) {
   *   const queue = await OfflineQueue.create(config);
   * } else {
   *   console.warn('OfflineQueue not supported');
   * }
   * ```
   */
  isSupported(): boolean {
    return IndexedDBManager.isSupported();
  },

  /**
   * Create an offline queue instance.
   *
   * @param config Queue configuration
   * @returns Promise resolving to queue instance
   * @throws {OfflineQueueError} When IndexedDB is not supported or database fails to open
   *
   * @example Basic usage
   * ```TypeScript
   * const queue = await OfflineQueue.create({
   *   name: 'my-queue',
   *   processor: async (item) => {
   *     await sendToServer(item);
   *   },
   * });
   *
   * await queue.add({ action: 'create', data: { name: 'test' } });
   * ```
   *
   * @example With custom conflict resolution
   * ```TypeScript
   * const queue = await OfflineQueue.create<Document>({
   *   name: 'documents',
   *   processor: async (doc) => {
   *     await syncDocument(doc);
   *   },
   *   conflictResolver: (local, remote) => {
   *     // Merge by taking newer fields
   *     if (local.updatedAt > remote.updatedAt) {
   *       return 'keep-local';
   *     }
   *     return { merged: { ...remote, ...local } };
   *   },
   * });
   * ```
   *
   * @example With retry configuration
   * ```TypeScript
   * const queue = await OfflineQueue.create({
   *   name: 'api-calls',
   *   processor: apiCall,
   *   maxRetries: 5,
   *   syncDelay: 2000, // 2 seconds between sync attempts
   *   autoSync: true,
   * });
   * ```
   */
  async create<T>(config: OfflineQueueConfig<T>): Promise<OfflineQueueInstance<T>> {
    if (!OfflineQueue.isSupported()) {
      throw OfflineQueueError.notSupported();
    }

    const {
      name,
      processor,
      conflictResolver = lastWriteWins,
      maxRetries = 3,
      syncDelay = 1000,
      autoSync = true,
      rateLimit,
    } = config;

    // Open database
    let db: IndexedDBInstance;
    try {
      db = await IndexedDBManager.open({
        name: `offline-queue-${name}`,
        version: DB_VERSION,
        stores: {
          [STORE_NAME]: {
            keyPath: 'id',
            indexes: {
              byPriority: { keyPath: 'priority' },
              byCreatedAt: { keyPath: 'createdAt' },
            },
          },
        },
      });
    } catch (e) {
      throw OfflineQueueError.databaseError('open', e);
    }

    // State
    let destroyed = false;
    let syncing = false;
    let syncTimeout: ReturnType<typeof setTimeout> | null = null;

    // Rate limiting state
    const operationTimestamps: number[] = [];

    // Event handlers
    const syncHandlers = new Set<SyncHandler<T>>();
    const errorHandlers = new Set<ErrorHandler<T>>();
    const conflictHandlers = new Set<ConflictHandler<T>>();

    // Helper to emit sync events
    const emitSync = (item: QueueItem<T>): void => {
      syncHandlers.forEach((handler) => handler(item));
    };

    // Helper to emit error events
    const emitError = (error: OfflineQueueError, item: QueueItem<T>): void => {
      errorHandlers.forEach((handler) => handler(error, item));
    };

    // Helper to emit conflict events
    const emitConflict = (resolution: ConflictResolution<T>, local: T, remote: T): void => {
      conflictHandlers.forEach((handler) => handler(resolution, local, remote));
    };

    // Sort items by priority and createdAt
    const sortItems = (items: QueueItem<T>[]): QueueItem<T>[] => {
      return items.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.createdAt - b.createdAt;
      });
    };

    // Rate limiting helper: check if we can process another item
    const checkRateLimit = (): boolean => {
      // Defensive guard - callers already check for rateLimit before calling
      /* v8 ignore start */
      if (!rateLimit) {
        return true;
      }
      /* v8 ignore stop */

      const now = Date.now();
      const { windowMs, maxRequestsPerWindow } = rateLimit;

      // Remove timestamps outside the current window
      const cutoff = now - windowMs;
      while (operationTimestamps.length > 0 && operationTimestamps[0]! < cutoff) {
        operationTimestamps.shift();
      }

      // Check if we're within the rate limit
      return operationTimestamps.length < maxRequestsPerWindow;
    };

    // Rate limiting helper: record an operation
    const recordOperation = (): void => {
      if (!rateLimit) {
        return;
      }
      operationTimestamps.push(Date.now());
    };

    // Rate limiting helper: calculate delay when limit is exceeded
    const calculateRateLimitDelay = (): number => {
      // Defensive guard - callers already check for rateLimit before calling
      /* v8 ignore start */
      if (!rateLimit || operationTimestamps.length === 0) {
        return 0;
      }
      /* v8 ignore stop */

      const now = Date.now();
      const { windowMs } = rateLimit;
      const oldestTimestamp = operationTimestamps[0]!;
      const timeUntilExpiry = oldestTimestamp + windowMs - now;

      // Return at least 1ms to avoid busy-waiting
      return Math.max(1, timeUntilExpiry);
    };

    // Delay helper
    const delay = (ms: number): Promise<void> => {
      return new Promise((resolve) => setTimeout(resolve, ms));
    };

    // Process a single item
    const processItem = async (item: QueueItem<T>): Promise<boolean> => {
      try {
        await processor(item.data);
        // Remove from queue on success
        await db.delete(STORE_NAME, item.id);
        emitSync(item);

        // Record operation for rate limiting
        recordOperation();

        return true;
      } catch (e) {
        const newRetryCount = item.retryCount + 1;
        const errorMessage = e instanceof Error ? e.message : String(e);

        if (newRetryCount >= maxRetries) {
          // Max retries exceeded, remove item and emit error
          await db.delete(STORE_NAME, item.id);
          emitError(OfflineQueueError.processorError(e), item);
          return false;
        }

        // Update retry count
        const updatedItem: QueueItem<T> = {
          ...item,
          retryCount: newRetryCount,
          lastError: errorMessage,
        };

        await db.put(STORE_NAME, updatedItem);
        emitError(OfflineQueueError.processorError(e), updatedItem);
        return false;
      }
    };

    // Sync all items
    const syncAll = async (): Promise<void> => {
      if (destroyed || syncing || !NetworkStatus.isOnline()) {
        return;
      }

      syncing = true;

      try {
        const items = await db.getAll<QueueItem<T>>(STORE_NAME);
        const sorted = sortItems([...items]);

        for (const item of sorted) {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- destroyed can change during async operations
          if (destroyed || !NetworkStatus.isOnline()) {
            break;
          }

          // Check rate limit before processing
          if (rateLimit && !checkRateLimit()) {
            // Rate limit exceeded, wait before processing next item
            const delayMs = calculateRateLimitDelay();
            await delay(delayMs);
            // Re-check after delay
            if (!checkRateLimit()) {
              // Still rate limited, break and schedule another sync
              scheduleSync();
              break;
            }
          }

          await processItem(item);
        }
      } finally {
        syncing = false;
      }
    };

    // Schedule sync with delay
    const scheduleSync = (): void => {
      if (destroyed || syncTimeout) {
        return;
      }

      syncTimeout = setTimeout(() => {
        syncTimeout = null;
        void syncAll();
      }, syncDelay);
    };

    // Network status handler
    let networkCleanup: CleanupFn | null = null;

    if (autoSync) {
      networkCleanup = NetworkStatus.onOnline(() => {
        scheduleSync();
      });

      // Initial sync if online
      if (NetworkStatus.isOnline()) {
        scheduleSync();
      }
    }

    // Check if destroyed helper
    const checkDestroyed = (): void => {
      if (destroyed) {
        throw OfflineQueueError.queueDestroyed();
      }
    };

    return {
      get name(): string {
        return name;
      },

      async add(data: T, priority = 0): Promise<QueueItem<T>> {
        checkDestroyed();

        const item: QueueItem<T> = {
          id: generateId(),
          data,
          createdAt: Date.now(),
          retryCount: 0,
          priority,
        };

        try {
          await db.add(STORE_NAME, item);
        } catch (e) {
          throw OfflineQueueError.databaseError('add', e);
        }

        // Schedule sync if online
        if (autoSync && NetworkStatus.isOnline()) {
          scheduleSync();
        }

        return item;
      },

      async remove(id: string): Promise<boolean> {
        checkDestroyed();

        try {
          const existing = await db.get<QueueItem<T>>(STORE_NAME, id);
          if (!existing) {
            return false;
          }
          await db.delete(STORE_NAME, id);
          return true;
        } catch (e) {
          throw OfflineQueueError.databaseError('remove', e);
        }
      },

      async peek(): Promise<QueueItem<T> | undefined> {
        checkDestroyed();

        try {
          const items = await db.getAll<QueueItem<T>>(STORE_NAME);
          if (items.length === 0) {
            return undefined;
          }
          const sorted = sortItems([...items]);
          return sorted[0];
        } catch (e) {
          throw OfflineQueueError.databaseError('peek', e);
        }
      },

      async clear(): Promise<void> {
        checkDestroyed();

        try {
          await db.clear(STORE_NAME);
        } catch (e) {
          throw OfflineQueueError.databaseError('clear', e);
        }
      },

      async size(): Promise<number> {
        checkDestroyed();

        try {
          return await db.count(STORE_NAME);
        } catch (e) {
          throw OfflineQueueError.databaseError('size', e);
        }
      },

      async getAll(): Promise<readonly QueueItem<T>[]> {
        checkDestroyed();

        try {
          const items = await db.getAll<QueueItem<T>>(STORE_NAME);
          return sortItems([...items]);
        } catch (e) {
          throw OfflineQueueError.databaseError('getAll', e);
        }
      },

      async getStats(): Promise<QueueStats> {
        checkDestroyed();

        try {
          const items = await db.getAll<QueueItem<T>>(STORE_NAME);
          const failedCount = items.filter((item) => item.retryCount > 0).length;

          return {
            size: items.length,
            failedCount,
            isSyncing: syncing,
            isOnline: NetworkStatus.isOnline(),
          };
        } catch (e) {
          throw OfflineQueueError.databaseError('getStats', e);
        }
      },

      async sync(): Promise<void> {
        checkDestroyed();
        await syncAll();
      },

      onSync(handler: SyncHandler<T>): CleanupFn {
        syncHandlers.add(handler);
        return () => syncHandlers.delete(handler);
      },

      onError(handler: ErrorHandler<T>): CleanupFn {
        errorHandlers.add(handler);
        return () => errorHandlers.delete(handler);
      },

      onConflict(handler: ConflictHandler<T>): CleanupFn {
        conflictHandlers.add(handler);
        return () => conflictHandlers.delete(handler);
      },

      resolveConflict(local: T, remote: T): ConflictResolution<T> {
        const resolution = conflictResolver(local, remote);
        emitConflict(resolution, local, remote);
        return resolution;
      },

      destroy(): void {
        if (destroyed) {
          return;
        }

        destroyed = true;

        // Clear timeout
        if (syncTimeout) {
          clearTimeout(syncTimeout);
          syncTimeout = null;
        }

        // Remove network listener
        if (networkCleanup) {
          networkCleanup();
          networkCleanup = null;
        }

        // Close database
        db.close();

        // Clear all handlers
        syncHandlers.clear();
        errorHandlers.clear();
        conflictHandlers.clear();
      },
    };
  },
};
