/**
 * AriaUtils - ARIA attribute management utilities.
 *
 * Provides safe methods for setting and managing ARIA attributes on DOM elements.
 * Validates attribute names and values to prevent misuse.
 *
 * @example
 * ```TypeScript
 * // Set ARIA attributes
 * AriaUtils.set(button, 'expanded', 'true');
 * AriaUtils.set(dialog, 'modal', 'true');
 *
 * // Toggle boolean ARIA attributes
 * AriaUtils.toggle(button, 'expanded');
 *
 * // Set role
 * AriaUtils.setRole(element, 'dialog');
 *
 * // Remove attribute
 * AriaUtils.remove(button, 'expanded');
 * ```
 */
import { ValidationError } from '../core/index.js';

/**
 * Valid ARIA attribute names (without the 'aria-' prefix).
 */
const VALID_ARIA_ATTRIBUTES = new Set([
  'activedescendant',
  'atomic',
  'autocomplete',
  'braillelabel',
  'brailleroledescription',
  'busy',
  'checked',
  'colcount',
  'colindex',
  'colindextext',
  'colspan',
  'controls',
  'current',
  'describedby',
  'description',
  'details',
  'disabled',
  'errormessage',
  'expanded',
  'flowto',
  'haspopup',
  'hidden',
  'invalid',
  'keyshortcuts',
  'label',
  'labelledby',
  'level',
  'live',
  'modal',
  'multiline',
  'multiselectable',
  'orientation',
  'owns',
  'placeholder',
  'posinset',
  'pressed',
  'readonly',
  'relevant',
  'required',
  'roledescription',
  'rowcount',
  'rowindex',
  'rowindextext',
  'rowspan',
  'selected',
  'setsize',
  'sort',
  'valuemax',
  'valuemin',
  'valuenow',
  'valuetext',
] as const);

/**
 * Valid ARIA role values.
 */
const VALID_ROLES = new Set([
  'alert',
  'alertdialog',
  'application',
  'article',
  'banner',
  'blockquote',
  'button',
  'caption',
  'cell',
  'checkbox',
  'code',
  'columnheader',
  'combobox',
  'comment',
  'complementary',
  'contentinfo',
  'definition',
  'deletion',
  'dialog',
  'directory',
  'document',
  'emphasis',
  'feed',
  'figure',
  'form',
  'generic',
  'grid',
  'gridcell',
  'group',
  'heading',
  'img',
  'insertion',
  'link',
  'list',
  'listbox',
  'listitem',
  'log',
  'main',
  'mark',
  'marquee',
  'math',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'meter',
  'navigation',
  'none',
  'note',
  'option',
  'paragraph',
  'presentation',
  'progressbar',
  'radio',
  'radiogroup',
  'region',
  'row',
  'rowgroup',
  'rowheader',
  'scrollbar',
  'search',
  'searchbox',
  'separator',
  'slider',
  'spinbutton',
  'status',
  'strong',
  'subscript',
  'superscript',
  'switch',
  'tab',
  'table',
  'tablist',
  'tabpanel',
  'term',
  'textbox',
  'time',
  'timer',
  'toolbar',
  'tooltip',
  'tree',
  'treegrid',
  'treeitem',
] as const);

// noinspection JSUnusedGlobalSymbols
export const AriaUtils = {
  /**
   * Set an ARIA attribute on an element.
   *
   * @param element - Target DOM element
   * @param attribute - ARIA attribute name (without 'aria-' prefix)
   * @param value - Attribute value
   * @throws {ValidationError} If attribute name is not a valid ARIA attribute
   */
  set(element: Element, attribute: string, value: string): void {
    AriaUtils.validateAttribute(attribute);
    element.setAttribute(`aria-${attribute}`, value);
  },

  /**
   * Get an ARIA attribute value from an element.
   *
   * @param element - Target DOM element
   * @param attribute - ARIA attribute name (without 'aria-' prefix)
   * @returns The attribute value, or null if not set
   * @throws {ValidationError} If attribute name is not a valid ARIA attribute
   */
  get(element: Element, attribute: string): string | null {
    AriaUtils.validateAttribute(attribute);
    return element.getAttribute(`aria-${attribute}`);
  },

  /**
   * Remove an ARIA attribute from an element.
   *
   * @param element - Target DOM element
   * @param attribute - ARIA attribute name (without 'aria-' prefix)
   * @throws {ValidationError} If attribute name is not a valid ARIA attribute
   */
  remove(element: Element, attribute: string): void {
    AriaUtils.validateAttribute(attribute);
    element.removeAttribute(`aria-${attribute}`);
  },

  /**
   * Toggle a boolean ARIA attribute.
   *
   * Toggles between 'true' and 'false'. If the attribute is not set, sets it to 'true'.
   *
   * @param element - Target DOM element
   * @param attribute - ARIA attribute name (without 'aria-' prefix)
   * @returns The new value ('true' or 'false')
   * @throws {ValidationError} If attribute name is not a valid ARIA attribute
   */
  toggle(element: Element, attribute: string): string {
    AriaUtils.validateAttribute(attribute);
    const current = element.getAttribute(`aria-${attribute}`);
    const newValue = current === 'true' ? 'false' : 'true';
    element.setAttribute(`aria-${attribute}`, newValue);
    return newValue;
  },

  /**
   * Set the role attribute on an element.
   *
   * @param element - Target DOM element
   * @param role - ARIA role value
   * @throws {ValidationError} If role is not a valid ARIA role
   */
  setRole(element: Element, role: string): void {
    if (!VALID_ROLES.has(role as typeof VALID_ROLES extends Set<infer T> ? T : never)) {
      throw ValidationError.invalidFormat('role', role, 'a valid ARIA role');
    }
    element.setAttribute('role', role);
  },

  /**
   * Get the role attribute from an element.
   *
   * @param element - Target DOM element
   * @returns The role value, or null if not set
   */
  getRole(element: Element): string | null {
    return element.getAttribute('role');
  },

  /**
   * Remove the role attribute from an element.
   *
   * @param element - Target DOM element
   */
  removeRole(element: Element): void {
    element.removeAttribute('role');
  },

  /**
   * Validate that an attribute name is a known ARIA attribute.
   *
   * @param attribute - Attribute name to validate (without 'aria-' prefix)
   * @throws {ValidationError} If not a valid ARIA attribute
   * @internal
   */
  validateAttribute(attribute: string): void {
    if (
      !VALID_ARIA_ATTRIBUTES.has(
        attribute as typeof VALID_ARIA_ATTRIBUTES extends Set<infer T> ? T : never
      )
    ) {
      throw ValidationError.invalidFormat(
        'aria-attribute',
        attribute,
        'a valid ARIA attribute name (without aria- prefix)'
      );
    }
  },
};
