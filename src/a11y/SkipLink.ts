/**
 * SkipLink - Skip navigation link utility.
 *
 * Creates accessible "skip to content" links that become visible on focus.
 * Essential for keyboard-only users to bypass repetitive navigation.
 *
 * @example
 * ```TypeScript
 * // Create a skip link
 * const cleanup = SkipLink.create({
 *   targetId: 'main-content',
 *   text: 'Skip to main content',
 * });
 *
 * // Cleanup when done
 * cleanup();
 * ```
 */
import type { CleanupFn } from '../core/index.js';
import { ValidationError } from '../core/index.js';

/**
 * Configuration options for a skip link.
 */
export interface SkipLinkConfig {
  /**
   * ID of the target element to skip to.
   */
  readonly targetId: string;

  /**
   * Text displayed in the skip link.
   * @default 'Skip to main content'
   */
  readonly text?: string;

  /**
   * CSS class name for custom styling.
   * @default undefined (uses built-in styles)
   */
  readonly className?: string;
}

export const SkipLink = {
  /**
   * Create a skip navigation link.
   *
   * The link is visually hidden by default and becomes visible when focused
   * via keyboard navigation. It scrolls to and focuses the target element.
   *
   * @param config - Skip link configuration
   * @returns Cleanup function to remove the skip link
   * @throws {ValidationError} If targetId is empty
   */
  create(config: SkipLinkConfig): CleanupFn {
    if (!config.targetId) {
      throw ValidationError.empty('targetId');
    }

    const text = config.text ?? 'Skip to main content';
    const link = document.createElement('a');
    link.href = `#${config.targetId}`;
    link.textContent = text;

    if (config.className !== undefined && config.className !== '') {
      link.className = config.className;
    } else {
      // Apply visually-hidden-until-focused styles
      Object.assign(link.style, {
        position: 'absolute',
        left: '-9999px',
        top: 'auto',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
        zIndex: '999999',
      });

      // Show on focus
      link.addEventListener('focus', () => {
        Object.assign(link.style, {
          position: 'fixed',
          left: '8px',
          top: '8px',
          width: 'auto',
          height: 'auto',
          overflow: 'visible',
          padding: '8px 16px',
          background: '#000',
          color: '#fff',
          textDecoration: 'none',
          fontSize: '14px',
          borderRadius: '4px',
        });
      });

      // Hide on blur
      link.addEventListener('blur', () => {
        Object.assign(link.style, {
          position: 'absolute',
          left: '-9999px',
          top: 'auto',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
          padding: '0',
          background: '',
          color: '',
          textDecoration: '',
          fontSize: '',
          borderRadius: '',
        });
      });
    }

    // Handle click: focus the target element
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const target = document.getElementById(config.targetId);
      if (target) {
        // Ensure target is focusable
        if (!target.hasAttribute('tabindex')) {
          target.setAttribute('tabindex', '-1');
        }
        target.focus();
      }
    });

    // Insert at the beginning of body
    document.body.insertBefore(link, document.body.firstChild);

    return () => {
      link.remove();
    };
  },
};
