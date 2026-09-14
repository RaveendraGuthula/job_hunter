import type { ControlKind, DetectedControl, FieldOption } from "./form-engine-types";

const INPUT_KINDS: Record<string, ControlKind> = {
  text: "text",
  email: "email",
  tel: "tel",
  url: "url",
  number: "number",
  date: "date",
  password: "password",
  search: "text",
  hidden: "hidden",
  checkbox: "checkbox",
  radio: "radio",
  file: "file",
  button: "button",
  submit: "submit",
  reset: "button",
  color: "other",
  range: "other",
  time: "other",
  datetime: "date",
  "datetime-local": "date",
  month: "date",
  week: "date",
};

function classifyElementKind(element: HTMLElement): ControlKind {
  if (element instanceof HTMLTextAreaElement) {
    return "textarea";
  }
  if (element instanceof HTMLSelectElement) {
    return "select";
  }
  if (element instanceof HTMLInputElement) {
    return INPUT_KINDS[element.type] ?? "text";
  }
  if (element instanceof HTMLButtonElement) {
    const type = element.type;
    return type === "submit" ? "submit" : "button";
  }
  if (element.isContentEditable || element.getAttribute("role") === "textbox") {
    return "contenteditable";
  }
  return "other";
}

function labelsFor(element: HTMLElement): HTMLLabelElement[] {
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    const linked = element.labels ?? [];
    return Array.from(linked);
  }
  const byFor = Array.from(document.querySelectorAll<HTMLLabelElement>("label")).filter((label) =>
    label.htmlFor !== "" ? label.htmlFor === element.id && element.id !== "" : label.contains(element),
  );
  return byFor;
}

function wrappingLabelText(element: HTMLElement): string | null {
  const parent = element.closest("label");
  if (parent instanceof HTMLLabelElement && parent.htmlFor === "") {
    return (parent.textContent ?? "").replace(/\s+/g, " ").trim();
  }
  return null;
}

function nearestLabelText(element: HTMLElement): string | null {
  for (const label of labelsFor(element)) {
    const text = (label.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text.length > 0) {
      return text;
    }
  }
  return wrappingLabelText(element);
}

function nameAttribute(element: HTMLElement): string | null {
  const name = element.getAttribute("name");
  return name && name.length > 0 ? name : null;
}

function autocompleteAttribute(element: HTMLElement): string | null {
  const value = element.getAttribute("autocomplete");
  return value && value.length > 0 ? value : null;
}

function ariaLabel(element: HTMLElement): string | null {
  const value = element.getAttribute("aria-label");
  return value && value.length > 0 ? value : null;
}

function placeholderOf(element: HTMLElement): string | null {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const value = element.placeholder;
    return value && value.length > 0 ? value : null;
  }
  return null;
}

function nearbyTextOf(element: HTMLElement): string {
  const parts: string[] = [];
  const previous = element.previousElementSibling;
  if (previous instanceof HTMLElement) {
    const text = (previous.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text.length > 0 && text.length <= 120) {
      parts.push(text);
    }
  }
  const row = element.closest("div, tr, li, section, fieldset");
  if (row instanceof HTMLElement) {
    const text = (row.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text.length > 0 && text.length <= 160) {
      parts.push(text);
    }
  }
  return parts.join(" | ");
}

function optionsOf(element: HTMLElement): FieldOption[] {
  if (element instanceof HTMLSelectElement) {
    return Array.from(element.options).map((option) => ({
      value: option.value,
      text: (option.textContent ?? "").replace(/\s+/g, " ").trim(),
    }));
  }
  return [];
}

function requiredOf(element: HTMLElement): boolean {
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    return element.required || element.getAttribute("aria-required") === "true";
  }
  return element.getAttribute("aria-required") === "true";
}

function isCandidateKind(kind: ControlKind): boolean {
  return (
    kind === "text" ||
    kind === "email" ||
    kind === "tel" ||
    kind === "url" ||
    kind === "number" ||
    kind === "date" ||
    kind === "textarea" ||
    kind === "select" ||
    kind === "radio" ||
    kind === "checkbox" ||
    kind === "contenteditable"
  );
}

let sequence = 0;

export function detectControls(root: Document | HTMLElement): DetectedControl[] {
  sequence = 0;
  const scope = root instanceof Document ? root.body : root;
  const elements = Array.from(
    scope.querySelectorAll<HTMLElement>(
      'input, textarea, select, button, [contenteditable="true"], [role="textbox"]',
    ),
  );
  const detected: DetectedControl[] = [];
  for (const element of elements) {
    const kind = classifyElementKind(element);
    if (!isCandidateKind(kind)) {
      continue;
    }
    const labelText = nearestLabelText(element);
    const placeholder = placeholderOf(element);
    const aria = ariaLabel(element);
    const name = nameAttribute(element);
    const autocomplete = autocompleteAttribute(element);
    const nearby = nearbyTextOf(element);
    detected.push({
      id: `f${++sequence}`,
      element,
      kind,
      labelText,
      placeholder,
      ariaLabel: aria,
      name,
      autocomplete,
      nearbyText: nearby,
      required: requiredOf(element),
      options: optionsOf(element),
    });
  }
  return detected;
}

export function groupRadios(controls: DetectedControl[]): DetectedControl[] {
  const result: DetectedControl[] = [];
  const byGroup = new Map<string, DetectedControl[]>();
  const singles: DetectedControl[] = [];
  for (const control of controls) {
    if (control.kind === "radio" && control.name) {
      const group = byGroup.get(control.name) ?? [];
      group.push(control);
      byGroup.set(control.name, group);
    } else {
      singles.push(control);
    }
  }
  for (const group of byGroup.values()) {
    const representative = { ...group[0], radios: group.map((entry) => entry.element as HTMLInputElement) };
    result.push(representative);
  }
  return [...result, ...singles];
}