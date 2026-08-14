/**
 * Focus Trap - Trap keyboard focus within a container.
 *
 * Essential for accessibility in modals, dialogs, and dropdowns.
 * Prevents focus from escaping to elements outside the container.
 *
 * Features:
 * - Traps Tab and Shift+Tab navigation
 * - Optional initial focus element
 * - Optional return focus on deactivate
 * - Escape key deactivation
 * - Pause/unpause support
 *
 * @example
 * ```TypeScript
 * // Create focus trap for modal
 * const trap = FocusTrap.create(modalElement, {
 *   initialFocus: modalElement.querySelector('input'),
 *   returnFocus: true,
 *   escapeDeactivates: true,
 * });
 *
 * // Activate when modal opens
 * trap.activate();
 *
 * // Deactivate when modal closes
 * trap.deactivate();
 * ```
 */
import { FocusUtils } from './FocusUtils.js';

export interface FocusTrapOptions {
  /**
   * Element to focus when trap is activated.
   * Defaults to first focusable element.
   */
  readonly initialFocus?: HTMLElement | string | null;

  /**
   * Return focus to previously focused element on deactivate.
   * @default true
   */
  readonly returnFocus?: boolean;

  /**
   * Deactivate trap when Escape key is pressed.
   * @default false
   */
  readonly escapeDeactivates?: boolean;

  /**
   * Callback when Escape key deactivates the trap.
   */
  readonly onEscapeDeactivate?: () => void;

  /**
   * Allow clicks outside the trap container.
   * If false, clicks outside are prevented.
   * @default true
   */
  readonly allowOutsideClick?: boolean;
}

export interface FocusTrapInstance {
  /**
   * Activate the focus trap.
   */
  activate(): void;

  /**
   * Deactivate the focus trap.
   */
  deactivate(): void;

  /**
   * Pause the focus trap (allows focus to leave temporarily).
   */
  pause(): void;

  /**
   * Unpause the focus trap.
   */
  unpause(): void;

  /**
   * Check if the trap is currently active.
   */
  isActive(): boolean;

  /**
   * Check if the trap is currently paused.
   */
  isPaused(): boolean;
}

export const FocusTrap = {
  /**
   * Create a focus trap for a container element.
   * @param container Element to trap focus within
   * @param options Focus trap options
   */
  create(container: HTMLElement, options: FocusTrapOptions = {}): FocusTrapInstance {
    const {
      initialFocus = null,
      returnFocus = true,
      escapeDeactivates = false,
      onEscapeDeactivate,
      allowOutsideClick = true,
    } = options;

    let active = false;
    let paused = false;
    let previouslyFocused: Element | null = null;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (paused) return;

      // Handle Escape
      if (event.key === 'Escape' && escapeDeactivates) {
        event.preventDefault();
        deactivate();
        onEscapeDeactivate?.();
        return;
      }

      // Handle Tab
      if (event.key === 'Tab') {
        handleTab(event);
      }
    };

    const handleTab = (event: KeyboardEvent): void => {
      // Check if container is still in the document
      if (!document.contains(container)) return;

      const focusables = FocusUtils.getFocusableElements(container);

      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }

      const firstFocusable = focusables[0]!;
      const lastFocusable = focusables[focusables.length - 1]!;
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        // Shift+Tab: going backwards
        if (activeElement === firstFocusable || !container.contains(activeElement)) {
          event.preventDefault();
          lastFocusable.focus();
        }
      } else {
        // Tab: going forwards
        if (activeElement === lastFocusable || !container.contains(activeElement)) {
          event.preventDefault();
          firstFocusable.focus();
        }
      }
    };

    const handleFocusIn = (event: FocusEvent): void => {
      if (paused) return;

      // Check if container is still in the document
      if (!document.contains(container)) return;

      const target = event.target as Element | null;

      // If focus went outside container, bring it back
      if (target !== null && !container.contains(target)) {
        event.stopImmediatePropagation();
        FocusUtils.focusFirstFocusable(container);
      }
    };

    const handleClick = (event: MouseEvent): void => {
      if (paused || allowOutsideClick) return;

      // Check if container is still in the document
      if (!document.contains(container)) return;

      const target = event.target as Element | null;

      if (target !== null && !container.contains(target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    const activate = (): void => {
      if (active) return;

      active = true;
      previouslyFocused = document.activeElement;

      // Add event listeners
      document.addEventListener('keydown', handleKeyDown, true);
      document.addEventListener('focusin', handleFocusIn, true);

      if (!allowOutsideClick) {
        document.addEventListener('click', handleClick, true);
      }

      // Set initial focus
      requestAnimationFrame(() => {
        if (!active) return;

        let elementToFocus: HTMLElement | null = null;

        if (initialFocus !== null) {
          if (typeof initialFocus === 'string') {
            elementToFocus = container.querySelector(initialFocus);
          } else {
            elementToFocus = initialFocus;
          }
        }

        if (elementToFocus !== null && FocusUtils.isFocusable(elementToFocus)) {
          elementToFocus.focus();
        } else {
          FocusUtils.focusFirstFocusable(container);
        }
      });
    };

    const deactivate = (): void => {
      if (!active) return;

      active = false;
      paused = false;

      // Remove event listeners
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('click', handleClick, true);

      // Return focus
      if (returnFocus && previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus();
      }

      previouslyFocused = null;
    };

    const pause = (): void => {
      if (!active) return;
      paused = true;
    };

    const unpause = (): void => {
      if (!active) return;
      paused = false;
    };

    return {
      activate,
      deactivate,
      pause,
      unpause,
      isActive: (): boolean => active,
      isPaused: (): boolean => paused,
    };
  },
};
