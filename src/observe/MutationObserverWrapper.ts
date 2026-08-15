/**
 * Mutation Observer Wrapper - DOM change detection.
 *
 * Features:
 * - Simplified API for common use cases
 * - Automatic cleanup
 * - Attribute, child, and text change detection
 * - Filtered observation
 *
 * **API Pattern:** Stateless utility object with static methods (no instantiation needed).
 * All observer wrappers follow this pattern for consistency.
 *
 * **Recommended Usage:**
 * - Use `observe()` for full control (returns cleanup, observer, and takeRecords)
 * - Use convenience methods like `onAttributeChange()`, `onChildChange()` for specific mutation types
 * - Note: No `observeAll()` method - MutationObserver naturally handles a single root node with `subtree` option
 * - Always call the cleanup function to prevent memory leaks
 *
 * @example
 * ```TypeScript
 * // Watch for any changes
 * const cleanup = MutationObserverWrapper.observe(element, (mutations) => {
 *   console.log('DOM changed:', mutations);
 * });
 *
 * // Watch for attribute changes only
 * const cleanup = MutationObserverWrapper.onAttributeChange(element, (name, value) => {
 *   console.log(`Attribute ${name} changed to:`, value);
 * });
 *
 * // Watch for child changes
 * const cleanup = MutationObserverWrapper.onChildChange(element, (added, removed) => {
 *   console.log('Added:', added.length, 'Removed:', removed.length);
 * });
 * ```
 */
import type { CleanupFn } from '../core/index.js';

export interface MutationOptions {
  /**
   * Observe attribute changes.
   * @default false
   */
  readonly attributes?: boolean;

  /**
   * Observe child list changes.
   * @default false
   */
  readonly childList?: boolean;

  /**
   * Observe character data changes.
   * @default false
   */
  readonly characterData?: boolean;

  /**
   * Observe subtree.
   * @default false
   */
  readonly subtree?: boolean;

  /**
   * Record old attribute values.
   * @default false
   */
  readonly attributeOldValue?: boolean;

  /**
   * Record old character data values.
   * @default false
   */
  readonly characterDataOldValue?: boolean;

  /**
   * Filter to specific attribute names.
   */
  readonly attributeFilter?: readonly string[];
}

export interface ObserveResult {
  /**
   * Cleanup function to stop observing.
   */
  readonly cleanup: CleanupFn;

  /**
   * The underlying MutationObserver instance.
   * Returns null when MutationObserver is not supported.
   */
  readonly observer: MutationObserver | null;

  /**
   * Get pending mutations without waiting for callback.
   */
  readonly takeRecords: () => MutationRecord[];
}

