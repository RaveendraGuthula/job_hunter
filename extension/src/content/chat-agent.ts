import type { Profile } from "../utils/api";
import { planForQuestion } from "./chat-answer-mapper";
import type { ChatOptionButton } from "./chat-engine-types";
import type { ChatMessage, ChatPlan, ChatQuestion, ChatSessionState } from "./chat-engine-types";
import { findMatchingOption } from "./chat-interaction";
import { fingerprintOf, fingerprintOfMessage, segmentQuestionTexts } from "./message-segmenter";
import { classifyQuestion } from "./question-classifier";
import { ChatSessionController } from "./chat-session-manager";

export interface RunChatInput {
  profile: Profile | null;
  session: ChatSessionState;
  newMessages: ChatMessage[];
  optionButtons: ChatOptionButton[];
}

export interface ChatDecision {
  question: ChatQuestion;
  plan: ChatPlan;
  matchedOption: ChatOptionButton | null;
}

export interface ChatRunResult {
  session: ChatSessionState;
  decisions: ChatDecision[];
}

export function runChat(input: RunChatInput): ChatRunResult {
  const controller = new ChatSessionController(input.session);
  const decisions: ChatDecision[] = [];

  for (const message of input.newMessages) {
    if (message.role !== "BOT") {
      continue;
    }
    const messageFp = fingerprintOfMessage(message);
    if (controller.hasProcessedMessage(messageFp)) {
      continue;
    }

    const chunks = segmentQuestionTexts(message.text);
    for (const [index, text] of chunks.entries()) {
      const questionFp = fingerprintOf(text);
      if (controller.hasProcessedQuestion(questionFp)) {
        continue;
      }
      const classification = classifyQuestion(text);
      const question: ChatQuestion = {
        id: `${message.id}-q${index + 1}`,
        messageId: message.id,
        text,
        intent: classification.intent,
        interactionType: input.optionButtons.length > 0 ? "select" : "unknown",
        confidence: classification.confidence,
        ...(classification.skillHint !== undefined ? { skillHint: classification.skillHint } : {}),
      };
      const plan = planForQuestion(question, input.profile);
      const matchedOption =
        plan.proposal.outcome === "auto" ? findMatchingOption(input.optionButtons, plan.proposal.answer.value) : null;
      decisions.push({ question, plan, matchedOption });
    }

    controller.markMessageProcessed(messageFp);
  }

  return { session: controller.getState(), decisions };
}

export function isExecutable(decision: ChatDecision): boolean {
  if (decision.plan.proposal.outcome !== "auto") {
    return false;
  }
  if (decision.plan.interactionType === "select" && decision.matchedOption === null) {
    return false;
  }
  return true;
}