/**
 * WebSocket Manager - Robust WebSocket wrapper with automatic reconnection.
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Connection state management
 * - Message queuing during reconnection
 * - Heartbeat/ping-pong support
 * - Event-based API
 * - Type-safe message handling
 *
 * @remarks
 * ## Connection Lifecycle
 *
 * ```text
 * ┌─────────────┐
 * │ disconnected│◄────────────────────────────────┐
 * └──────┬──────┘                                 │
 *        │ connect()                              │
 *        ▼                                        │
 * ┌─────────────┐                                 │
 * │ connecting  │                                 │
 * └──────┬──────┘                                 │
 *        │ WebSocket.OPEN                         │
 *        ▼                                        │
 * ┌─────────────┐                                 │
 * │  connected  │◄────────────────┐               │
 * └──────┬──────┘                 │               │
 *        │                        │               │
 *        │ close() / error /      │               │
 *        │ server disconnect      │               │
 *        ▼                        │               │
 * ┌─────────────┐                 │               │
 * │disconnecting│                 │               │
 * └──────┬──────┘                 │               │
 *        │                        │               │
 *        │ WebSocket.CLOSE        │               │
 *        ▼                        │               │
 * ┌─────────────┐                 │               │
 * │ disconnected│                 │               │
 * └──────┬──────┘                 │               │
 *        │                        │               │
 *        │ reconnect=true AND     │               │
 *        │ !intentionalClose      │               │
 *        ▼                        │               │
 * ┌─────────────┐                 │               │
 * │reconnecting │                 │               │
 * └──────┬──────┘                 │               │
 *        │                        │               │
 *        │ Backoff delay          │               │
 *        │ (exponential)          │               │
 *        ▼                        │               │
 *        ├──► Retry < max? ───────┤               │
 *        │         yes                            │
 *        ├──► Retry >= max? ─────────────────────►┘
 *                  no
 * ```
 *
 * ## Reconnection Flow
 *
 * ```text
 * Disconnect detected
 *         │
 *         ▼
 *    intentional? ──yes──► disconnected (no retry)
 *         │ no
 *         ▼
 *   reconnect=true? ──no──► disconnected (no retry)
 *         │ yes
 *         ▼
 *  attempts < max? ──no──► disconnected (max reached)
 *         │ yes
 *         ▼
 *   state = reconnecting
 *         │
 *         ▼
 *   Calculate delay = min(
 *     reconnectDelay * (multiplier ^ (attempts - 1)),
 *     maxReconnectDelay
 *   )
 *         │
 *         ▼
 *    Wait delay ms
 *         │
 *         ▼
 *    connect() ──success──► connected (attempts = 0)
 *         │
 *         └──fail──► Repeat from start
 * ```
 *
 * ## Heartbeat Flow
 *
 * ```text
 * connected state
 *       │
 *       ▼
 * heartbeatInterval > 0? ──no──► (no heartbeat)
 *       │ yes
 *       ▼
 * Start interval timer
 *       │
 *       └──► Every heartbeatInterval ms:
 *               │
 *               ▼
 *          readyState = OPEN? ──no──► Skip
 *               │ yes
 *               ▼
 *          Send heartbeatMessage
 *               │
 *               └──► Repeat
 *
 * On disconnect/close:
 *  → Clear interval timer
 * ```
 *
 * ## Message Queuing Flow
 *
 * ```text
 * send(data) called
 *       │
 *       ▼
 * readyState = OPEN? ──yes──► Send immediately → Done
 *       │ no
 *       ▼
 * queueMessages=true? ──no──► Return false (message lost)
 *       │ yes
 *       ▼
 * queue.length < maxQueueSize? ──no──► Return false (queue full)
 *       │ yes
 *       ▼
 * Add to messageQueue[] → Return true
 *       │
 *       └──► When connection restored:
 *               │
 *               ▼
 *          Flush queue (FIFO order)
 *               │
 *               ▼
 *          For each message:
 *            readyState = OPEN? ──yes──► Send message
 *                  │ no
 *                  └──► Put back in queue, stop flushing
 * ```
 *
 * @example
 * ```TypeScript
 * // Create connection
 * const ws = WebSocketManager.create({
 *   url: 'wss://api.example.com/ws',
 *   reconnect: true,
 *   maxReconnectAttempts: 5,
 * });
 *
 * // Event handlers
 * ws.onOpen(() => console.log('Connected'));
 * ws.onClose(() => console.log('Disconnected'));
 * ws.onError((error) => console.error('Error:', error));
 * ws.onMessage((data) => console.log('Received:', data));
 *
 * // Send messages
 * ws.send({ type: 'hello', payload: 'world' });
 *
 * // Close connection
 * ws.close();
 * ```
 */
