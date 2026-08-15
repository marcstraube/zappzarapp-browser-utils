/**
 * Event Utilities - Common event handling patterns.
 *
 * Features:
 * - Once listeners (auto-remove after first trigger)
 * - Event delegation
 * - Outside click detection
 * - All return cleanup functions
 *
 * @example
 * ```TypeScript
 * // One-time listener
 * const cleanup = EventUtils.once(document, 'click', () => {
 *   console.log('First click!');
 * });
 *
 * // Event delegation
 * const cleanup = EventUtils.delegate(
 *   document.body,
 *   'button',
 *   'click',
 *   (event, target) => {
 *     console.log('Button clicked:', target);
 *   }
 * );
 *
 * // Outside click
 * const cleanup = EventUtils.onOutsideClick(dropdown, () => {
 *   dropdown.classList.remove('open');
 * });
 * ```
 */

import type { CleanupFn } from '../core/types.js';

export const EventUtils = {
  // =========================================================================
  // One-time Listeners
  // =========================================================================

  /**
   * Add a one-time event listener that auto-removes after first trigger.
   * @param target Event target (Element, Window, Document)
   * @param event Event type
   * @param handler Event handler
   * @param options Event listener options (capture, passive)
   * @returns Cleanup function to remove listener before it triggers
   */
  once(
    target: EventTarget,
    event: string,
    handler: (event: Event) => void,
    options?: AddEventListenerOptions
  ): CleanupFn {
    const wrappedHandler = (e: Event): void => {
      target.removeEventListener(event, wrappedHandler, options);
      handler(e);
    };

    target.addEventListener(event, wrappedHandler, options);

    return (): void => {
      target.removeEventListener(event, wrappedHandler, options);
    };
  },

  // =========================================================================
  // Event Delegation
  // =========================================================================

  /**
   * Add event delegation - listen on a container for events from matching descendants.
   * @param container Parent element to listen on
   * @param selector CSS selector for target elements
   * @param event Event type
   * @param handler Handler receives the event and the matched element
   * @param options Event listener options
   * @returns Cleanup function
   */
  delegate(
    container: Element,
    selector: string,
    event: string,
    handler: (event: Event, target: Element) => void,
    options?: AddEventListenerOptions
  ): CleanupFn {
    const delegateHandler = (e: Event): void => {
      const eventTarget = e.target as Element | null;
      const matchedTarget = eventTarget?.closest(selector);
      if (matchedTarget != null && container.contains(matchedTarget)) {
        handler(e, matchedTarget);
      }
    };

    container.addEventListener(event, delegateHandler, options);

    return (): void => {
      container.removeEventListener(event, delegateHandler, options);
    };
  },

  // =========================================================================
  // Outside Click
  // =========================================================================

  /**
   * Detect clicks outside an element.
   * Useful for closing dropdowns, modals, etc.
   * @param element Element to monitor
   * @param handler Called when click occurs outside element
   * @param options Additional options
   * @param options.touch Also trigger on touch events
   * @param options.exclude Elements to exclude from outside detection
   * @returns Cleanup function
   */
  onOutsideClick(
    element: Element,
    handler: (event: MouseEvent) => void,
    options?: {
      touch?: boolean;
      exclude?: Element[];
    }
  ): CleanupFn {
    const { touch = false, exclude = [] } = options ?? {};

    const isOutside = (event: MouseEvent | TouchEvent): boolean => {
      const target = event.target as Element | null;
      if (target === null) return false;

      // Check if inside main element
      if (element.contains(target)) return false;

      // Check if inside excluded elements
      for (const excluded of exclude) {
        if (excluded.contains(target)) return false;
      }

      return true;
    };

    const clickHandler = (event: MouseEvent): void => {
      if (isOutside(event)) {
        handler(event);
      }
    };

    const touchHandler = (event: TouchEvent): void => {
      if (isOutside(event)) {
        // Create a synthetic mouse event for the handler
        handler(event as unknown as MouseEvent);
      }
    };

    document.addEventListener('click', clickHandler, true);

    if (touch) {
      document.addEventListener('touchstart', touchHandler, true);
    }

    return (): void => {
      document.removeEventListener('click', clickHandler, true);
      if (touch) {
        document.removeEventListener('touchstart', touchHandler, true);
      }
    };
  },

  // =========================================================================
  // Keyboard Events
  // =========================================================================

  /**
   * Listen for specific key press.
   * @param target Event target
   * @param key Key to listen for (e.g., 'Escape', 'Enter', 'a')
   * @param handler Handler function
   * @param options Event options and modifiers
   * @param options.capture Use capture phase
   * @param options.ctrl Require Ctrl key
   * @param options.shift Require Shift key
   * @param options.alt Require Alt key
   * @param options.meta Require Meta key
   * @param options.preventDefault Prevent default behavior
   * @returns Cleanup function
   */
  onKey(
    target: EventTarget,
    key: string,
    handler: (event: KeyboardEvent) => void,
    options?: {
      capture?: boolean;
      ctrl?: boolean;
      shift?: boolean;
      alt?: boolean;
      meta?: boolean;
      preventDefault?: boolean;
    }
  ): CleanupFn {
    const {
      capture = false,
      ctrl = false,
      shift = false,
      alt = false,
      meta = false,
      preventDefault = false,
    } = options ?? {};

    const keyHandler = (e: Event): void => {
      const event = e as KeyboardEvent;

      // Check key match
      if (event.key !== key) return;

      // Check modifiers
      if (ctrl && !event.ctrlKey) return;
      if (shift && !event.shiftKey) return;
      if (alt && !event.altKey) return;
      if (meta && !event.metaKey) return;

      // Prevent default if requested
      if (preventDefault) {
        event.preventDefault();
      }

      handler(event);
    };

    target.addEventListener('keydown', keyHandler, { capture });

    return () => {
      target.removeEventListener('keydown', keyHandler, { capture });
    };
  },

  // =========================================================================
  // Multiple Events
  // =========================================================================

  /**
   * Add same handler to multiple events.
   * @param target Event target
   * @param events Array of event types
   * @param handler Event handler
   * @param options Event listener options
   * @returns Cleanup function that removes all listeners
   */
  on(
    target: EventTarget,
    events: string[],
    handler: (event: Event) => void,
    options?: AddEventListenerOptions
  ): CleanupFn {
    for (const event of events) {
      target.addEventListener(event, handler, options);
    }

    return () => {
      for (const event of events) {
        target.removeEventListener(event, handler, options);
      }
    };
  },
};
