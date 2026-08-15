/**
 * Form Serializer - Convert forms to/from various formats.
 *
 * Features:
 * - Form to plain object
 * - Form to FormData
 * - Form to query string
 * - Populate form from object
 *
 * @example
 * ```TypeScript
 * // Serialize form to object
 * const data = FormSerializer.toObject(form);
 * // { username: 'john', password: 'secret' }
 *
 * // Serialize to FormData
 * const formData = FormSerializer.toFormData(form);
 *
 * // Serialize to query string
 * const query = FormSerializer.toQueryString(form);
 * // 'username=john&password=secret'
 *
 * // Populate form from object
 * FormSerializer.fromObject(form, { username: 'jane' });
 * ```
 */

export type FormValue = string | string[] | File | File[] | null;

export const FormSerializer = {
  /**
   * Serialize form to plain object.
   * Handles multiple values (checkboxes, multi-select) as arrays.
   */
  toObject(form: HTMLFormElement): Record<string, FormValue> {
    // Group values by name
    const valuesByName = new Map<string, Array<FormDataEntryValue>>();

    // Iterate form elements directly to handle multi-select properly
    for (const element of Array.from(form.elements)) {
      FormSerializer.collectElementValue(element, valuesByName);
    }

    return FormSerializer.convertValuesToResult(valuesByName);
  },

  /**
   * Collect values from a form element into the values map.
   * @internal
   */
  collectElementValue(
    element: Element,
    valuesByName: Map<string, Array<FormDataEntryValue>>
  ): void {
    if (element instanceof HTMLInputElement) {
      FormSerializer.collectInputValue(element, valuesByName);
    } else if (element instanceof HTMLSelectElement) {
      FormSerializer.collectSelectValue(element, valuesByName);
    } else if (element instanceof HTMLTextAreaElement) {
      FormSerializer.collectTextAreaValue(element, valuesByName);
    }
  },

  /**
   * Collect values from an input element.
   * @internal
   */
  collectInputValue(
    element: HTMLInputElement,
    valuesByName: Map<string, Array<FormDataEntryValue>>
  ): void {
    const name = element.name;
    if (!name) return;

    const { type } = element;

    if (type === 'checkbox' || type === 'radio') {
      if (element.checked) {
        FormSerializer.addValue(valuesByName, name, element.value);
      }
      return;
    }

    if (type === 'file') {
      if (element.files !== null && element.files.length > 0) {
        for (const file of Array.from(element.files)) {
          FormSerializer.addValue(valuesByName, name, file);
        }
      }
      return;
    }

    if (type !== 'submit' && type !== 'button' && type !== 'reset') {
      FormSerializer.addValue(valuesByName, name, element.value);
    }
  },

  /**
   * Collect values from a select element.
   * @internal
   */
  collectSelectValue(
    element: HTMLSelectElement,
    valuesByName: Map<string, Array<FormDataEntryValue>>
  ): void {
    const name = element.name;
    if (!name) return;

    for (const option of Array.from(element.selectedOptions)) {
      FormSerializer.addValue(valuesByName, name, option.value);
    }
  },

  /**
   * Collect values from a textarea element.
   * @internal
   */
  collectTextAreaValue(
    element: HTMLTextAreaElement,
    valuesByName: Map<string, Array<FormDataEntryValue>>
  ): void {
    const name = element.name;
    if (!name) return;

    FormSerializer.addValue(valuesByName, name, element.value);
  },

  /**
   * Convert the values map to a result object.
   * @internal
   */
  convertValuesToResult(
    valuesByName: Map<string, Array<FormDataEntryValue>>
  ): Record<string, FormValue> {
    const result: Record<string, FormValue> = {};

    for (const [name, values] of valuesByName) {
      result[name] = FormSerializer.normalizeValues(values);
    }

    return result;
  },

  /**
   * Normalize an array of values to the appropriate FormValue type.
   * @internal
   */
  normalizeValues(values: FormDataEntryValue[]): FormValue {
    if (values.length === 1) {
      // A single value is returned as-is (string or File).
      return values[0]!;
    }

    // Multiple values - check if all are files
    const allFiles = values.every((v) => v instanceof File);
    if (allFiles) {
      return values;
    }

    return values.filter((v): v is string => typeof v === 'string');
  },

  /**
   * Serialize form to FormData.
   */
  toFormData(form: HTMLFormElement): FormData {
    return new FormData(form);
  },

  /**
   * Serialize form to URL-encoded query string.
   * Note: File inputs are excluded.
   */
  toQueryString(form: HTMLFormElement): string {
    const data = FormSerializer.toObject(form);
    const params = new URLSearchParams();

    for (const [name, value] of Object.entries(data)) {
      if (value === null) continue;

      if (Array.isArray(value)) {
        for (const v of value) {
          if (typeof v === 'string') {
            params.append(name, v);
          }
        }
      } else if (typeof value === 'string') {
        params.append(name, value);
      }
      // Files are skipped
    }

    return params.toString();
  },

  /**
   * Serialize form to URLSearchParams.
   * Note: File inputs are excluded.
   */
  toURLSearchParams(form: HTMLFormElement): URLSearchParams {
    return new URLSearchParams(FormSerializer.toQueryString(form));
  },

  /**
   * Serialize form to JSON string.
   * Note: File inputs are excluded.
   */
  toJSON(form: HTMLFormElement): string {
    const data = FormSerializer.toObject(form);

    // Remove file values for JSON serialization
    const jsonSafe: Record<string, string | string[] | null> = {};

    for (const [name, value] of Object.entries(data)) {
      if (value instanceof File) continue;
      if (Array.isArray(value) && value.some((v) => v instanceof File)) continue;
      jsonSafe[name] = value as string | string[] | null;
    }

    return JSON.stringify(jsonSafe);
  },

  /**
   * Populate form fields from an object.
   */
  fromObject(form: HTMLFormElement, data: Record<string, unknown>): void {
    for (const [name, value] of Object.entries(data)) {
      const elements = form.elements.namedItem(name);

      if (elements === null) continue;

      if (elements instanceof RadioNodeList) {
        // Multiple elements with same name (radio buttons or checkboxes)
        FormSerializer.setRadioNodeListValue(elements, value);
      } else {
        // Single named element
        FormSerializer.setElementValue(elements, value);
      }
    }
  },

  /**
   * Reset form to initial values.
   */
  reset(form: HTMLFormElement): void {
    form.reset();
  },

  /**
   * Clear all form values (different from reset which restores defaults).
   */
  clear(form: HTMLFormElement): void {
    for (const element of Array.from(form.elements)) {
      if (element instanceof HTMLInputElement) {
        if (element.type === 'checkbox' || element.type === 'radio') {
          element.checked = false;
        } else if (element.type !== 'submit' && element.type !== 'button') {
          element.value = '';
        }
      } else if (element instanceof HTMLSelectElement) {
        element.selectedIndex = -1;
      } else if (element instanceof HTMLTextAreaElement) {
        element.value = '';
      }
    }
  },

  // =========================================================================
  // Internal
  // =========================================================================

  /**
   * Set value on a RadioNodeList (multiple elements with same name).
   * @internal
   */
  setRadioNodeListValue(elements: RadioNodeList, value: unknown): void {
    for (const element of Array.from(elements)) {
      if (element instanceof HTMLInputElement) {
        if (element.type === 'checkbox') {
          if (Array.isArray(value)) {
            element.checked = value.includes(element.value);
          } else {
            element.checked = element.value === String(value);
          }
        } else if (element.type === 'radio') {
          element.checked = element.value === String(value);
        } else {
          element.value = FormSerializer.valueToString(value);
        }
      }
    }
  },

  /**
   * Set value on a single form element.
   * @internal
   */
  setElementValue(element: Element, value: unknown): void {
    if (element instanceof HTMLInputElement) {
      if (element.type === 'checkbox') {
        element.checked = Boolean(value);
      } else if (element.type === 'radio') {
        element.checked = element.value === FormSerializer.valueToString(value);
      } else if (element.type === 'file') {
        // Cannot programmatically set file input value (security)
      } else {
        element.value = FormSerializer.valueToString(value);
      }
    } else if (element instanceof HTMLSelectElement) {
      if (element.multiple && Array.isArray(value)) {
        for (const option of Array.from(element.options)) {
          option.selected = value.includes(option.value);
        }
      } else {
        element.value = FormSerializer.valueToString(value);
      }
    } else if (element instanceof HTMLTextAreaElement) {
      element.value = FormSerializer.valueToString(value);
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
    // For objects, arrays, etc., return empty string
    return '';
  },

  /**
   * Add a value to the values map.
   * @internal
   */
  addValue(
    valuesByName: Map<string, Array<FormDataEntryValue>>,
    name: string,
    value: FormDataEntryValue
  ): void {
    const existing = valuesByName.get(name);
    if (existing !== undefined) {
      existing.push(value);
    } else {
      valuesByName.set(name, [value]);
    }
  },
};
