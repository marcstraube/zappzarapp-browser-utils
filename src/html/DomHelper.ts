/**
 * DOM Helper Utilities.
 *
 * Safe DOM manipulation with XSS prevention.
 * Prefer these methods over direct innerHTML assignment.
 *
 * @example
 * ```TypeScript
 * // Safe text content (auto-escaped)
 * DomHelper.setText(element, userInput);
 *
 * // Create elements safely
 * const span = DomHelper.create('span', { class: 'highlight' }, userInput);
 * ```
 */
import { HtmlEscaper } from './HtmlEscaper.js';

export const DomHelper = {
  /**
   * Set text content safely.
   * Uses textContent which automatically escapes HTML.
   *
   * @param element - Target element
   * @param text - Text content (safe, no escaping needed)
   */
  setText(element: Element, text: string): void {
    element.textContent = text;
  },

  /**
   * Create an element with safe content.
   *
   * @param tag - Tag name
   * @param attrs - Attributes (class, id, data-*, etc.)
   * @param textContent - Text content (auto-escaped via textContent)
   */
  create<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs: Record<string, string> = {},
    textContent?: string
  ): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);

    const urlAttributes = new Set([
      'href',
      'src',
      'action',
      'formaction',
      'data',
      'poster',
      'cite',
      'background',
      'codebase',
      'usemap',
    ]);

    for (const [name, value] of Object.entries(attrs)) {
      // Skip event handlers
      if (name.startsWith('on')) {
        continue;
      }
      // Validate URL safety only for URL-type attributes
      if (urlAttributes.has(name.toLowerCase()) && !HtmlEscaper.isSafeUrl(value)) {
        continue;
      }
      element.setAttribute(name, value);
    }

    if (textContent !== undefined) {
      element.textContent = textContent;
    }

    return element;
  },

  /**
   * Create a text node.
   *
   * @param text - Text content (inherently safe)
   */
  createText(text: string): Text {
    return document.createTextNode(text);
  },

  /**
   * Append multiple children to an element.
   *
   * @param parent - Parent element
   * @param children - Children to append
   */
  append(parent: Element, ...children: Array<Node | string>): void {
    for (const child of children) {
      if (typeof child === 'string') {
        parent.appendChild(document.createTextNode(child));
      } else {
        parent.appendChild(child);
      }
    }
  },

  /**
   * Remove all children from an element.
   *
   * @param element - Element to clear
   */
  clear(element: Element): void {
    element.textContent = '';
  },

  /**
   * Query selector with type safety.
   *
   * @param selector - CSS selector
   * @param parent - Parent element (default: document)
   */
  query<K extends keyof HTMLElementTagNameMap>(
    selector: K,
    parent: ParentNode = document
  ): HTMLElementTagNameMap[K] | null {
    return parent.querySelector(selector);
  },

  /**
   * Query all matching elements.
   *
   * @param selector - CSS selector
   * @param parent - Parent element (default: document)
   */
  queryAll<K extends keyof HTMLElementTagNameMap>(
    selector: K,
    parent: ParentNode = document
  ): NodeListOf<HTMLElementTagNameMap[K]> {
    return parent.querySelectorAll(selector);
  },

  /**
   * Add event listener with automatic cleanup.
   *
   * @param element - Target element
   * @param event - Event name
   * @param handler - Event handler
   * @param options - Event listener options
   * @returns Cleanup function
   */
  on<K extends keyof HTMLElementEventMap>(
    element: Element,
    event: K,
    handler: (e: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions
  ): () => void {
    element.addEventListener(event, handler as EventListener, options);
    return () => element.removeEventListener(event, handler as EventListener, options);
  },

  /**
   * Toggle CSS class.
   *
   * @param element - Target element
   * @param className - Class name
   * @param force - Force add (true) or remove (false)
   */
  toggleClass(element: Element, className: string, force?: boolean): boolean {
    return element.classList.toggle(className, force);
  },

  /**
   * Check if element has a class.
   */
  hasClass(element: Element, className: string): boolean {
    return element.classList.contains(className);
  },

  /**
   * Add classes to element.
   */
  addClass(element: Element, ...classNames: string[]): void {
    element.classList.add(...classNames);
  },

  /**
   * Remove classes from element.
   */
  removeClass(element: Element, ...classNames: string[]): void {
    element.classList.remove(...classNames);
  },

  /**
   * Set data attribute.
   */
  setData(element: HTMLElement, key: string, value: string): void {
    element.dataset[key] = value;
  },

  /**
   * Get data attribute.
   */
  getData(element: HTMLElement, key: string): string | undefined {
    return element.dataset[key];
  },

  /**
   * Show element (remove hidden class or set display).
   */
  show(element: HTMLElement, display = 'block'): void {
    element.style.display = display;
  },

  /**
   * Hide element.
   */
  hide(element: HTMLElement): void {
    element.style.display = 'none';
  },

  /**
   * Check if element is visible.
   */
  isVisible(element: HTMLElement): boolean {
    return element.style.display !== 'none' && element.offsetParent !== null;
  },
};
