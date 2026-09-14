import type { FieldIntent } from "./form-engine-types";

export interface QuestionClassification {
  intent: FieldIntent;
  confidence: number;
  skillHint?: string;
}

interface KeywordRule {
  intent: FieldIntent;
  keywords: string[];
  weight: number;
}

const RULES: KeywordRule[] = [
  {
    intent: "SKILL_LIST",
    keywords: [
      "list your skills",
      "key skills",
      "top skills",
      "primary skills",
      "strongest skills",
      "what are your skills",
      "tell us your skills",
      "your skill set",
      "which skills do you have",
    ],
    weight: 3,
  },
  { intent: "NAME", keywords: ["what is your name", "your full name", "please tell me your name", "your name please", "what is your full name"], weight: 4 },
  { intent: "EMAIL", keywords: ["your email", "what is your email", "your email address", "what is your email address", "email address"], weight: 4 },
  { intent: "PHONE", keywords: ["your phone number", "phone number", "contact number", "what is your mobile number", "mobile number", "your phone"], weight: 3 },
  { intent: "LOCATION", keywords: ["current location", "where are you based", "your location", "what is your location", "city of residence", "where do you currently live", "what is your current city"], weight: 3 },
  { intent: "TOTAL_EXPERIENCE", keywords: ["how many years of experience", "years of experience", "total experience", "how much experience do you have", "years of work experience", "your experience in years", "overall experience"], weight: 3 },
  { intent: "EDUCATION", keywords: ["highest level of education", "your education", "educational background", "your academic background", "tell me about your education"], weight: 3 },
  { intent: "DEGREE", keywords: ["what is your degree", "your degree", "highest degree", "degree", "qualification"], weight: 3 },
  { intent: "EDUCATION_LEVEL", keywords: ["education level", "level of education", "education qualification"], weight: 3 },
  { intent: "CERTIFICATION", keywords: ["certifications", "certification", "do you have any certificates", "professional certificates"], weight: 3 },
  { intent: "SALARY_CURRENT", keywords: ["current salary", "current ctc", "present salary", "current compensation", "your current salary"], weight: 3 },
  { intent: "SALARY_EXPECTED", keywords: ["expected salary", "expected ctc", "expected compensation", "salary expectation", "salary expectations", "desired salary", "what salary are you looking for", "what is your expected salary"], weight: 3 },
  { intent: "NOTICE_PERIOD", keywords: ["notice period", "how long is your notice period", "current notice period"], weight: 3 },
  { intent: "WORK_AUTHORIZATION", keywords: ["work authorization", "work authorisation", "visa status", "your visa", "authorization to work", "eligible to work", "right to work", "your work status"], weight: 4 },
  { intent: "RELOCATION", keywords: ["willing to relocate", "relocate for", "ready to relocate", "relocation", "are you willing to move"], weight: 3 },
  { intent: "REMOTE_WORK", keywords: ["prefer to work remotely", "work remotely", "remote work", "work from home", "remote or onsite", "do you want remote"], weight: 3 },
  { intent: "AVAILABILITY", keywords: ["when can you join", "when are you available", "your availability", "how soon can you join", "availability to join", "when can you start", "start date", "joining date", "days needed to join"], weight: 3 },
  { intent: "CURRENT_COMPANY", keywords: ["current company", "current employer", "where do you currently work", "name of the company you work for", "your current organisation"], weight: 3 },
  { intent: "JOB_TITLE", keywords: ["current job title", "current designation", "your current role", "what is your job title", "present designation"], weight: 3 },
];

const FREE_TEXT_PATTERNS = [
  { keywords: ["tell us about yourself", "introduce yourself", "about yourself", "cover letter", "pitch yourself", "why do you want to work"], weight: 4 },
  { keywords: ["write a summary", "summarize your career", "summarise your career"], weight: 3 },
];

