import type { Classification, DetectedControl, FieldIntent } from "./form-engine-types";

interface KeywordRule {
  intent: FieldIntent;
  keywords: string[];
  weight: number;
}

const RULES: KeywordRule[] = [
  { intent: "FULL_NAME", keywords: ["full name", "fullname", "legal name", "your name", "candidate name"], weight: 3 },
  { intent: "FIRST_NAME", keywords: ["first name", "given name", "forename"], weight: 3 },
  { intent: "LAST_NAME", keywords: ["last name", "family name", "surname", "lname"], weight: 3 },
  { intent: "EMAIL", keywords: ["email", "e-mail", "mail address", "email id"], weight: 3 },
  { intent: "PHONE", keywords: ["phone", "mobile", "telephone", "contact number", "phone number"], weight: 3 },
  { intent: "CITY", keywords: ["nearest city", "current city", "city of residence"], weight: 3 },
  { intent: "LOCATION", keywords: ["location", "current location", "address", "work location", "place of post"], weight: 3 },
  { intent: "CURRENT_COMPANY", keywords: ["current company", "present company", "employer", "current employer", "organisation", "organization", "company name", "company"], weight: 3 },
  { intent: "JOB_TITLE", keywords: ["job title", "current role", "designation", "current designation", "position title", "job designation"], weight: 3 },
  { intent: "TOTAL_EXPERIENCE", keywords: ["total experience", "total exp", "years of experience", "overall experience", "work experience", "experience years", "experience"], weight: 3 },
  { intent: "SKILLS", keywords: ["skills", "skill set", "skill-set", "technologies", "tech stack", "primary skills", "key skills", "skill"], weight: 3 },
  { intent: "DEGREE", keywords: ["degree", "qualification", "highest qualification", "academic qualification", "what is the highest degree"], weight: 3 },
  { intent: "EDUCATION_LEVEL", keywords: ["education level", "education", "educational qualification", "academic background"], weight: 3 },
  { intent: "CERTIFICATION", keywords: ["certification", "certifications", "certificate"], weight: 3 },
  { intent: "SALARY_CURRENT", keywords: ["current salary", "current ctc", "present salary", "current compensation", "present ctc"], weight: 3 },
  { intent: "SALARY_EXPECTED", keywords: ["expected salary", "expected ctc", "expected compensation", "salary expectation", "desired salary", "salary expectations"], weight: 3 },
  { intent: "NOTICE_PERIOD", keywords: ["notice period", "current notice period"], weight: 3 },
  { intent: "WORK_AUTHORIZATION", keywords: ["work authorization", "work authorisation", "work status", "visa", "visa status", "authorization to work", "authorisation to work", "eligible to work", "right to work"], weight: 4 },
  { intent: "RELOCATION", keywords: ["relocation", "willing to relocate", "relocate", "ready to relocate"], weight: 3 },
  { intent: "REMOTE_WORK", keywords: ["remote work", "work from home", "prefer remote", "remote preference", "work mode remote", "remote"], weight: 3 },
];

const EXCLUSIONS: FieldIntent[] = ["FULL_NAME", "FIRST_NAME", "LAST_NAME"];

const EXCLUSION_PHRASES = [
  "username",
  "user name",
  "login",
  "login id",
  "user id",
  "password",
  "secret",
  "token",
  "otp",
  "security question",
  "company name of employer" as string, // still handled by CURRENT_COMPANY; kept for clarity
];

export function normalizeFieldText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(e|e-mail|emaill|emial)\b/g, " email")
    .replace(/\bph\b/g, " phone")
    .replace(/\bexp\b/g, " experience")
    .replace(/\bctc\b/g, " salary")
    .trim();
}

function rawDescriptor(control: DetectedControl): string {
  return [control.labelText, control.placeholder, control.ariaLabel, control.name, control.autocomplete, control.nearbyText]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
}

function autocompleteIntent(value: string): FieldIntent | null {
  switch (value) {
    case "name":
    case "full-name":
      return "FULL_NAME";
    case "given-name":
      return "FIRST_NAME";
    case "family-name":
      return "LAST_NAME";
    case "email":
      return "EMAIL";
    case "tel":
      return "PHONE";
    case "organization":
      return "CURRENT_COMPANY";
    case "job-title":
      return "JOB_TITLE";
    case "street-address":
    case "address-line1":
    case "address-line2":
      return "LOCATION";
    case "bday":
      return "UNKNOWN";
    default:
      return null;
  }
}

export function classifyField(control: DetectedControl): Classification {
  const normalized = normalizeFieldText(rawDescriptor(control));
  if (normalized.length === 0) {
    return { intent: "UNKNOWN", confidence: 0, rawText: normalized };
  }

  const autocomplete = control.autocomplete ? autocompleteIntent(control.autocomplete) : null;
  if (autocomplete && autocomplete !== "UNKNOWN") {
    return { intent: autocomplete, confidence: 0.95, rawText: normalized };
  }

  if (EXCLUSION_PHRASES.some((phrase) => normalized.includes(normalizeFieldText(phrase)))) {
    return { intent: "UNKNOWN", confidence: 0, rawText: normalized };
  }

  let bestIntent: FieldIntent = "UNKNOWN";
  let bestScore = 0;
  for (const rule of RULES) {
    let score = 0;
    for (const keyword of rule.keywords) {
      const normalizedKeyword = normalizeFieldText(keyword);
      if (normalized.includes(normalizedKeyword)) {
        score += keyword.length >= 10 ? 3 : 2;
      }
    }
    if (normalized === normalizeFieldText(rule.keywords[0])) {
      score += 2;
    }
    if (EXCLUSIONS.includes(rule.intent) && normalized.includes("name") && normalized.includes("company")) {
      score = 0;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIntent = rule.intent;
    }
  }

  if (bestIntent === "UNKNOWN") {
    return { intent: "UNKNOWN", confidence: 0, rawText: normalized };
  }

  const confidence = Math.min(0.95, 0.35 + bestScore * 0.18);
  return { intent: bestIntent, confidence, rawText: normalized };
}

export function describeIntent(intent: FieldIntent): string {
  const labels: Record<FieldIntent, string> = {
    FULL_NAME: "Full name",
    FIRST_NAME: "First name",
    LAST_NAME: "Last name",
    NAME: "Name",
    EMAIL: "Email",
    PHONE: "Phone",
    CITY: "City",
    LOCATION: "Location",
    CURRENT_COMPANY: "Current company",
    JOB_TITLE: "Job title",
    TOTAL_EXPERIENCE: "Total experience",
    SKILLS: "Skills",
    SKILL_BOOLEAN: "Skill (yes/no)",
    SKILL_EXPERIENCE: "Skill experience",
    SKILL_LIST: "Skills list",
    DEGREE: "Degree",
    EDUCATION_LEVEL: "Education level",
    EDUCATION: "Education",
    CERTIFICATION: "Certification",
    SALARY_CURRENT: "Current salary",
    SALARY_EXPECTED: "Expected salary",
    NOTICE_PERIOD: "Notice period",
    WORK_AUTHORIZATION: "Work authorization",
    RELOCATION: "Relocation",
    REMOTE_WORK: "Remote work",
    AVAILABILITY: "Availability",
    FREE_TEXT: "Free text",
    UNKNOWN: "Unknown",
  };
  return labels[intent];
}