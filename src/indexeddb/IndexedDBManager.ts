/**
 * IndexedDB Manager - Type-safe wrapper for IndexedDB operations.
 *
 * Features:
 * - Promise-based API (no callbacks)
 * - Type-safe store operations
 * - Automatic connection management
 * - Transaction helpers
 * - Error handling with Result type
 *
 * @example
 * ```TypeScript
 * // Create manager
 * const db = await IndexedDBManager.open({
 *   name: 'myApp',
 *   version: 1,
 *   stores: {
 *     users: { keyPath: 'id', autoIncrement: true },
 *     settings: { keyPath: 'key' },
 *   },
 * });
 *
 * // Store operations
 * await db.put('users', { id: 1, name: 'John' });
 * const user = await db.get('users', 1);
 * await db.delete('users', 1);
 *
 * // Transactions
 * await db.transaction(['users', 'settings'], 'readwrite', async (tx) => {
 *   await tx.put('users', { id: 1, name: 'John' });
 *   await tx.put('settings', { key: 'theme', value: 'dark' });
 * });
 *
 * // Cleanup
 * db.close();
 * ```
 */
import { IndexedDBError, Result, type IndexedDBErrorCode } from '../core/index.js';

export { IndexedDBError };
export type { IndexedDBErrorCode };

/**
 * Object store configuration.
 */
export interface StoreConfig {
  /** Primary key path */
  readonly keyPath?: string | string[];
  /** Auto-generate keys */
  readonly autoIncrement?: boolean;
  /** Index definitions */
  readonly indexes?: Record<
    string,
    {
      keyPath: string | string[];
      unique?: boolean;
      multiEntry?: boolean;
    }
  >;
}

/**
 * Database configuration.
 */
export interface DatabaseConfig {
  /** Database name */
  readonly name: string;
  /** Database version */
  readonly version: number;
  /** Object store definitions */
  readonly stores: Record<string, StoreConfig>;
}

/**
 * Transaction context for batch operations.
 *
 * Provides methods for CRUD operations within a transaction.
 * All operations share the same transaction scope.
 *
 * @example Batch insert with transaction
 * ```TypeScript
 * await db.transaction(['users'], 'readwrite', async (tx) => {
 *   await tx.add('users', { id: 1, name: 'Alice' });
 *   await tx.add('users', { id: 2, name: 'Bob' });
 *   await tx.add('users', { id: 3, name: 'Charlie' });
 * });
 * ```
 *
 * @example Cross-store transaction
 * ```TypeScript
 * await db.transaction(['orders', 'inventory'], 'readwrite', async (tx) => {
 *   // Reduce inventory
 *   const item = await tx.get<InventoryItem>('inventory', productId);
 *   if (item && item.stock > 0) {
 *     await tx.put('inventory', { ...item, stock: item.stock - 1 });
 *     await tx.add('orders', { productId, timestamp: Date.now() });
 *   }
 * });
 * ```
 */
export interface TransactionContext {
  /** Get a record by key */
  get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined>;
  /** Put a record (insert or update) */
  put<T>(storeName: string, value: T, key?: IDBValidKey): Promise<IDBValidKey>;
  /** Add a record (insert only) */
  add<T>(storeName: string, value: T, key?: IDBValidKey): Promise<IDBValidKey>;
  /** Delete a record */
  delete(storeName: string, key: IDBValidKey): Promise<void>;
  /** Clear all records in store */
  clear(storeName: string): Promise<void>;
  /** Get all records */
  getAll<T>(storeName: string): Promise<T[]>;
  /** Count records */
  count(storeName: string): Promise<number>;
}

/**
 * IndexedDB Manager instance.
 */
export interface IndexedDBInstance {
  /** Database name */
  readonly name: string;
  /** Database version */
  readonly version: number;

  /** Get a record by key */
  get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined>;
  /** Put a record (insert or update) */
  put<T>(storeName: string, value: T, key?: IDBValidKey): Promise<IDBValidKey>;
  /** Add a record (insert only) */
  add<T>(storeName: string, value: T, key?: IDBValidKey): Promise<IDBValidKey>;
  /** Delete a record */
  delete(storeName: string, key: IDBValidKey): Promise<void>;
  /** Clear all records in store */
  clear(storeName: string): Promise<void>;
  /** Get all records */
  getAll<T>(storeName: string): Promise<T[]>;
  /** Count records */
  count(storeName: string): Promise<number>;

  /** Execute a transaction */
  transaction<T>(
    storeNames: string | string[],
    mode: IDBTransactionMode,
    callback: (context: TransactionContext) => Promise<T>
  ): Promise<T>;

  /** Close the database connection */
  close(): void;
}

/**
 * Wrap an IDBRequest in a Promise.
 */
function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = (): void => resolve(request.result);
    request.onerror = (): void => reject(IndexedDBError.operationFailed('request', request.error));
  });
}

