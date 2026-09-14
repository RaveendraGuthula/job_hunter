import type { ChatInput, ChatInputType, ChatOptionButton } from "./chat-engine-types";

export interface RawMessageHints {
  rightAligned: boolean;
  centerAligned: boolean;
  hasInteractiveControls: boolean;
}

export interface RawMessage {
  id: string;
  element: HTMLElement;
  text: string;
  hints: RawMessageHints;
}

export interface ChatContainerDetection {
  container: HTMLElement;
  rawMessages: RawMessage[];
  input: ChatInput | null;
  optionButtons: ChatOptionButton[];
}

const CHAT_ROLE_SELECTOR = '[role="log"], [role="conversation"], [role="loglist"]';
const CHAT_NAME_SELECTOR = [
  '[id*="chat" i]',
  '[class*="chat" i]',
  '[id*="conversation" i]',
  '[class*="conversation" i]',
  '[id*="message-thread" i]',
  '[class*="message-thread" i]',
  '[id*="chatbot" i]',
  '[class*="chatbot" i]',
].join(", ");

const CHAT_NAME_PATTERN = /(chat|conversation|message|thread|chatbot|dialog|bot)/i;
const CHAT_REGION_SELECTOR = [
  '[id*="chat" i]',
  '[class*="chat" i]',
  '[class*="conversation" i]',
  '[id*="conversation" i]',
  '[class*="message" i]',
  '[id*="message" i]',
  "form",
].join(", ");
const BUBBLE_PATTERN = /(message|bubble|msg|chat-message|chat-user|chat-bot|conversation-item)/i;
const USER_PATTERN = /(user|sent|outgoing|right|self)/i;
const CENTER_PATTERN = /(system|info|center|notice|status)/i;
const SEND_PATTERN = /^\s*(send|send message|^>|reply|respond)\s*$/i;
const FINAL_APPLY_PATTERN = /^\s*(submit|submit application|submit my application|apply|apply now|finish|complete|confirm)\s*$/i;

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function ancestorPath(element: HTMLElement): string {
  const segments: string[] = [];
  let node: HTMLElement | null = element;
  while (node !== null && node !== document.documentElement && node !== document.body) {
    const parent: HTMLElement | null = node.parentElement;
    let index = 0;
    if (parent !== null) {
      index = Array.from(parent.children).indexOf(node as HTMLElement);
    }
    segments.unshift(`${node.tagName.toLowerCase()}[${index}]`);
    node = parent;
  }
  segments.unshift("root");
  return segments.join("/");
}

function classNameOf(element: HTMLElement): string {
  const id = element.id || "";
  const cls = typeof element.className === "string" ? element.className : "";
  return `${id} ${cls}`;
}

function containerScore(element: HTMLElement): number {
  const role = element.getAttribute("role") || "";
  const label = `${element.getAttribute("aria-label") || ""} ${classNameOf(element)}`;
  let score = 0;
  if (role === "log" || role === "conversation" || role === "loglist") {
    score += 6;
  }
  if (element.getAttribute("aria-live") === "polite") {
    score += 3;
  }
  if (CHAT_NAME_PATTERN.test(label)) {
    score += 2;
  }
  const rect = element.getBoundingClientRect();
  if (rect.height >= 200 && rect.width >= 200) {
    score += 2;
  }
  return score;
}

function chatRegionNear(container: HTMLElement): HTMLElement {
  const ancestor = container.closest(CHAT_REGION_SELECTOR);
  return ancestor instanceof HTMLElement ? ancestor : container;
}

export function detectChatContainer(root: Document | HTMLElement): ChatContainerDetection | null {
  const scope = root instanceof Document ? root.body : root;
  if (!scope) {
    return null;
  }

  const candidates = new Map<HTMLElement, number>();
  for (const element of Array.from(scope.querySelectorAll<HTMLElement>(CHAT_ROLE_SELECTOR))) {
    candidates.set(element, containerScore(element));
  }
  for (const element of Array.from(scope.querySelectorAll<HTMLElement>(CHAT_NAME_SELECTOR))) {
    if (!candidates.has(element)) {
      candidates.set(element, containerScore(element));
    }
  }

  let best: HTMLElement | null = null;
  let bestScore = 0;
  for (const [element, score] of candidates) {
    if (score > bestScore) {
      best = element;
      bestScore = score;
    }
  }

  if (best === null || bestScore < 1) {
    return null;
  }

  const rawMessages = extractMessages(best);
  const region = chatRegionNear(best);
  const input = findChatInput(region);
  const optionButtons = findOptionButtons(region);

  if (rawMessages.length === 0 && input === null && optionButtons.length === 0) {
    return null;
  }

  return { container: best, rawMessages, input, optionButtons };
}

