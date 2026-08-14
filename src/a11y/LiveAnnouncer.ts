/**
 * LiveAnnouncer - Screen reader live region announcements.
 *
 * Creates and manages ARIA live regions for dynamic content announcements.
 * Supports both polite and assertive announcements.
 *
 * @example
 * ```TypeScript
 * // Create announcer
 * const announcer = LiveAnnouncer.create();
 *
 * // Polite announcement (queued after current speech)
 * announcer.announce('Item added to cart');
 *
 * // Assertive announcement (interrupts current speech)
 * announcer.announce('Error: form validation failed', 'assertive');
 *
 * // Cleanup when done
 * announcer.destroy();
 * ```
 */

/**
 * Live region politeness setting.
 */
export type LivePoliteness = 'polite' | 'assertive';

/**
 * LiveAnnouncer instance interface.
 */
export interface LiveAnnouncerInstance {
  /**
   * Announce a message to screen readers.
   *
   * @param message - Text message to announce
   * @param politeness - 'polite' (default, queued) or 'assertive' (interrupts)
   */
  announce(message: string, politeness?: LivePoliteness): void;

  /**
   * Clear the current announcement.
   */
  clear(): void;

  /**
   * Destroy the announcer and remove DOM elements.
   */
  destroy(): void;
}

/**
 * Delay before setting content to ensure screen readers detect the change.
 */
const ANNOUNCE_DELAY_MS = 100;

export const LiveAnnouncer = {
  /**
   * Create a new LiveAnnouncer instance.
   *
   * Creates a visually hidden live region element in the DOM.
   *
   * @returns LiveAnnouncerInstance
   */
  create(): LiveAnnouncerInstance {
    const politeRegion = createLiveRegion('polite');
    const assertiveRegion = createLiveRegion('assertive');

    let destroyed = false;

    return {
      announce(message: string, politeness: LivePoliteness = 'polite'): void {
        if (destroyed) return;

        const region = politeness === 'assertive' ? assertiveRegion : politeRegion;

        // Clear first, then set after a brief delay to ensure screen readers
        // detect the change even if the same message is announced twice
        region.textContent = '';
        setTimeout(() => {
          if (!destroyed) {
            region.textContent = message;
          }
        }, ANNOUNCE_DELAY_MS);
      },

      clear(): void {
        if (destroyed) return;
        politeRegion.textContent = '';
        assertiveRegion.textContent = '';
      },

      destroy(): void {
        if (destroyed) return;
        destroyed = true;
        politeRegion.remove();
        assertiveRegion.remove();
      },
    };
  },
};

/**
 * Create a visually hidden live region element.
 */
function createLiveRegion(politeness: LivePoliteness): HTMLElement {
  const element = document.createElement('div');
  element.setAttribute('aria-live', politeness);
  element.setAttribute('aria-atomic', 'true');
  element.setAttribute('role', 'status');

  // Visually hidden but accessible to screen readers
  Object.assign(element.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: '0',
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: '0',
  });

  document.body.appendChild(element);
  return element;
}