import { WebSocketError, type WebSocketErrorCode, type CleanupFn } from '../core/index.js';
import type { BinaryData, BinaryType, ConnectionState } from './types.js';
import type { Transport, TransportKind } from './Transport.js';
import { WebSocketTransport } from './WebSocketTransport.js';
import { SseTransport } from './SseTransport.js';
import { PollingTransport } from './PollingTransport.js';

export { WebSocketError };
export type { WebSocketErrorCode };
export type { BinaryData, BinaryType, ConnectionState };
export type { TransportKind };

/**
 * Transport fallback strategy when WebSocket is unavailable or fails to connect.
 */
export type FallbackStrategy = 'polling' | 'sse' | 'none';

/**
 * WebSocket manager configuration.
 */
export interface WebSocketConfig {
  /** WebSocket URL (must start with ws:// or wss://) */
  readonly url: string;
  /** Sub-protocols */
  readonly protocols?: string | string[];
  /** Enable automatic reconnection */
  readonly reconnect?: boolean;
  /** Maximum reconnection attempts (0 = unlimited) */
  readonly maxReconnectAttempts?: number;
  /** Initial reconnect delay in ms */
  readonly reconnectDelay?: number;
  /** Maximum reconnect delay in ms */
  readonly maxReconnectDelay?: number;
  /** Reconnect delay multiplier */
  readonly reconnectMultiplier?: number;
  /** Heartbeat interval in ms (0 = disabled) */
  readonly heartbeatInterval?: number;
  /** Heartbeat message */
  readonly heartbeatMessage?: string | (() => unknown);
  /** Queue messages while disconnected */
  readonly queueMessages?: boolean;
  /** Maximum queued messages */
  readonly maxQueueSize?: number;
  /** Binary type for receiving binary data ('blob' or 'arraybuffer') */
  readonly binaryType?: BinaryType;
  /**
   * Fallback transport when WebSocket is unavailable or fails to connect
   * (default: 'none'). Requires {@link WebSocketConfig.fallbackUrl}.
   */
  readonly fallback?: FallbackStrategy;
  /**
   * HTTP(S) endpoint for the fallback transport (required when `fallback` is not
   * 'none'). Receives server-pushed messages: an SSE (`text/event-stream`) stream
   * for `'sse'`, or a polled GET resource for `'polling'`.
   */
  readonly fallbackUrl?: string;
  /**
   * HTTP(S) endpoint the fallback transport POSTs outbound messages to
   * (default: {@link WebSocketConfig.fallbackUrl}).
   */
  readonly fallbackSendUrl?: string;
  /** Polling interval in ms for the `'polling'` fallback (default: 3000). */
  readonly pollInterval?: number;
}

/**
 * WebSocket manager instance.
 */
export interface WebSocketInstance {
  /** Current connection state */
  readonly state: ConnectionState;
  /** WebSocket URL */
  readonly url: string;
  /** Number of reconnection attempts */
  readonly reconnectAttempts: number;
  /** The transport currently backing the connection, or null before connecting */
  readonly activeTransport: TransportKind | null;

  /** Connect to the WebSocket server */
  connect(): void;
  /** Send a message (JSON serialized if object) */
  send(data: unknown): boolean;
  /** Send binary data directly */
  sendBinary(data: BinaryData): boolean;
  /** Close the connection */
  close(code?: number, reason?: string): void;

  /** Set binary type for receiving data */
  setBinaryType(type: BinaryType): void;
  /** Get current binary type */
  getBinaryType(): BinaryType;

  /** Register open handler */
  onOpen(handler: () => void): CleanupFn;
  /** Register close handler */
  onClose(handler: (code: number, reason: string) => void): CleanupFn;
  /** Register error handler */
  onError(handler: (error: Event) => void): CleanupFn;
  /** Register message handler */
  onMessage<T = unknown>(handler: (data: T, event: MessageEvent) => void): CleanupFn;
  /** Register binary message handler */
  onBinaryMessage(handler: (data: ArrayBuffer | Blob) => void): CleanupFn;
  /** Register state change handler */
  onStateChange(handler: (state: ConnectionState) => void): CleanupFn;
}

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG = {
  reconnect: true,
  maxReconnectAttempts: 10,
  reconnectDelay: 1000,
  maxReconnectDelay: 30000,
  reconnectMultiplier: 1.5,
  heartbeatInterval: 0,
  queueMessages: true,
  maxQueueSize: 100,
  binaryType: 'blob',
  fallback: 'none',
  pollInterval: 3000,
} as const satisfies Partial<WebSocketConfig>;

