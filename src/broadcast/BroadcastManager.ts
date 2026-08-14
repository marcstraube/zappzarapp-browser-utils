/**
 * Broadcast Channel Manager - Multi-tab communication via Broadcast Channel API.
 *
 * Features:
 * - Type-safe message passing between browser tabs/windows
 * - Event-based API with type filtering
 * - Automatic sender ID generation for message origin tracking
 * - Graceful degradation when API is not supported
 *
 * @example
 * ```TypeScript
 * // Tab 1: Create broadcast manager
 * const broadcast = BroadcastManager.create('my-app');
 *
 * broadcast.on<{ count: number }>('counter', (message) => {
 *   console.log(`Tab ${message.senderId} updated counter to:`, message.payload.count);
 * });
 *
 * // Tab 2: Send a message
 * const broadcast2 = BroadcastManager.create('my-app');
 * broadcast2.send('counter', { count: 42 });
 * ```
 */
import {
  BroadcastError,
  generateUUID,
  CryptoError,
  type BroadcastErrorCode,
  type CleanupFn,
} from '../core/index.js';

export { BroadcastError };
export type { BroadcastErrorCode };

/**
 * A broadcast message sent between tabs.
 */
export interface BroadcastMessage<T = unknown> {
  /** Message type identifier for filtering */
  readonly type: string;
  /** Message payload data */
  readonly payload: T;
  /** Timestamp when message was sent (ms since epoch) */
  readonly timestamp: number;
  /** Unique ID of the sender instance */
  readonly senderId: string;
}

/**
 * Broadcast manager instance for multi-tab communication.
 */
export interface BroadcastManagerInstance {
  /** Name of the broadcast channel */
  readonly channelName: string;
  /** Unique ID of this manager instance */
  readonly id: string;

  /**
   * Send a message to all other tabs/windows on this channel.
   *
   * @param type Message type identifier
   * @param payload Message data
   */
  send<T>(type: string, payload: T): void;

  /**
   * Subscribe to messages of a specific type.
   *
   * @param type Message type to listen for
   * @param handler Callback invoked when a matching message is received
   * @returns Cleanup function to unsubscribe
   */
  on<T>(type: string, handler: (message: BroadcastMessage<T>) => void): CleanupFn;

  /**
   * Subscribe to all messages regardless of type.
   *
   * @param handler Callback invoked for every message
   * @returns Cleanup function to unsubscribe
   */
  onAny(handler: (message: BroadcastMessage) => void): CleanupFn;

  /**
   * Close the broadcast channel and clean up resources.
   */
  close(): void;
}

/**
 * Generate a unique ID using shared crypto utility.
 * Wraps CryptoError as BroadcastError for API consistency.
 */
function generateId(): string {
  try {
    return generateUUID();
  } catch (e) {
    if (e instanceof CryptoError) {
      throw BroadcastError.cryptoUnavailable();
    }
    throw e;
  }
}

/**
 * Validate that a message has the expected structure.
 */
function isValidBroadcastMessage(data: unknown): data is BroadcastMessage {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const msg = data as Record<string, unknown>;

  return (
    typeof msg.type === 'string' &&
    typeof msg.timestamp === 'number' &&
    typeof msg.senderId === 'string' &&
    'payload' in msg
  );
}

export const BroadcastManager = {
  /**
   * Check if Broadcast Channel API is supported.
   *
   * @example
   * ```TypeScript
   * if (BroadcastManager.isSupported()) {
   *   const broadcast = BroadcastManager.create('my-channel');
   * } else {
   *   console.warn('BroadcastChannel not supported, falling back to other mechanism');
   * }
   * ```
   */
  isSupported(): boolean {
    return typeof BroadcastChannel !== 'undefined';
  },

  /**
   * Create a broadcast manager instance for multi-tab communication.
   *
   * @param channelName Name of the broadcast channel
   * @returns Broadcast manager instance
   * @throws {BroadcastError} When BroadcastChannel is not supported
   *
   * @example Basic usage
   * ```TypeScript
   * const broadcast = BroadcastManager.create('my-app');
   *
   * // Listen for specific message types
   * broadcast.on<{ userId: string }>('login', (msg) => {
   *   console.log(`User ${msg.payload.userId} logged in from tab ${msg.senderId}`);
   * });
   *
   * // Send a message to all other tabs
   * broadcast.send('login', { userId: 'user123' });
   *
   * // Clean up when done
   * broadcast.close();
   * ```
   *
   * @example Listen to all messages
   * ```TypeScript
   * const broadcast = BroadcastManager.create('my-app');
   *
   * const cleanup = broadcast.onAny((msg) => {
   *   console.log(`[${msg.type}] from ${msg.senderId}:`, msg.payload);
   * });
   *
   * // Later: stop listening
   * cleanup();
   * ```
   *
   * @example Sync state between tabs
   * ```TypeScript
   * interface AppState {
   *   theme: 'light' | 'dark';
   *   language: string;
   * }
   *
   * const broadcast = BroadcastManager.create('app-state');
   *
   * broadcast.on<AppState>('state-update', (msg) => {
   *   applyState(msg.payload);
   * });
   *
   * function updateState(state: AppState): void {
   *   applyState(state);
   *   broadcast.send('state-update', state);
   * }
   * ```
   */
  create(channelName: string): BroadcastManagerInstance {
    if (!BroadcastManager.isSupported()) {
      throw BroadcastError.notSupported();
    }

    const id = generateId();
    let channel: BroadcastChannel | null = new BroadcastChannel(channelName);
    let closed = false;

    // Type-specific handlers: Map<type, Set<handler>>
    const typeHandlers = new Map<string, Set<(message: BroadcastMessage) => void>>();

    // Handlers for all messages
    const anyHandlers = new Set<(message: BroadcastMessage) => void>();

    // Message handler
    channel.onmessage = (event: MessageEvent): void => {
      const data: unknown = event.data;

      if (!isValidBroadcastMessage(data)) {
        return;
      }

      // Call type-specific handlers
      const handlers = typeHandlers.get(data.type);
      if (handlers) {
        handlers.forEach((handler) => handler(data));
      }

      // Call any handlers
      anyHandlers.forEach((handler) => handler(data));
    };

    return {
      get channelName(): string {
        return channelName;
      },

      get id(): string {
        return id;
      },

      send<T>(type: string, payload: T): void {
        if (closed || !channel) {
          throw BroadcastError.channelClosed(channelName);
        }

        const message: BroadcastMessage<T> = {
          type,
          payload,
          timestamp: Date.now(),
          senderId: id,
        };

        try {
          channel.postMessage(message);
        } catch (e) {
          throw BroadcastError.sendFailed(e);
        }
      },

      on<T>(type: string, handler: (message: BroadcastMessage<T>) => void): CleanupFn {
        if (!typeHandlers.has(type)) {
          typeHandlers.set(type, new Set());
        }

        const handlers = typeHandlers.get(type)!;
        handlers.add(handler as (message: BroadcastMessage) => void);

        return () => {
          handlers.delete(handler as (message: BroadcastMessage) => void);
          if (handlers.size === 0) {
            typeHandlers.delete(type);
          }
        };
      },

      onAny(handler: (message: BroadcastMessage) => void): CleanupFn {
        anyHandlers.add(handler);
        return () => anyHandlers.delete(handler);
      },

      close(): void {
        if (closed || !channel) {
          return;
        }

        closed = true;
        channel.close();
        channel = null;

        // Clear all handlers
        typeHandlers.clear();
        anyHandlers.clear();
      },
    };
  },
};
