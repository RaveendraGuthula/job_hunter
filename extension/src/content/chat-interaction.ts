import type { ChatInput, ChatOptionButton } from "./chat-engine-types";

const FINAL_APPLY_PATTERN = /^\s*(submit|submit application|submit my application|apply|apply now|finish|complete|confirm)\s*$/i;

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function nativeSetter(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
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

export function typeInput(input: ChatInput, value: string): void {
  if (input.type === "contenteditable") {
    input.element.textContent = value;
    dispatch(input.element, "input");
    dispatch(input.element, "change");
    return;
  }
  if (input.element instanceof HTMLTextAreaElement || input.element instanceof HTMLInputElement) {
    nativeSetter(input.element, value);
    dispatch(input.element, "input");
    dispatch(input.element, "change");
  }
}

export function findMatchingOption(options: ChatOptionButton[], value: string): ChatOptionButton | null {
  const target = canonical(value);
  for (const option of options) {
    const candidate = canonical(option.text);
    if (candidate === target) {
      return option;
    }
  }
  for (const option of options) {
    const candidate = canonical(option.text);
    if (candidate !== "" && (candidate.startsWith(target) || target.startsWith(candidate))) {
      return option;
    }
  }
  return null;
}

function canonical(value: string): string {
  return normalize(value).replace(/\b(?:years|year|yrs|yr)\b/g, "").replace(/[+.]+/g, "").trim();
}

export function clickOption(option: ChatOptionButton): boolean {
  option.element.click();
  return true;
}

export function sendAnswer(input: ChatInput): boolean {
  const button = input.sendButton;
  if (button === null) {
    return false;
  }
  const label = normalize(`${button.getAttribute("aria-label") || ""} ${button.textContent || ""}`);
  if (FINAL_APPLY_PATTERN.test(label)) {
    return false;
  }
  button.click();
  return true;
}