const SKILL_EXPERIENCE_PATTERN =
  /\b(?:how many years of experience do you have (?:with|in|using)|years of experience (?:with|in|using)|how much experience do you have (?:with|in|using)|experience (?:with|in|using))\s+([A-Za-z0-9][A-Za-z0-9+#.\- /]{1,50}?)(?=\s*\?|$)/i;

const SKILL_BOOLEAN_PATTERN =
  /\b(?:do you (?:know|have|use|work with)|do you have (?:any )?(?:experience|expertise|proficiency|knowledge|hands-on experience|working experience)\s+(?:with|in|using)|have you (?:worked with|worked on|used|built|dealt with)|are you (?:proficient in|familiar with|experienced with|comfortable with|good with|strong with|hands-on with)|proficient in|proficiency with|knowledge of|strong in|expertise in)\s+([A-Za-z0-9][A-Za-z0-9+#.\- /]{1,50}?)(?=\s*\?|$)/i;

const SKILL_STOP_WORDS = [
  "any",
  "your",
  "the",
  "any of the",
  "any of these",
  "any of those",
  "following",
  "these",
  "those",
  "technologies",
  "technology",
  "languages",
  "language",
  "programming language",
  "programming languages",
  "scripting language",
  "frameworks",
  "framework",
  "tools",
  "tool",
  "platforms",
  "platform",
  "libraries",
  "library",
  "skills",
  "skill",
  "areas",
  "area",
  "things",
  "stuff",
  "certifications",
  "certification",
  "experience",
  "it",
  "that",
];

export function normalizeQuestionText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/^(what is|what are|please tell me|please share|can you tell me|do you have|are you|how about)\s+/, "")
    .trim();
}

export function extractSkillHint(text: string): string | undefined {
  const match = SKILL_EXPERIENCE_PATTERN.exec(text) ?? SKILL_BOOLEAN_PATTERN.exec(text);
  if (match === null) {
    return undefined;
  }
  let hint = match[1].replace(/\s+/g, " ").trim();
  if (hint.length === 0) {
    return undefined;
  }
  for (let guard = 0; guard < 3; guard += 1) {
    const stopword = SKILL_STOP_WORDS.find((word) => hint.toLowerCase().endsWith(word));
    const nonStop = SKILL_STOP_WORDS.find((word) => hint.toLowerCase() === word);
    if (nonStop !== undefined) {
      return undefined;
    }
    if (stopword === undefined) {
      break;
    }
    hint = hint.slice(0, hint.length - stopword.length).replace(/\s+/g, " ").trim();
  }
  return hint.length >= 2 ? hint : undefined;
}

function hasRuleKeyword(normalized: string, keywords: string[]): number {
  let score = 0;
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeQuestionText(keyword);
    if (normalized.includes(normalizedKeyword)) {
      score += keyword.length >= 12 ? 3 : 2;
    }
    if (normalized === normalizedKeyword) {
      score += 2;
    }
  }
  return score;
}

export function classifyQuestion(text: string): QuestionClassification {
  const normalized = normalizeQuestionText(text);
  if (normalized.length === 0) {
    return { intent: "UNKNOWN", confidence: 0 };
  }

  const skillHint = extractSkillHint(text);
  if (skillHint !== undefined) {
    const isExperience = SKILL_EXPERIENCE_PATTERN.test(text);
    return {
      intent: isExperience ? "SKILL_EXPERIENCE" : "SKILL_BOOLEAN",
      confidence: 0.9,
      skillHint,
    };
  }

  for (const pattern of FREE_TEXT_PATTERNS) {
    const score = hasRuleKeyword(normalized, pattern.keywords);
    if (score > 0) {
      return { intent: "FREE_TEXT", confidence: Math.min(0.95, 0.4 + score * 0.15) };
    }
  }

  let bestIntent: FieldIntent = "UNKNOWN";
  let bestScore = 0;
  for (const rule of RULES) {
    const score = hasRuleKeyword(normalized, rule.keywords);
    if (score > bestScore) {
      bestScore = score;
      bestIntent = rule.intent;
    }
  }

  if (bestIntent === "UNKNOWN") {
    return { intent: "UNKNOWN", confidence: 0 };
  }

  const confidence = Math.min(0.95, 0.3 + bestScore * 0.2);
  return { intent: bestIntent, confidence };
}