import type { ChatMessage, MessageRole } from "./chat-engine-types";
import type { RawMessage } from "./chatbot-detector";

const SYSTEM_TEXT_PATTERN =
  /(joined|left the chat|requested to join|is typing|started a video|ended the video|added to the group|removed from the group|created this chat|no longer available|you are now connected)/i;

const MAX_QUESTIONS_PER_MESSAGE = 6;
const MIN_QUESTION_LENGTH = 5;

export function classifyMessageRole(raw: RawMessage): MessageRole {
  if (raw.hints.hasInteractiveControls) {
    return "BOT";
  }
  if (raw.hints.centerAligned || SYSTEM_TEXT_PATTERN.test(raw.text)) {
    return "SYSTEM";
  }
  if (raw.hints.rightAligned) {
    return "USER";
  }
  return "BOT";
}

export function toChatMessages(raw: RawMessage[]): ChatMessage[] {
  return raw.map((entry) => {
    const role = classifyMessageRole(entry);
    return {
      id: entry.id,
      role,
      text: entry.text,
      timestamp: new Date().toISOString(),
      domFingerprint: entry.id,
    };
  });
}

export function segmentQuestionTexts(text: string): string[] {
  const lines = text
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const chunks: string[] = [];
  for (const line of lines) {
    const parts = splitLine(line);
    for (const part of parts) {
      if (part.length >= MIN_QUESTION_LENGTH) {
        chunks.push(part);
      } else if (chunks.length > 0) {
        chunks[chunks.length - 1] = `${chunks[chunks.length - 1]} ${part}`.trim();
      }
      if (chunks.length >= MAX_QUESTIONS_PER_MESSAGE) {
        return chunks;
      }
    }
  }
  return chunks;
}

function splitLine(line: string): string[] {
  const questionMarks = (line.match(/\?/g) ?? []).length;
  if (questionMarks < 2) {
    return [line];
  }
  const parts = line.split(/(?<=\?)\s*/).map((part) => part.trim()).filter((part) => part.length > 0);
  return parts.length > 1 ? parts : [line];
}

export function normalizeQuestionText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(e-mail|emial|emaill)\b/g, " email")
    .replace(/\bexp\b/g, " experience")
    .replace(/\bctc\b/g, " salary")
    .trim();
}

export function fingerprintOf(text: string): string {
  return fnv1a(normalizeQuestionText(text));
}

export function fingerprintOfMessage(message: ChatMessage): string {
  return `${message.role}:${fingerprintOf(message.text)}`;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}