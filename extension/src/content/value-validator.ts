import type { DetectedControl } from "./form-engine-types";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const PHONE_PATTERN = /^\+?[0-9\s().-]{6,}$/;

function normalizeValue(value: string): string {
  return value.trim();
}

export function validateFill(control: DetectedControl, value: string): string | null {
  const normalized = normalizeValue(value);

  if (control.required && normalized.length === 0) {
    return "This required field would be left empty.";
  }

  switch (control.kind) {
    case "email":
      if (!EMAIL_PATTERN.test(normalized)) {
        return "Proposed value is not a valid email address.";
      }
      break;
    case "tel":
      if (!PHONE_PATTERN.test(normalized)) {
        return "Proposed value is not a valid phone number.";
      }
      break;
    case "number": {
      const parsed = Number(normalized);
      if (normalized.length === 0 || Number.isNaN(parsed)) {
        return "Proposed value is not a number.";
      }
      const element = control.element as HTMLInputElement;
      const min = element.min !== "" ? Number(element.min) : Number.NaN;
      const max = element.max !== "" ? Number(element.max) : Number.NaN;
      if (!Number.isNaN(min) && parsed < min) {
        return `Proposed value (${parsed}) is below the field minimum (${min}).`;
      }
      if (!Number.isNaN(max) && parsed > max) {
        return `Proposed value (${parsed}) exceeds the field maximum (${max}).`;
      }
      break;
    }
    case "date": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(Date.parse(normalized))) {
        return "Proposed value is not a valid date (YYYY-MM-DD).";
      }
      break;
    }
    default:
      break;
  }

  const maxLength = control.element.getAttribute("maxlength");
  if (maxLength !== null && normalized.length > Number(maxLength)) {
    return `Proposed value (${normalized.length} chars) exceeds the field limit (${maxLength}).`;
  }

  const pattern = control.element.getAttribute("pattern");
  if (pattern && normalized.length > 0) {
    try {
      if (!new RegExp(`^(?:${pattern})$`).test(normalized)) {
        return "Proposed value does not match the field's allowed pattern.";
      }
    } catch {
      // Invalid pattern in the page: do not block on it.
    }
  }

  return null;
}