/**
 * Create store operations for a transaction.
 */
function createStoreOperations(transaction: IDBTransaction): TransactionContext {
  return {
    async get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
      const store = transaction.objectStore(storeName);
      return (await promisifyRequest(store.get(key))) as T | undefined;
    },

    async put<T>(storeName: string, value: T, key?: IDBValidKey): Promise<IDBValidKey> {
      const store = transaction.objectStore(storeName);
      return promisifyRequest(store.put(value, key));
    },

    async add<T>(storeName: string, value: T, key?: IDBValidKey): Promise<IDBValidKey> {
      const store = transaction.objectStore(storeName);
      return promisifyRequest(store.add(value, key));
    },

    async delete(storeName: string, key: IDBValidKey): Promise<void> {
      const store = transaction.objectStore(storeName);
      await promisifyRequest(store.delete(key));
    },

    async clear(storeName: string): Promise<void> {
      const store = transaction.objectStore(storeName);
      await promisifyRequest(store.clear());
    },

    async getAll<T>(storeName: string): Promise<T[]> {
      const store = transaction.objectStore(storeName);
      return (await promisifyRequest(store.getAll())) as T[];
    },

    async count(storeName: string): Promise<number> {
      const store = transaction.objectStore(storeName);
      return promisifyRequest(store.count());
    },
  };
}

