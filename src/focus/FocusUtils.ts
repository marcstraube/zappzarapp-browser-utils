/**
 * Focus Utilities - Helpers for managing focus.
 *
 * Features:
 * - Get focusable elements
 * - Check if element is focusable
 * - Focus first focusable element
 *
 * @example
 * ```TypeScript
 * // Get all focusable elements in container
 * const focusables = FocusUtils.getFocusableElements(container);
 *
 * // Focus first focusable
 * FocusUtils.focusFirstFocusable(container);
 *
 * // Check if element is focusable
 * if (FocusUtils.isFocusable(element)) {
 *   element.focus();
 * }
 * ```
 */

/**
 * Selector for focusable elements.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
  'audio[controls]',
  'video[controls]',
  'details > summary:first-of-type',
].join(',');

export const FocusUtils = {
  /**
   * Get all focusable elements within a container.
   * @param container Container element
   * @param includeContainer Include the container itself if focusable
   * @returns Array of focusable HTMLElements
   */
  getFocusableElements(container: Element, includeContainer = false): HTMLElement[] {
    const elements = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (el) => FocusUtils.isFocusable(el)
    );

    if (includeContainer && container instanceof HTMLElement && FocusUtils.isFocusable(container)) {
      elements.unshift(container);
    }

    return elements;
  },

  /**
   * Get the first focusable element within a container.
   */
  getFirstFocusable(container: Element): HTMLElement | null {
    const focusables = FocusUtils.getFocusableElements(container);
    return focusables[0] ?? null;
  },

  /**
   * Get the last focusable element within a container.
   */
  getLastFocusable(container: Element): HTMLElement | null {
    const focusables = FocusUtils.getFocusableElements(container);
    return focusables[focusables.length - 1] ?? null;
  },

  /**
   * Focus the first focusable element within a container.
   * @returns true if an element was focused, false otherwise
   */
  focusFirstFocusable(container: Element): boolean {
    const first = FocusUtils.getFirstFocusable(container);

    if (first !== null) {
      first.focus();
      return true;
    }

    return false;
  },

  /**
   * Focus the last focusable element within a container.
   * @returns true if an element was focused, false otherwise
   */
  focusLastFocusable(container: Element): boolean {
    const last = FocusUtils.getLastFocusable(container);

    if (last !== null) {
      last.focus();
      return true;
    }

    return false;
  },

  /**
   * Check if an element is focusable.
   */
  isFocusable(element: Element): boolean {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    // Check if element matches focusable selector
    if (!element.matches(FOCUSABLE_SELECTOR)) {
      return false;
    }

    // Check visibility
    if (!FocusUtils.isVisible(element)) {
      return false;
    }

    // Check for disabled attribute on form elements
    if ('disabled' in element && (element as HTMLInputElement).disabled) {
      return false;
    }

    // Check tabindex
    const tabindex = element.getAttribute('tabindex');
    return tabindex === null || parseInt(tabindex, 10) >= 0;
  },

  /**
   * Check if an element is visible (not hidden, not display:none).
   */
  isVisible(element: Element): boolean {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    // Check if element has size
    if (element.offsetWidth === 0 && element.offsetHeight === 0) {
      return false;
    }

    // Check hidden attribute
    if (element.hidden === true) {
      return false;
    }

    // Check computed visibility
    const style = getComputedStyle(element);

    return style.visibility !== 'hidden' && style.display !== 'none';
  },

  /**
   * Check if an element is tabbable (can be reached via Tab key).
   */
  isTabbable(element: Element): boolean {
    if (!FocusUtils.isFocusable(element)) {
      return false;
    }

    const tabindex = element.getAttribute('tabindex');

    // Elements with tabindex="-1" are focusable but not tabbable
    return tabindex === null || parseInt(tabindex, 10) >= 0;
  },

  /**
   * Save and restore focus.
   * Useful when temporarily moving focus and wanting to restore it later.
   */
  saveFocus(): () => void {
    const previouslyFocused = document.activeElement;

    return () => {
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus();
      }
    };
  },

  /**
   * Move focus to next focusable element.
   * @param container Container to search within (defaults to document)
   * @returns true if focus was moved
   */
  focusNext(container: Element = document.documentElement): boolean {
    const focusables = FocusUtils.getFocusableElements(container);
    const currentIndex = focusables.indexOf(document.activeElement as HTMLElement);

    if (currentIndex === -1 || currentIndex === focusables.length - 1) {
      // Focus first if not found or at end
      return FocusUtils.focusFirstFocusable(container);
    }

    focusables[currentIndex + 1]!.focus();
    return true;
  },

  /**
   * Move focus to previous focusable element.
   * @param container Container to search within (defaults to document)
   * @returns true if focus was moved
   */
  focusPrevious(container: Element = document.documentElement): boolean {
    const focusables = FocusUtils.getFocusableElements(container);
    const currentIndex = focusables.indexOf(document.activeElement as HTMLElement);

    if (currentIndex === -1 || currentIndex === 0) {
      // Focus last if not found or at start
      return FocusUtils.focusLastFocusable(container);
    }

    focusables[currentIndex - 1]!.focus();
    return true;
  },
};
