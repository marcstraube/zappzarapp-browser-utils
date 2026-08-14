/**
 * Form Utilities - Common form operations.
 *
 * Features:
 * - Dirty state detection
 * - Enable/disable forms
 * - Field utilities
 *
 * @example
 * ```TypeScript
 * // Check if form has been modified
 * if (FormUtils.isDirty(form)) {
 *   if (!confirm('You have unsaved changes. Leave anyway?')) {
 *     return;
 *   }
 * }
 *
 * // Disable form during submission
 * FormUtils.disable(form);
 * await submit();
 * FormUtils.enable(form);
 * ```
 */

import type { CleanupFn } from '../core/index.js';

// ============================================================================
// Strategy Pattern: Element Dirty Checkers
// ============================================================================

interface ElementDirtyChecker {
  canCheck(element: Element): boolean;
  isDirty(element: Element): boolean;
}

class InputDirtyChecker implements ElementDirtyChecker {
  canCheck(element: Element): boolean {
    return element instanceof HTMLInputElement;
  }

  isDirty(element: Element): boolean {
    const input = element as HTMLInputElement;
    if (input.type === 'checkbox' || input.type === 'radio') {
      return input.checked !== input.defaultChecked;
    }
    if (input.type !== 'submit' && input.type !== 'button') {
      return input.value !== input.defaultValue;
    }
    return false;
  }
}

class SelectDirtyChecker implements ElementDirtyChecker {
  canCheck(element: Element): boolean {
    return element instanceof HTMLSelectElement;
  }

  isDirty(element: Element): boolean {
    const select = element as HTMLSelectElement;
    for (const option of Array.from(select.options)) {
      if (option.selected !== option.defaultSelected) {
        return true;
      }
    }
    return false;
  }
}

class TextAreaDirtyChecker implements ElementDirtyChecker {
  canCheck(element: Element): boolean {
    return element instanceof HTMLTextAreaElement;
  }

  isDirty(element: Element): boolean {
    const textarea = element as HTMLTextAreaElement;
    return textarea.value !== textarea.defaultValue;
  }
}

// ============================================================================
// Strategy Pattern: Field Value Setters
// ============================================================================

interface FieldValueSetter {
  canSet(element: Element | RadioNodeList): boolean;
  setValue(element: Element | RadioNodeList, value: unknown): void;
}

class RadioNodeListValueSetter implements FieldValueSetter {
  canSet(element: Element | RadioNodeList): boolean {
    return element instanceof RadioNodeList;
  }

  setValue(element: Element | RadioNodeList, value: unknown): void {
    const nodeList = element as RadioNodeList;
    for (const item of Array.from(nodeList)) {
      if (item instanceof HTMLInputElement) {
        if (item.type === 'checkbox') {
          item.checked = Array.isArray(value)
            ? value.includes(item.value)
            : item.value === String(value);
        } else if (item.type === 'radio') {
          item.checked = item.value === String(value);
        }
      }
    }
  }
}

class InputValueSetter implements FieldValueSetter {
  canSet(element: Element | RadioNodeList): boolean {
    return element instanceof HTMLInputElement;
  }

  setValue(element: Element | RadioNodeList, value: unknown): void {
    const input = element as HTMLInputElement;
    if (input.type === 'checkbox') {
      input.checked = Boolean(value);
    } else if (input.type === 'file') {
      // Cannot set file input value (security)
    } else {
      input.value = FormUtils.valueToString(value);
    }
  }
}

class SelectValueSetter implements FieldValueSetter {
  canSet(element: Element | RadioNodeList): boolean {
    return element instanceof HTMLSelectElement;
  }

  setValue(element: Element | RadioNodeList, value: unknown): void {
    const select = element as HTMLSelectElement;
    select.value = FormUtils.valueToString(value);
  }
}

class TextAreaValueSetter implements FieldValueSetter {
  canSet(element: Element | RadioNodeList): boolean {
    return element instanceof HTMLTextAreaElement;
  }

