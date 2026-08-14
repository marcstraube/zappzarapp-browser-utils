/**
 * Browser Notification - Web Notifications API wrapper.
 *
 * Features:
 * - Permission management
 * - Result-based API
 * - Notification tracking for bulk close
 *
 * @example
 * ```TypeScript
 * // Check support
 * if (BrowserNotification.isSupported()) {
 *   // Request permission
 *   const permResult = await BrowserNotification.requestPermission();
 *
 *   if (Result.isOk(permResult)) {
 *     // Show notification
 *     const result = await BrowserNotification.show('Hello!', {
 *       body: 'This is a notification',
 *       icon: '/icon.png',
 *     });
 *
 *     if (Result.isOk(result)) {
 *       const notification = result.value;
 *       // Handle notification events
 *     }
 *   }
 * }
 * ```
 */
import { Result, NotificationError } from '../core/index.js';

/** Tracked notifications for bulk operations */
const activeNotifications = new Set<Notification>();

export const BrowserNotification = {
  // =========================================================================
  // Support & Permission
  // =========================================================================

  /**
   * Check if Notifications API is supported.
   */
  isSupported(): boolean {
    return typeof Notification !== 'undefined';
  },

  /**
   * Get current permission status.
   */
  permission(): NotificationPermission {
    if (!BrowserNotification.isSupported()) {
      return 'denied';
    }
    return Notification.permission;
  },

  /**
   * Check if permission is granted.
   */
  isGranted(): boolean {
    return BrowserNotification.permission() === 'granted';
  },

  /**
   * Check if permission is denied.
   */
  isDenied(): boolean {
    return BrowserNotification.permission() === 'denied';
  },

  /**
   * Request notification permission.
   */
  async requestPermission(): Promise<Result<NotificationPermission, NotificationError>> {
    if (!BrowserNotification.isSupported()) {
      return Result.err(NotificationError.notSupported());
    }

    try {
      const permission = await Notification.requestPermission();

      if (permission === 'denied') {
        return Result.err(NotificationError.permissionDenied());
      }

      return Result.ok(permission);
    } catch (e) {
      return Result.err(NotificationError.showFailed(e));
    }
  },

  // =========================================================================
  // Show Notifications
  // =========================================================================

  /**
   * Show a notification.
   * Automatically requests permission if not yet granted.
   */
  async show(
    title: string,
    options?: NotificationOptions
  ): Promise<Result<Notification, NotificationError>> {
    if (!BrowserNotification.isSupported()) {
      return Result.err(NotificationError.notSupported());
    }

    // Check permission
    if (BrowserNotification.permission() === 'denied') {
      return Result.err(NotificationError.permissionDenied());
    }

    // Request permission if default
    if (BrowserNotification.permission() === 'default') {
      const permResult = await BrowserNotification.requestPermission();
      if (Result.isErr(permResult)) {
        return permResult;
      }
      if (permResult.value !== 'granted') {
        return Result.err(NotificationError.permissionDenied());
      }
    }

    try {
      const notification = new Notification(title, options);

      // Track notification
      activeNotifications.add(notification);

      // Remove from tracking when closed
      notification.onclose = (): void => {
        activeNotifications.delete(notification);
      };

      return Result.ok(notification);
    } catch (e) {
      return Result.err(NotificationError.showFailed(e));
    }
  },

  /**
   * Show a notification with event handlers.
   */
  async showWithHandlers(
    title: string,
    options: NotificationOptions & {
      onClick?: (event: Event) => void;
      onClose?: (event: Event) => void;
      onError?: (event: Event) => void;
      onShow?: (event: Event) => void;
    }
  ): Promise<Result<Notification, NotificationError>> {
    const { onClick, onClose, onError, onShow, ...notificationOptions } = options;

    const result = await BrowserNotification.show(title, notificationOptions);

    if (Result.isErr(result)) {
      return result;
    }

    const notification = result.value;

    if (onClick) notification.onclick = onClick;
    if (onClose) {
      const originalOnClose = notification.onclose;
      notification.onclose = (e): void => {
        originalOnClose?.call(notification, e);
        onClose(e);
      };
    }
    if (onError) notification.onerror = onError;
    if (onShow) notification.onshow = onShow;

    return Result.ok(notification);
  },

  // =========================================================================
  // Close Notifications
  // =========================================================================

  /**
   * Close a specific notification.
   */
  close(notification: Notification): void {
    notification.close();
    activeNotifications.delete(notification);
  },

  /**
   * Close all active notifications.
   */
  closeAll(): void {
    for (const notification of activeNotifications) {
      notification.close();
    }
    activeNotifications.clear();
  },

  /**
   * Get number of active notifications.
   */
  activeCount(): number {
    return activeNotifications.size;
  },

  // =========================================================================
  // Service Worker Notifications
  // =========================================================================

  /**
   * Show notification via Service Worker.
   * Required for notifications when page is not focused.
   */
  async showViaServiceWorker(
    title: string,
    options?: NotificationOptions
  ): Promise<Result<void, NotificationError>> {
    if (!BrowserNotification.isSupported()) {
      return Result.err(NotificationError.notSupported());
    }

    if (!('serviceWorker' in navigator)) {
      return Result.err(NotificationError.notSupported());
    }

    // Check permission
    if (BrowserNotification.permission() !== 'granted') {
      const permResult = await BrowserNotification.requestPermission();
      if (Result.isErr(permResult) || permResult.value !== 'granted') {
        return Result.err(NotificationError.permissionDenied());
      }
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, options);
      return Result.ok(undefined);
    } catch (e) {
      return Result.err(NotificationError.showFailed(e));
    }
  },
};
