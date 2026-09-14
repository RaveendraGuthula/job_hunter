import type { DetectedControl, FieldIntent, FillRecord, ProposedAnswer } from "./form-engine-types";

const SUBMISSION_PROOF_KINDS = new Set(["password", "hidden", "file", "submit", "button", "other"]);

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function descriptorOf(control: DetectedControl): string {
  return control.labelText ?? control.placeholder ?? control.ariaLabel ?? control.name ?? control.nearbyText ?? "field";
}

function nativeSetter(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const prototype =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }
}

function dispatch(element: HTMLElement, type: string): void {
  element.dispatchEvent(new Event(type, { bubbles: true }));
}

function fillTextControl(control: DetectedControl, value: string): void {
  if (control.kind === "contenteditable") {
    control.element.textContent = value;
    dispatch(control.element, "input");
    dispatch(control.element, "change");
    return;
  }
  const element = control.element as HTMLInputElement | HTMLTextAreaElement;
  nativeSetter(element, value);
  dispatch(element, "input");
  dispatch(element, "change");
}

function optionMatchesText(option: HTMLOptionElement, proposed: string): boolean {
  const candidate = normalize(option.textContent ?? "") || normalize(option.value);
  return candidate === proposed || option.value === proposed;
}

function fillSelect(control: DetectedControl, intent: FieldIntent, value: string): FillRecord {
  const select = control.element as HTMLSelectElement;
  const target = Array.from(select.options).find((option) => optionMatchesText(option, normalize(value)));
  if (!target || target.disabled) {
    return record(control, intent, "skipped", "no matching option for the proposed value", value, null);
  }
  nativeSetter(select, target.value);
  dispatch(select, "change");
  return record(control, intent, "applied", "selected option", value, null);
}

function fillRadio(control: DetectedControl, intent: FieldIntent, value: string): FillRecord {
  const group = control.radios ?? [control.element as HTMLInputElement];
  const proposed = normalize(value);
  const yesNo = yesNoMap.get(proposed);
  let target: HTMLInputElement | null = null;
  for (const radio of group) {
    const label = radio.closest("label")?.textContent ?? "";
    const candidate = normalize(radio.value) || normalize(label);
    if (candidate === proposed || (yesNo !== undefined && yesNo === radio.value)) {
      target = radio;
      break;
    }
  }
  if (!target || target.disabled) {
    return record(control, intent, "skipped", "no matching radio option for the proposed value", value, null);
  }
  target.click();
  return record(control, intent, "applied", "selected radio option", value, null);
}

const yesNoMap = new Map<string, string>([
  ["yes", "Yes"],
  ["no", "No"],
  ["true", "True"],
  ["false", "False"],
  ["1", "1"],
  ["0", "0"],
]);

function fillCheckbox(control: DetectedControl, intent: FieldIntent, value: string): FillRecord {
  const element = control.element as HTMLInputElement;
  const proposed = normalize(value);
  const yes = ["yes", "true", "1", "y"].includes(proposed);
  const no = ["no", "false", "0", "n"].includes(proposed);
  let checked = yes;
  if (!yes && !no) {
    if (proposed === normalize(element.value) || proposed === normalize(element.getAttribute("aria-label") ?? "")) {
      checked = true;
    } else {
      return record(control, intent, "skipped", "proposed value does not map to this checkbox", value, null);
    }
  }
  if (element.checked !== checked) {
    element.click();
  } else {
    dispatch(element, "change");
  }
  return record(control, intent, "applied", checked ? "checked" : "unchecked", value, null);
}

function record(
  control: DetectedControl,
  intent: FieldIntent,
  status: "applied" | "skipped" | "blocked",
  note: string,
  value: string | null,
  source: ProposedAnswer["source"] | null,
): FillRecord {
  return {
    controlId: control.id,
    descriptor: descriptorOf(control),
    intent,
    kind: control.kind,
    status,
    value,
    source,
    note,
  };
}

export function tryFill(control: DetectedControl, intent: FieldIntent, answer: ProposedAnswer): FillRecord {
  const base = record(control, intent, "applied", "", answer.value, answer.source);

  if (SUBMISSION_PROOF_KINDS.has(control.kind)) {
    return { ...base, status: "blocked", note: "This control is never auto-filled (security).", value: null, source: null };
  }

  switch (control.kind) {
    case "text":
    case "email":
    case "tel":
    case "url":
    case "number":
    case "date":
    case "textarea":
    case "contenteditable":
      fillTextControl(control, answer.value);
      return base;
    case "select":
      return fillSelect(control, intent, answer.value);
    case "radio":
      return fillRadio(control, intent, answer.value);
    case "checkbox":
      return fillCheckbox(control, intent, answer.value);
    default:
      return { ...base, status: "blocked", note: "Unsupported control type; not auto-filled.", value: null, source: null };
  }
}