import type { Profile } from "../utils/api";
import type { ChatPlan, ChatProposal, ChatQuestion } from "./chat-engine-types";
import type { AnswerSource, FieldIntent } from "./form-engine-types";
import { proposeValue } from "./profile-mapper";

const LOW_CONFIDENCE_REVIEW_THRESHOLD = 0.6;

export const SENSITIVE_SEND_REVIEW = new Set<FieldIntent>(["SALARY_CURRENT", "SALARY_EXPECTED", "WORK_AUTHORIZATION"]);

function auto(value: string, source: AnswerSource): ChatProposal {
  return { outcome: "auto", answer: { value, source } };
}

function review(value: string, source: AnswerSource, reason: string): ChatProposal {
  return { outcome: "review", answer: { value, source }, reason };
}

function blocked(reason: string): ChatProposal {
  return { outcome: "blocked", reason };
}

function skip(reason: string): ChatProposal {
  return { outcome: "skip", reason };
}

function normalizeSkill(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#.]/g, " ").replace(/\s+/g, " ").trim();
}

export function findSkill(profile: Profile, hint: string | undefined) {
  if (!hint) {
    return undefined;
  }
  const target = normalizeSkill(hint);
  if (target.length === 0) {
    return undefined;
  }
  return (profile.skills ?? []).find((skill) => {
    const name = normalizeSkill(skill.name ?? "");
    if (name.length === 0) {
      return false;
    }
    return name === target || (target.length >= 3 && (name.includes(target) || target.includes(name)));
  });
}

export function proposeChatAnswer(question: ChatQuestion, profile: Profile | null): ChatProposal {
  if (profile === null) {
    return { outcome: "no_profile", reason: "No confirmed profile — nothing will be auto-answered." };
  }

  switch (question.intent) {
    case "SKILL_BOOLEAN": {
      const skill = findSkill(profile, question.skillHint);
      if (skill) {
        return auto("Yes", "PROFILE");
      }
      return review("No", "PROFILE", "That skill is not listed in your confirmed profile — confirm this answer before sending.");
    }
    case "SKILL_EXPERIENCE": {
      const skill = findSkill(profile, question.skillHint);
      if (!skill) {
        return blocked("That skill is not in your confirmed profile. Answer it manually.");
      }
      const years = skill.experience;
      if (years === null || years === undefined) {
        return blocked("Years for that skill are not recorded in your confirmed profile.");
      }
      return auto(`${years} years`, "PROFILE");
    }
    case "FREE_TEXT":
      return review("", "USER", "Open-ended question — compose your own answer in the box below.");
    default: {
      const proposal = proposeValue(question.intent, profile);
      if (proposal.outcome === "answer") {
        if (SENSITIVE_SEND_REVIEW.has(question.intent)) {
          return review(
            proposal.answer.value,
            proposal.answer.source,
            "Sensitive question — confirm this answer before sending.",
          );
        }
        if (question.confidence > 0 && question.confidence < LOW_CONFIDENCE_REVIEW_THRESHOLD) {
          return review(proposal.answer.value, proposal.answer.source, "Question was classified with low confidence — confirm before sending.");
        }
        return auto(proposal.answer.value, proposal.answer.source);
      }
      if (proposal.outcome === "blocked") {
        return blocked(proposal.reason);
      }
      return skip(proposal.reason);
    }
  }
}

export function planForQuestion(question: ChatQuestion, profile: Profile | null): ChatPlan {
  return {
    questionId: question.id,
    text: question.text,
    intent: question.intent,
    interactionType: question.interactionType,
    proposal: proposeChatAnswer(question, profile),
  };
}