/**
 * Validate an HTTP(S) URL used for a fallback transport endpoint.
 */
const isHttpUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const WebSocketManager = {
  /**
   * Check if WebSocket is supported.
   *
   * @example
   * ```TypeScript
   * if (WebSocketManager.isSupported()) {
   *   const ws = WebSocketManager.create({ url: 'wss://api.example.com/ws' });
   * } else {
   *   console.warn('WebSocket not supported, using polling fallback');
   * }
   * ```
   */
  isSupported(): boolean {
    return typeof WebSocket !== 'undefined';
  },

  /**
   * Validate WebSocket URL.
   *
   * @example
   * ```TypeScript
   * const userUrl = 'wss://api.example.com/ws';
   * if (!WebSocketManager.isValidUrl(userUrl)) {
   *   throw new Error('Invalid WebSocket URL');
   * }
   * ```
   */
  isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
    } catch {
      return false;
    }
  },

  /**
   * Create a WebSocket manager instance.
   *
   * @param config WebSocket configuration
   * @returns WebSocket manager instance
   *
   * @example Basic connection with event handlers
   * ```TypeScript
   * const ws = WebSocketManager.create({
   *   url: 'wss://api.example.com/ws',
   * });
   *
   * ws.onOpen(() => console.log('Connected'));
   * ws.onMessage((data) => console.log('Received:', data));
   * ws.connect();
   * ```
   *
   * @example With automatic reconnection
   * ```TypeScript
   * const ws = WebSocketManager.create({
   *   url: 'wss://api.example.com/ws',
   *   reconnect: true,
   *   maxReconnectAttempts: 5,
   *   reconnectDelay: 1000,
   *   reconnectMultiplier: 2.0, // Exponential backoff
   * });
   *
   * ws.onStateChange((state) => {
   *   if (state === 'reconnecting') {
   *     console.log(`Reconnecting... (attempt ${ws.reconnectAttempts})`);
   *   }
   * });
   * ```
   *
   * @example With heartbeat to keep connection alive
   * ```TypeScript
   * const ws = WebSocketManager.create({
   *   url: 'wss://api.example.com/ws',
   *   heartbeatInterval: 30000, // Send ping every 30 seconds
   *   heartbeatMessage: () => ({ type: 'ping', timestamp: Date.now() }),
   * });
   * ```
   *
   * @example Message queuing during disconnection
   * ```TypeScript
   * const ws = WebSocketManager.create({
   *   url: 'wss://api.example.com/ws',
   *   queueMessages: true,
   *   maxQueueSize: 50,
   * });
   *
   * // Messages sent while disconnected are queued
   * ws.send({ type: 'update', data: 'value' }); // Queued if disconnected
   * // Automatically sent when connection is restored
   * ```
   *
   * @example Type-safe message handling
   * ```TypeScript
   * interface ServerMessage {
   *   type: 'update' | 'notification';
   *   payload: unknown;
   * }
   *
   * const ws = WebSocketManager.create({ url: 'wss://api.example.com/ws' });
   *
   * ws.onMessage<ServerMessage>((message) => {
   *   switch (message.type) {
   *     case 'update':
   *       handleUpdate(message.payload);
   *       break;
   *     case 'notification':
   *       showNotification(message.payload);
   *       break;
   *   }
   * });
   * ```
   *
   * @example With an SSE fallback when WebSocket is blocked
   * ```TypeScript
   * // Same event API regardless of transport. Requires server endpoints matching
   * // the fallback contract (see the websocket documentation).
   * const ws = WebSocketManager.create({
   *   url: 'wss://api.example.com/ws',
   *   fallback: 'sse',
   *   fallbackUrl: 'https://api.example.com/sse',
   *   fallbackSendUrl: 'https://api.example.com/send',
   * });
   *
   * ws.onMessage((data) => console.log('Received via', ws.activeTransport, data));
   * ws.connect();
   * ```
   */
  create(config: WebSocketConfig): WebSocketInstance {
    if (!WebSocketManager.isValidUrl(config.url)) {
      throw WebSocketError.invalidUrl(config.url);
    }

    const options = { ...DEFAULT_CONFIG, ...config };

    if (options.fallback !== 'none') {
      if (config.fallbackUrl === undefined || config.fallbackUrl.length === 0) {
        throw WebSocketError.fallbackUrlRequired(options.fallback);
      }
      if (!isHttpUrl(config.fallbackUrl)) {
        throw WebSocketError.invalidUrl(config.fallbackUrl);
      }
      if (config.fallbackSendUrl !== undefined && !isHttpUrl(config.fallbackSendUrl)) {
        throw WebSocketError.invalidUrl(config.fallbackSendUrl);
      }
    } else if (!WebSocketManager.isSupported()) {
      // No fallback configured and WebSocket is unavailable.
      throw WebSocketError.notSupported();
    }

    let activeTransport: Transport | null = null;
    let state: ConnectionState = 'disconnected';
    let reconnectAttempts = 0;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    const messageQueue: unknown[] = [];
    let intentionalClose = false;
    let hasFallenBack = false;
    let wsEverConnected = false;
    let currentBinaryType: BinaryType = options.binaryType;

    // Event handlers
    const openHandlers = new Set<() => void>();
    const closeHandlers = new Set<(code: number, reason: string) => void>();
    const errorHandlers = new Set<(error: Event) => void>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic message handler requires any for type flexibility
    const messageHandlers = new Set<(data: any, event: MessageEvent) => void>();
    const binaryMessageHandlers = new Set<(data: ArrayBuffer | Blob) => void>();
    const stateChangeHandlers = new Set<(state: ConnectionState) => void>();

    const setState = (newState: ConnectionState): void => {
      if (state !== newState) {
        state = newState;
        stateChangeHandlers.forEach((handler) => handler(newState));
      }
    };

    const stopHeartbeat = (): void => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const clearReconnectTimer = (): void => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
    };

    const clearTimers = (): void => {
      clearReconnectTimer();
      stopHeartbeat();
    };

    /**
     * Check if data is binary (ArrayBuffer or Blob).
     */
    const isBinaryData = (data: unknown): data is ArrayBuffer | Blob => {
      return data instanceof ArrayBuffer || data instanceof Blob;
    };

    // Heartbeat is a WebSocket-only concern: on polling the poll itself is the
    // liveness check, and SSE streams are server-driven. Sending heartbeats over a
    // fallback would just generate surprise POST traffic.
    const startHeartbeat = (): void => {
      if (options.heartbeatInterval <= 0) return;
      if (activeTransport?.kind !== 'websocket') return;

      heartbeatTimer = setInterval(() => {
        if (state !== 'connected' || !activeTransport) return;

        try {
          const message =
            typeof options.heartbeatMessage === 'function'
              ? options.heartbeatMessage()
              : (options.heartbeatMessage ?? 'ping');

          activeTransport.send(typeof message === 'string' ? message : JSON.stringify(message));
        } catch (e) {
          errorHandlers.forEach((handler) => handler(e instanceof Event ? e : new Event('error')));
        }
      }, options.heartbeatInterval);
    };

    const flushQueue = (): void => {
      while (messageQueue.length > 0 && state === 'connected' && activeTransport) {
        const data = messageQueue.shift();
        const serialized = typeof data === 'string' ? data : JSON.stringify(data);
        if (!activeTransport.send(serialized)) {
          // Put message back in queue
          messageQueue.unshift(data);
          break;
        }
      }
    };

    const handleMessage = (data: unknown, event?: MessageEvent): void => {
      // Handle binary data (WebSocket only).
      if (isBinaryData(data)) {
        binaryMessageHandlers.forEach((handler) => handler(data));
        const messageEvent = event ?? new MessageEvent('message', { data });
        messageHandlers.forEach((handler) => handler(data, messageEvent));
        return;
      }

      // Try to parse JSON for string messages.
      let parsedData: unknown = data;
      if (typeof data === 'string') {
        try {
          parsedData = JSON.parse(data);
        } catch {
          // Keep as string
        }
      }

      // Fallback transports without a native MessageEvent get a synthetic one so the
      // event-based API stays uniform across transports.
      const messageEvent = event ?? new MessageEvent('message', { data });
      messageHandlers.forEach((handler) => handler(parsedData, messageEvent));
    };

    const scheduleReconnect = (): void => {
      if (!options.reconnect || intentionalClose) return;

      if (options.maxReconnectAttempts > 0 && reconnectAttempts >= options.maxReconnectAttempts) {
        setState('disconnected');
        return;
      }

      setState('reconnecting');
      reconnectAttempts++;

      const delay = Math.min(
        options.reconnectDelay * Math.pow(options.reconnectMultiplier, reconnectAttempts - 1),
        options.maxReconnectDelay
      );

      reconnectTimeout = setTimeout(() => {
        connect();
      }, delay);
    };

    // Fall back only while WebSocket has never connected: once it has worked, drops are
    // treated as transient and reconnect stays on WebSocket.
    const canFallback = (): boolean =>
      options.fallback !== 'none' &&
      !hasFallenBack &&
      !wsEverConnected &&
      activeTransport?.kind === 'websocket';

    const createFallbackTransport = (): Transport => {
      const receiveUrl = config.fallbackUrl as string;
      const sendUrl = config.fallbackSendUrl ?? receiveUrl;
      return options.fallback === 'sse'
        ? new SseTransport(receiveUrl, sendUrl)
        : new PollingTransport(receiveUrl, sendUrl, options.pollInterval);
    };

    const createInitialTransport = (): Transport => {
      if (WebSocketManager.isSupported()) {
        return new WebSocketTransport(config.url, config.protocols, currentBinaryType);
      }
      // WebSocket is unavailable but a fallback is configured (validated above).
      hasFallenBack = true;
      return createFallbackTransport();
    };

    const wireTransport = (transport: Transport): void => {
      transport.onOpen = (): void => {
        if (transport.kind === 'websocket') wsEverConnected = true;
        setState('connected');
        reconnectAttempts = 0;
        startHeartbeat();
        flushQueue();
        openHandlers.forEach((handler) => handler());
      };

      transport.onClose = (code: number, reason: string): void => {
        stopHeartbeat();
        closeHandlers.forEach((handler) => handler(code, reason));

        if (intentionalClose) {
          setState('disconnected');
          return;
        }

        if (canFallback()) {
          switchToFallback();
          return;
        }

        scheduleReconnect();
      };

      transport.onError = (event: Event): void => {
        errorHandlers.forEach((handler) => handler(event));
      };

      transport.onMessage = handleMessage;
    };

    const switchToFallback = (): void => {
      hasFallenBack = true;
      stopHeartbeat();
      activeTransport = createFallbackTransport();
      wireTransport(activeTransport);
      reconnectAttempts = 0;
      setState('connecting');
      activeTransport.connect();
    };

    const connect = (): void => {
      if (state === 'connecting' || state === 'connected') {
        return;
      }

      intentionalClose = false;

      if (!activeTransport) {
        activeTransport = createInitialTransport();
        wireTransport(activeTransport);
      }

      setState('connecting');

      try {
        activeTransport.connect();
      } catch (e) {
        if (canFallback()) {
          switchToFallback();
          return;
        }
        setState('disconnected');
        throw e;
      }
    };

    return {
      get state(): ConnectionState {
        return state;
      },

      get url(): string {
        return config.url;
      },

      get reconnectAttempts(): number {
        return reconnectAttempts;
      },

      get activeTransport(): TransportKind | null {
        return activeTransport ? activeTransport.kind : null;
      },

      connect,

      send(data: unknown): boolean {
        if (state === 'connected' && activeTransport) {
          const serialized = typeof data === 'string' ? data : JSON.stringify(data);
          return activeTransport.send(serialized);
        }

        // Queue message if enabled
        if (options.queueMessages && messageQueue.length < options.maxQueueSize) {
          messageQueue.push(data);
          return true;
        }

        return false;
      },

      sendBinary(data: BinaryData): boolean {
        return activeTransport?.sendBinary(data) ?? false;
      },

      setBinaryType(type: BinaryType): void {
        currentBinaryType = type;
        activeTransport?.setBinaryType(type);
      },

      getBinaryType(): BinaryType {
        return currentBinaryType;
      },

      close(code = 1000, reason = ''): void {
        intentionalClose = true;
        clearTimers();
        messageQueue.length = 0;

        if (activeTransport && state !== 'disconnected') {
          setState('disconnecting');
          activeTransport.close(code, reason);
        } else {
          setState('disconnected');
        }
      },

      onOpen(handler: () => void): CleanupFn {
        openHandlers.add(handler);
        return () => openHandlers.delete(handler);
      },

      onClose(handler: (code: number, reason: string) => void): CleanupFn {
        closeHandlers.add(handler);
        return () => closeHandlers.delete(handler);
      },

      onError(handler: (error: Event) => void): CleanupFn {
        errorHandlers.add(handler);
        return () => errorHandlers.delete(handler);
      },

      onMessage<T = unknown>(handler: (data: T, event: MessageEvent) => void): CleanupFn {
        messageHandlers.add(handler);
        return () => messageHandlers.delete(handler);
      },

      onBinaryMessage(handler: (data: ArrayBuffer | Blob) => void): CleanupFn {
        binaryMessageHandlers.add(handler);
        return () => binaryMessageHandlers.delete(handler);
      },

      onStateChange(handler: (state: ConnectionState) => void): CleanupFn {
        stateChangeHandlers.add(handler);
        return () => stateChangeHandlers.delete(handler);
      },
    };
  },
};
