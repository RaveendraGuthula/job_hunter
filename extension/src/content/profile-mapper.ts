import type { Profile } from "../utils/api";
import type { FieldIntent, ProposedAnswer } from "./form-engine-types";

export type Proposal =
  | { outcome: "answer"; answer: ProposedAnswer }
  | { outcome: "blocked"; reason: string }
  | { outcome: "skip"; reason: string }
  | { outcome: "no_profile"; reason: string };

function fromField(value: string | null | undefined, intent: FieldIntent): Proposal {
  if (!value || value.trim().length === 0) {
    return blockedReason(intent);
  }
  return { outcome: "answer", answer: { value: value.trim(), source: "PROFILE" } };
}

function blockedReason(intent: FieldIntent): Proposal {
  return { outcome: "blocked", reason: `No value in your confirmed profile. Fill "${intent}" manually.` };
}

function preferenceFlag(value: boolean | null | undefined): Proposal {
  if (value === null || value === undefined) {
    return {
      outcome: "blocked",
      reason: `This is answered from your profile preference. It is not set — answer manually (or set it in Profile > Preferences).`,
    };
  }
  return { outcome: "answer", answer: { value: value ? "Yes" : "No", source: "PROFILE" } };
}

function splitName(fullName: string): { first: string | null; last: string | null } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) {
    return { first: null, last: null };
  }
  const first = parts[0];
  const last = parts.length > 1 ? parts.slice(1).join(" ") : null;
  return { first, last };
}

export function proposeValue(intent: FieldIntent, profile: Profile | null): Proposal {
  if (profile === null) {
    return { outcome: "no_profile", reason: "No confirmed profile — nothing will be auto-filled." };
  }

  switch (intent) {
    case "FULL_NAME":
      return fromField(profile.full_name, intent);
    case "FIRST_NAME":
    case "LAST_NAME": {
      const { first, last } = splitName(profile.full_name ?? "");
      const value = intent === "FIRST_NAME" ? first : last;
      if (!value) {
        return { outcome: "blocked", reason: "Your full name in the profile cannot be split into a first/last name." };
      }
      return { outcome: "answer", answer: { value, source: "DERIVED" } };
    }
    case "EMAIL":
      return fromField(profile.email, intent);
    case "PHONE":
      return fromField(profile.phone, intent);
    case "LOCATION":
    case "CITY":
      return fromField(profile.location, intent);
    case "CURRENT_COMPANY": {
      const employer = profile.experience?.[0]?.employer;
      if (employer) {
        return { outcome: "answer", answer: { value: employer, source: "PROFILE" } };
      }
      return { outcome: "blocked", reason: "No employer in your confirmed profile. Fill \"Current company\" manually." };
    }
    case "JOB_TITLE": {
      const title = profile.current_role ?? profile.experience?.[0]?.job_title;
      if (title) {
        return {
          outcome: "answer",
          answer: { value: title, source: profile.current_role ? "PROFILE" : "DERIVED" },
        };
      }
      return { outcome: "blocked", reason: "No job title in your confirmed profile. Fill \"Job title\" manually." };
    }
    case "TOTAL_EXPERIENCE": {
      const years = profile.total_experience;
      if (years === null || years === undefined) {
        return { outcome: "blocked", reason: "Total experience is not set in your confirmed profile." };
      }
      return { outcome: "answer", answer: { value: String(years), source: "PROFILE" } };
    }
    case "SKILLS": {
      const skills = (profile.skills ?? []).map((skill) => skill.name).filter(Boolean);
      if (skills.length === 0) {
        return { outcome: "blocked", reason: "No skills in your confirmed profile." };
      }
      return { outcome: "answer", answer: { value: skills.join(", "), source: "PROFILE" } };
    }
    case "DEGREE":
    case "EDUCATION_LEVEL": {
      const degree = profile.education?.[0]?.degree;
      if (degree) {
        return { outcome: "answer", answer: { value: degree, source: "DERIVED" } };
      }
      return { outcome: "blocked", reason: "No education entry in your confirmed profile. Fill \"Education\" manually." };
    }
    case "CERTIFICATION": {
      const certifications = (profile.certifications ?? []).filter((item) => item.trim().length > 0);
      if (certifications.length === 0) {
        return { outcome: "blocked", reason: "No certifications in your confirmed profile." };
      }
      return { outcome: "answer", answer: { value: certifications.join(", "), source: "PROFILE" } };
    }
    case "NOTICE_PERIOD": {
      const notice = profile.preferences?.notice_period;
      if (!notice || notice.trim().length === 0) {
        return { outcome: "blocked", reason: "Notice period is not set in your profile preferences." };
      }
      return { outcome: "answer", answer: { value: notice.trim(), source: "PROFILE" } };
    }
    case "SALARY_CURRENT": {
      const salary = profile.preferences?.current_salary;
      if (salary === null || salary === undefined) {
        return { outcome: "blocked", reason: "Current salary is not configured — this is sensitive; answer it manually or set it in Profile > Preferences." };
      }
      return { outcome: "answer", answer: { value: String(salary), source: "PROFILE" } };
    }
    case "SALARY_EXPECTED": {
      const salary = profile.preferences?.expected_salary;
      if (salary === null || salary === undefined) {
        return { outcome: "blocked", reason: "Expected salary is not configured — this is sensitive; answer it manually or set it in Profile > Preferences." };
      }
      return { outcome: "answer", answer: { value: String(salary), source: "PROFILE" } };
    }
    case "WORK_AUTHORIZATION": {
      const authorization = profile.work_authorization;
      if (authorization && authorization.trim().length > 0) {
        return { outcome: "answer", answer: { value: authorization.trim(), source: "PROFILE" } };
      }
      return { outcome: "blocked", reason: "Work authorization / visa is sensitive. It is not set in your profile — answer manually." };
    }
    case "RELOCATION":
      return preferenceFlag(profile.preferences?.relocation_preference);
    case "REMOTE_WORK":
      return preferenceFlag(profile.preferences?.remote_preference);
    case "UNKNOWN":
      return { outcome: "skip", reason: "Field intent not recognized; not auto-filled." };
  }
}