function isLikelyBubble(element: HTMLElement): boolean {
  const label = `${element.getAttribute("aria-label") || ""} ${classNameOf(element)} ${element.getAttribute("role") || ""}`;
  return BUBBLE_PATTERN.test(label);
}

export function extractMessages(container: HTMLElement): RawMessage[] {
  const raw: RawMessage[] = [];
  const log = container.matches('[role="log"], [role="conversation"], [role="loglist"]')
    ? container
    : container.querySelector<HTMLElement>('[role="log"], [role="conversation"], [role="loglist"]');
  const source = log ?? container;

  const candidates: HTMLElement[] = [];
  if (log !== null) {
    candidates.push(
      ...Array.from(log.children).filter((child): child is HTMLElement => child instanceof HTMLElement),
    );
  } else {
    candidates.push(
      ...Array.from(
        source.querySelectorAll<HTMLElement>(
          '[class*="message" i], [class*="bubble" i], [id*="message" i], [role="listitem"]',
        ),
      ),
    );
  }

  let sequence = 0;
  const seen = new Set<HTMLElement>();
  for (const element of candidates) {
    if (seen.has(element) || !isLikelyBubble(element)) {
      continue;
    }
    if (element.matches("textarea, [contenteditable='true'], input, form, button")) {
      continue;
    }
    const text = normalizeText(element.textContent);
    if (text.length === 0) {
      continue;
    }
    seen.add(element);
    const style = globalThis.getComputedStyle ? globalThis.getComputedStyle(element) : null;
    const rightAligned = USER_PATTERN.test(classNameOf(element)) || style?.alignSelf === "flex-end";
    const centerAligned = CENTER_PATTERN.test(classNameOf(element)) || style?.textAlign === "center";
    const hasInteractiveControls = element.querySelector("button, select, input[type='radio'], input[type='checkbox']") !== null;
    raw.push({
      id: `m${++sequence}`,
      element,
      text,
      hints: { rightAligned, centerAligned, hasInteractiveControls },
    });
  }

  return raw;
}

function chatInputTypeOf(element: HTMLElement): ChatInputType {
  if (element instanceof HTMLTextAreaElement) {
    return "textarea";
  }
  if (element instanceof HTMLSelectElement) {
    return "select";
  }
  if (element.isContentEditable || element.getAttribute("role") === "textbox") {
    return "contenteditable";
  }
  return "text";
}

export function findChatInput(container: HTMLElement): ChatInput | null {
  const fields = Array.from(
    container.querySelectorAll<HTMLElement>(
      'textarea, [contenteditable="true"], [role="textbox"], input[type="text"], input[type="search"], input:not([type])',
    ),
  );
  const element =
    fields.find((el) => el instanceof HTMLTextAreaElement) ??
    fields.find((el) => el.isContentEditable || el.getAttribute("role") === "textbox") ??
    fields[0] ??
    null;
  if (element === null) {
    return null;
  }
  return { element, type: chatInputTypeOf(element), sendButton: findSendButton(element, container) };
}

function findSendButton(input: HTMLElement, container: HTMLElement): HTMLButtonElement | null {
  const candidates = Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
  const labelOf = (button: HTMLButtonElement): string =>
    normalizeText(button.getAttribute("aria-label") || button.textContent || "");

  let named: HTMLButtonElement | null = null;
  for (const button of candidates) {
    const label = labelOf(button);
    if (SEND_PATTERN.test(label) && !FINAL_APPLY_PATTERN.test(label)) {
      named = button;
      break;
    }
  }
  if (named !== null) {
    return named;
  }

  const form = input.closest("form");
  const area = form ?? input.parentElement;
  if (area !== null) {
    const icon = Array.from(area.querySelectorAll<HTMLButtonElement>("button")).find((button) => {
      const label = labelOf(button);
      return (button.querySelector("svg") !== null || button.querySelector("img") !== null) && label.length <= 40;
    });
    if (icon !== undefined && !FINAL_APPLY_PATTERN.test(labelOf(icon))) {
      return icon;
    }
  }
  return null;
}

export function findOptionButtons(container: HTMLElement): ChatOptionButton[] {
  const options: ChatOptionButton[] = [];
  for (const button of Array.from(container.querySelectorAll<HTMLButtonElement>("button"))) {
    const text = normalizeText(button.textContent);
    const aria = normalizeText(button.getAttribute("aria-label"));
    const label = aria || text;
    if (label.length === 0 || label.length > 80) {
      continue;
    }
    if (SEND_PATTERN.test(label) || FINAL_APPLY_PATTERN.test(label)) {
      continue;
    }
    if (button.querySelector("textarea, input, select") !== null) {
      continue;
    }
    options.push({ element: button, text: label });
  }
  return options;
}