export const IndexedDBManager = {
  /**
   * Check if IndexedDB is supported.
   *
   * @example
   * ```TypeScript
   * if (IndexedDBManager.isSupported()) {
   *   const db = await IndexedDBManager.open(config);
   * } else {
   *   console.warn('IndexedDB not available, using fallback');
   * }
   * ```
   */
  isSupported(): boolean {
    return typeof indexedDB !== 'undefined';
  },

  /**
   * Open a database connection.
   *
   * @param config Database configuration
   * @returns Database instance
   * @throws {IndexedDBError} If database cannot be opened
   *
   * @example Basic database with single store
   * ```TypeScript
   * const db = await IndexedDBManager.open({
   *   name: 'myApp',
   *   version: 1,
   *   stores: {
   *     todos: { keyPath: 'id', autoIncrement: true },
   *   },
   * });
   * ```
   *
   * @example Database with indexes for querying
   * ```TypeScript
   * const db = await IndexedDBManager.open({
   *   name: 'ecommerce',
   *   version: 2,
   *   stores: {
   *     products: {
   *       keyPath: 'sku',
   *       indexes: {
   *         byCategory: { keyPath: 'category' },
   *         byPrice: { keyPath: 'price' },
   *         byName: { keyPath: 'name', unique: false },
   *       },
   *     },
   *     orders: {
   *       keyPath: 'orderId',
   *       autoIncrement: true,
   *       indexes: {
   *         byCustomer: { keyPath: 'customerId' },
   *         byDate: { keyPath: 'createdAt' },
   *       },
   *     },
   *   },
   * });
   * ```
   */
  async open(config: DatabaseConfig): Promise<IndexedDBInstance> {
    if (!IndexedDBManager.isSupported()) {
      throw IndexedDBError.notSupported();
    }

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(config.name, config.version);

      request.onerror = (): void => {
        reject(IndexedDBError.openFailed(config.name, request.error));
      };

      request.onsuccess = (): void => {
        resolve(request.result);
      };

      request.onupgradeneeded = (): void => {
        const database = request.result;
        const existingStores = new Set(database.objectStoreNames);

        // Create or update stores
        for (const [storeName, storeConfig] of Object.entries(config.stores)) {
          let store: IDBObjectStore;

          if (existingStores.has(storeName)) {
            // Can't modify existing store in upgrade, get reference for indexes
            store = request.transaction!.objectStore(storeName);
          } else {
            // Create new store
            store = database.createObjectStore(storeName, {
              keyPath: storeConfig.keyPath,
              autoIncrement: storeConfig.autoIncrement,
            });
          }

          // Create indexes
          if (storeConfig.indexes) {
            for (const [indexName, indexConfig] of Object.entries(storeConfig.indexes)) {
              if (!store.indexNames.contains(indexName)) {
                store.createIndex(indexName, indexConfig.keyPath, {
                  unique: indexConfig.unique,
                  multiEntry: indexConfig.multiEntry,
                });
              }
            }
          }
        }
      };

      request.onblocked = (): void => {
        reject(IndexedDBError.blocked());
      };
    });

    return IndexedDBManager.createInstance(db);
  },

  /**
   * Open a database with Result type (no exceptions).
   *
   * Use this method when you prefer explicit error handling over try-catch.
   *
   * @param config Database configuration
   * @returns Result containing either the database instance or an error
   *
   * @example Handle errors explicitly without try-catch
   * ```TypeScript
   * const result = await IndexedDBManager.openResult({
   *   name: 'myApp',
   *   version: 1,
   *   stores: { settings: { keyPath: 'key' } },
   * });
   *
   * if (result.isErr()) {
   *   console.error('Failed to open database:', result.error.code);
   *   return;
   * }
   *
   * const db = result.value;
   * await db.put('settings', { key: 'theme', value: 'dark' });
   * ```
   *
   * @example Pattern matching with Result
   * ```TypeScript
   * const result = await IndexedDBManager.openResult(config);
   *
   * result.match({
   *   ok: (db) => console.log('Database opened:', db.name),
   *   err: (error) => console.error('Error:', error.message),
   * });
   * ```
   */
  async openResult(config: DatabaseConfig): Promise<Result<IndexedDBInstance, IndexedDBError>> {
    try {
      const instance = await IndexedDBManager.open(config);
      return Result.ok(instance);
    } catch (e) {
      if (e instanceof IndexedDBError) {
        return Result.err(e);
      }
      return Result.err(IndexedDBError.openFailed(config.name, e));
    }
  },

  /**
   * Delete a database.
   *
   * @param name Database name
   *
   * @example Clean up test database
   * ```TypeScript
   * // After tests complete
   * await IndexedDBManager.deleteDatabase('test-db');
   * ```
   *
   * @example Reset user data
   * ```TypeScript
   * async function resetApp(): Promise<void> {
   *   await IndexedDBManager.deleteDatabase('myApp');
   *   // Re-initialize with fresh data
   *   await initializeApp();
   * }
   * ```
   */
  async deleteDatabase(name: string): Promise<void> {
    if (!IndexedDBManager.isSupported()) {
      throw IndexedDBError.notSupported();
    }

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = (): void => resolve();
      request.onerror = (): void =>
        reject(IndexedDBError.operationFailed('deleteDatabase', request.error));
      request.onblocked = (): void => reject(IndexedDBError.blocked());
    });
  },

  /**
   * Create a database instance wrapper.
   * @internal
   */
  createInstance(db: IDBDatabase): IndexedDBInstance {
    const executeInTransaction = async <T>(
      storeName: string,
      mode: IDBTransactionMode,
      operation: (store: IDBObjectStore) => IDBRequest<T>
    ): Promise<T> => {
      return new Promise((resolve, reject) => {
        try {
          const transaction = db.transaction(storeName, mode);
          const store = transaction.objectStore(storeName);
          const request = operation(store);

          request.onsuccess = (): void => resolve(request.result);
          request.onerror = (): void =>
            reject(IndexedDBError.operationFailed('store operation', request.error));
          transaction.onerror = (): void =>
            reject(IndexedDBError.transactionFailed(transaction.error));
        } catch (e) {
          reject(IndexedDBError.operationFailed('store operation', e));
        }
      });
    };

    return {
      get name(): string {
        return db.name;
      },

      get version(): number {
        return db.version;
      },

      async get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
        return (await executeInTransaction(storeName, 'readonly', (store) => store.get(key))) as
          T | undefined;
      },

      async put<T>(storeName: string, value: T, key?: IDBValidKey): Promise<IDBValidKey> {
        return executeInTransaction(storeName, 'readwrite', (store) => store.put(value, key));
      },

      async add<T>(storeName: string, value: T, key?: IDBValidKey): Promise<IDBValidKey> {
        return executeInTransaction(storeName, 'readwrite', (store) => store.add(value, key));
      },

      async delete(storeName: string, key: IDBValidKey): Promise<void> {
        await executeInTransaction(storeName, 'readwrite', (store) => store.delete(key));
      },

      async clear(storeName: string): Promise<void> {
        await executeInTransaction(storeName, 'readwrite', (store) => store.clear());
      },

      async getAll<T>(storeName: string): Promise<T[]> {
        return (await executeInTransaction(storeName, 'readonly', (store) =>
          store.getAll()
        )) as T[];
      },

      async count(storeName: string): Promise<number> {
        return executeInTransaction(storeName, 'readonly', (store) => store.count());
      },

      async transaction<T>(
        storeNames: string | string[],
        mode: IDBTransactionMode,
        callback: (context: TransactionContext) => Promise<T>
      ): Promise<T> {
        return new Promise((resolve, reject) => {
          try {
            const names = Array.isArray(storeNames) ? storeNames : [storeNames];
            const transaction = db.transaction(names, mode);
            const context = createStoreOperations(transaction);

            callback(context)
              .then((result): void => {
                transaction.oncomplete = (): void => resolve(result);
              })
              .catch((e: unknown): void => {
                transaction.abort();
                reject(IndexedDBError.transactionFailed(e));
              });

            transaction.onerror = (): void =>
              reject(IndexedDBError.transactionFailed(transaction.error));
          } catch (e) {
            reject(IndexedDBError.transactionFailed(e));
          }
        });
      },

      close(): void {
        db.close();
      },
    };
  },
};