  setValue(element: Element | RadioNodeList, value: unknown): void {
    const textarea = element as HTMLTextAreaElement;
    textarea.value = FormUtils.valueToString(value);
  }
}

export const FormUtils = {
  /**
   * Check if form has been modified from its initial state.
   */
  isDirty(form: HTMLFormElement): boolean {
    const dirtyCheckers: ElementDirtyChecker[] = [
      new InputDirtyChecker(),
      new SelectDirtyChecker(),
      new TextAreaDirtyChecker(),
    ];

    for (const element of Array.from(form.elements)) {
      for (const checker of dirtyCheckers) {
        if (checker.canCheck(element) && checker.isDirty(element)) {
          return true;
        }
      }
    }

    return false;
  },

  /**
   * Disable all form elements.
   */
  disable(form: HTMLFormElement): void {
    for (const element of Array.from(form.elements)) {
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLButtonElement
      ) {
        element.disabled = true;
      }
    }
  },

  /**
   * Enable all form elements.
   */
  enable(form: HTMLFormElement): void {
    for (const element of Array.from(form.elements)) {
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLButtonElement
      ) {
        element.disabled = false;
      }
    }
  },

  /**
   * Set loading state (disable form and show loading indicator).
   * @returns Cleanup function to restore state
   */
  setLoading(form: HTMLFormElement, submitButton?: HTMLButtonElement): CleanupFn {
    const originalButtonText = submitButton?.textContent ?? '';
    const wasDisabled = new Map<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement,
      boolean
    >();

    // Store original disabled state
    for (const element of Array.from(form.elements)) {
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLButtonElement
      ) {
        wasDisabled.set(element, element.disabled);
        element.disabled = true;
      }
    }

    // Update button text if provided
    if (submitButton !== undefined) {
      submitButton.textContent = 'Loading...';
    }

    return () => {
      // Restore original disabled state. The map only ever holds disableable
      // elements (see the store loop above), so no instanceof re-check is needed.
      for (const [element, disabled] of wasDisabled) {
        element.disabled = disabled;
      }

      // Restore button text
      if (submitButton !== undefined) {
        submitButton.textContent = originalButtonText;
      }
    };
  },

  /**
   * Focus first invalid field in form.
   * @returns true if an invalid field was focused
   */
  focusFirstInvalid(form: HTMLFormElement): boolean {
    for (const element of Array.from(form.elements)) {
      if (
        (element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement) &&
        !element.validity.valid
      ) {
        element.focus();
        return true;
      }
    }

    return false;
  },

  /**
   * Get all field names in a form.
   */
  getFieldNames(form: HTMLFormElement): string[] {
    const names = new Set<string>();

    for (const element of Array.from(form.elements)) {
      if (
        (element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement) &&
        element.name
      ) {
        names.add(element.name);
      }
    }

    return Array.from(names);
  },

  /**
   * Get a specific field element by name.
   */
  getField(form: HTMLFormElement, name: string): Element | RadioNodeList | null {
    return form.elements.namedItem(name);
  },

  /**
   * Set field value by name.
   */
  setFieldValue(form: HTMLFormElement, name: string, value: unknown): void {
    const element = form.elements.namedItem(name);

    if (element === null) return;

    const valueSetters: FieldValueSetter[] = [
      new RadioNodeListValueSetter(),
      new InputValueSetter(),
      new SelectValueSetter(),
      new TextAreaValueSetter(),
    ];

    for (const setter of valueSetters) {
      if (setter.canSet(element)) {
        setter.setValue(element, value);
        return;
      }
    }
  },

  /**
   * Safely convert a value to string.
   * @internal
   */
  valueToString(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return '';
  },

  /**
   * Track form dirty state and warn before leaving page.
   * @returns Cleanup function
   */
  warnOnUnsavedChanges(form: HTMLFormElement): CleanupFn {
    const beforeUnloadHandler = (event: BeforeUnloadEvent): void => {
      if (FormUtils.isDirty(form)) {
        event.preventDefault();
      }
    };

    window.addEventListener('beforeunload', beforeUnloadHandler);

    return () => {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
    };
  },
};
