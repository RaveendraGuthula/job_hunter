import type { AnswerSource, FieldIntent } from "./form-engine-types";

export type MessageRole = "BOT" | "USER" | "SYSTEM";

export type ChatInputType = "text" | "textarea" | "contenteditable" | "select" | "unknown";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  timestamp?: string;
  domFingerprint?: string;
}

export interface ChatOption {
  text: string;
  value?: string;
}

export interface ChatOptionButton {
  element: HTMLButtonElement;
  text: string;
}

export interface ChatInput {
  element: HTMLElement;
  type: ChatInputType;
  sendButton: HTMLButtonElement | null;
}

export interface ChatUIDetection {
  container: HTMLElement;
  messages: ChatMessage[];
  input: ChatInput | null;
  optionButtons: ChatOptionButton[];
  fingerprint: string;
}

export interface ChatQuestion {
  id: string;
  messageId: string;
  text: string;
  intent: FieldIntent;
  interactionType: ChatInputType;
  confidence: number;
  skillHint?: string;
}

export type ChatProposal =
  | { outcome: "auto"; answer: { value: string; source: AnswerSource } }
  | { outcome: "review"; answer: { value: string; source: AnswerSource }; reason: string }
  | { outcome: "blocked"; reason: string }
  | { outcome: "skip"; reason: string }
  | { outcome: "no_profile"; reason: string };

export interface ChatPlan {
  questionId: string;
  text: string;
  intent: FieldIntent;
  interactionType: ChatInputType;
  proposal: ChatProposal;
}

export type ChatSendStatus = "sent" | "skipped" | "blocked" | "no_input";

export interface ChatSendRecord {
  questionId: string;
  intent: FieldIntent;
  text: string;
  value: string | null;
  source: AnswerSource | null;
  status: ChatSendStatus;
  note: string;
}

export type ChatPhase =
  | "detecting"
  | "reading"
  | "classifying"
  | "review"
  | "answering"
  | "waiting_for_response"
  | "completed"
  | "paused"
  | "stopped"
  | "errored";

export interface ChatSessionState {
  sessionId: string;
  containerFingerprint: string;
  phase: ChatPhase;
  processedMessageFingerprints: string[];
  processedQuestionFingerprints: string[];
  emergencyStop: boolean;
}