export const MutationObserverWrapper = {
  // =========================================================================
  // Core API
  // =========================================================================

  /**
   * Check if MutationObserver is supported.
   */
  isSupported(): boolean {
    return typeof MutationObserver !== 'undefined';
  },

  /**
   * Observe a node for mutations.
   * @param node Node to observe
   * @param callback Called when mutations occur
   * @param options Observer options
   * @returns Object with cleanup, observer, and takeRecords
   */
  observe(
    node: Node,
    callback: (mutations: MutationRecord[], observer: MutationObserver | null) => void,
    options?: MutationOptions
  ): ObserveResult {
    if (!MutationObserverWrapper.isSupported()) {
      return {
        cleanup: (): void => {},
        observer: null,
        takeRecords: (): MutationRecord[] => [],
      };
    }

    const observer = new MutationObserver(callback);

    // Default to observing everything if no options specified
    const opts: MutationObserverInit = {
      attributes: options?.attributes ?? false,
      childList: options?.childList ?? false,
      characterData: options?.characterData ?? false,
      subtree: options?.subtree ?? false,
      attributeOldValue: options?.attributeOldValue ?? false,
      characterDataOldValue: options?.characterDataOldValue ?? false,
    };

    // If no specific options set, observe all
    if (opts.attributes !== true && opts.childList !== true && opts.characterData !== true) {
      opts.attributes = true;
      opts.childList = true;
      opts.characterData = true;
    }

    if (options?.attributeFilter !== undefined) {
      opts.attributeFilter = [...options.attributeFilter];
    }

    observer.observe(node, opts);

    return {
      cleanup: () => observer.disconnect(),
      observer,
      takeRecords: () => observer.takeRecords(),
    };
  },

  // =========================================================================
  // Convenience Methods
  // =========================================================================

  /**
   * Watch for attribute changes on an element.
   * @param element Element to observe
   * @param callback Called when attributes change
   * @param attributeFilter Optional list of attribute names to watch
   * @returns Cleanup function
   */
  onAttributeChange(
    element: Element,
    callback: (
      attributeName: string,
      newValue: string | null,
      oldValue: string | null,
      target: Element
    ) => void,
    attributeFilter?: readonly string[]
  ): CleanupFn {
    const { cleanup } = MutationObserverWrapper.observe(
      element,
      (mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes' && mutation.attributeName !== null) {
            const newValue = (mutation.target as Element).getAttribute(mutation.attributeName);
            callback(
              mutation.attributeName,
              newValue,
              mutation.oldValue,
              mutation.target as Element
            );
          }
        }
      },
      {
        attributes: true,
        attributeOldValue: true,
        attributeFilter,
      }
    );

    return cleanup;
  },

  /**
   * Watch for child node changes.
   * @param element Element to observe
   * @param callback Called when children are added or removed
   * @param subtree Also watch descendant nodes
   * @returns Cleanup function
   */
  onChildChange(
    element: Element,
    callback: (addedNodes: Node[], removedNodes: Node[], target: Node) => void,
    subtree = false
  ): CleanupFn {
    const { cleanup } = MutationObserverWrapper.observe(
      element,
      (mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            const added = Array.from(mutation.addedNodes);
            const removed = Array.from(mutation.removedNodes);
            if (added.length > 0 || removed.length > 0) {
              callback(added, removed, mutation.target);
            }
          }
        }
      },
      {
        childList: true,
        subtree,
      }
    );

    return cleanup;
  },

  /**
   * Watch for text content changes.
   * @param node Node to observe
   * @param callback Called when text content changes
   * @param subtree Also watch descendant nodes
   * @returns Cleanup function
   */
  onTextChange(
    node: Node,
    callback: (newValue: string | null, oldValue: string | null, target: Node) => void,
    subtree = false
  ): CleanupFn {
    const { cleanup } = MutationObserverWrapper.observe(
      node,
      (mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'characterData') {
            callback(mutation.target.textContent, mutation.oldValue, mutation.target);
          }
        }
      },
      {
        characterData: true,
        characterDataOldValue: true,
        subtree,
      }
    );

    return cleanup;
  },

  /**
   * Watch for a specific class to be added to an element.
   * @param element Element to observe
   * @param className Class name to watch for
   * @param callback Called when class is added or removed
   * @returns Cleanup function
   */
  onClassChange(
    element: Element,
    className: string,
    callback: (hasClass: boolean) => void
  ): CleanupFn {
    let hadClass = element.classList.contains(className);

    return MutationObserverWrapper.onAttributeChange(
      element,
      (attrName, newValue) => {
        if (attrName === 'class') {
          const hasClass = newValue?.split(/\s+/).includes(className) ?? false;
          if (hasClass !== hadClass) {
            hadClass = hasClass;
            callback(hasClass);
          }
        }
      },
      ['class']
    );
  },

  /**
   * Watch for an element to be added to the DOM.
   * @param parent Parent element to watch
   * @param selector CSS selector to match
   * @param callback Called when matching element is added
   * @returns Cleanup function
   */
  onElementAdded(
    parent: Element,
    selector: string,
    callback: (element: Element) => void
  ): CleanupFn {
    return MutationObserverWrapper.onChildChange(
      parent,
      (addedNodes) => {
        for (const node of addedNodes) {
          if (node instanceof Element) {
            if (node.matches(selector)) {
              callback(node);
            }
            // Also check descendants
            const descendants = node.querySelectorAll(selector);
            descendants.forEach(callback);
          }
        }
      },
      true
    );
  },

  /**
   * Watch for an element to be removed from the DOM.
   * @param parent Parent element to watch
   * @param selector CSS selector to match
   * @param callback Called when matching element is removed
   * @returns Cleanup function
   */
  onElementRemoved(
    parent: Element,
    selector: string,
    callback: (element: Element) => void
  ): CleanupFn {
    return MutationObserverWrapper.onChildChange(
      parent,
      (_, removedNodes) => {
        for (const node of removedNodes) {
          if (node instanceof Element) {
            if (node.matches(selector)) {
              callback(node);
            }
            // Also check descendants
            const descendants = node.querySelectorAll(selector);
            descendants.forEach(callback);
          }
        }
      },
      true
    );
  },
};
