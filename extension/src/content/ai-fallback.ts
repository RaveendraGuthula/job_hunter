import type { AnswerProfileContext, Profile, QuestionAnswerResult } from "../utils/api";
import type { ChatProposal } from "./chat-engine-types";
import type { FieldIntent } from "./form-engine-types";

// AI is only ever offered as a fallback for complex / free-text / unknown
// questions. Deterministic and profile-based answers always run first.
export const AI_ELIGIBLE_INTENTS: ReadonlySet<FieldIntent> = new Set(["FREE_TEXT", "UNKNOWN"]);

export function isAiEligibleIntent(intent: FieldIntent): boolean {
  return AI_ELIGIBLE_INTENTS.has(intent);
}

// Keep the context sent to the AI small: confirmed professional facts only, never
// contact details or the full resume.
export function minimalProfileForAi(profile: Profile): AnswerProfileContext {
  const education = (profile.education ?? [])
    .slice(0, 2)
    .filter((entry) => entry && entry.degree && entry.institution)
    .map((entry) => ({ degree: entry.degree, institution: entry.institution }));
  const skills = (profile.skills ?? [])
    .slice(0, 8)
    .filter((skill) => skill && skill.name)
    .map((skill) => ({ name: skill.name }));
  return {
    full_name: profile.full_name,
    current_role: profile.current_role ?? undefined,
    location: profile.location ?? undefined,
    total_experience: profile.total_experience ?? undefined,
    skills,
    education,
    certifications: (profile.certifications ?? []).slice(0, 3),
    preferences: {
      notice_period: profile.preferences?.notice_period ?? undefined,
      ...(profile.preferences?.remote_preference !== undefined
        ? { remote_preference: profile.preferences.remote_preference }
        : {}),
      ...(profile.preferences?.relocation_preference !== undefined
        ? { relocation_preference: profile.preferences.relocation_preference }
        : {}),
    },
  };
}

// A backend AI answer always lands as a proposal for the user to review; it is
// never auto-sent.
export function buildAiProposal(result: QuestionAnswerResult): ChatProposal {
  if (result.answer && result.answer.trim().length > 0) {
    return {
      outcome: "review",
      answer: { value: result.answer, source: "AI" },
      reason: result.reason ?? "AI-suggested draft — review before sending.",
    };
  }
  return {
    outcome: "blocked",
    reason: result.reason ?? "The AI answer engine could not propose an answer.",
  };
}