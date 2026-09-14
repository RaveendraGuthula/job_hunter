export type ControlKind =
  | "text"
  | "email"
  | "tel"
  | "url"
  | "number"
  | "date"
  | "password"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "file"
  | "hidden"
  | "submit"
  | "button"
  | "contenteditable"
  | "other";

export type AnswerSource = "PROFILE" | "RULE" | "CACHE" | "DERIVED" | "AI" | "USER";

export interface FieldOption {
  value: string;
  text: string;
}

export interface DetectedControl {
  id: string;
  element: HTMLElement;
  kind: ControlKind;
  labelText: string | null;
  placeholder: string | null;
  ariaLabel: string | null;
  name: string | null;
  autocomplete: string | null;
  nearbyText: string;
  required: boolean;
  options: FieldOption[];
  radios?: HTMLInputElement[];
}

export type FieldIntent =
  | "FULL_NAME"
  | "FIRST_NAME"
  | "LAST_NAME"
  | "NAME"
  | "EMAIL"
  | "PHONE"
  | "CITY"
  | "LOCATION"
  | "CURRENT_COMPANY"
  | "JOB_TITLE"
  | "TOTAL_EXPERIENCE"
  | "SKILLS"
  | "SKILL_BOOLEAN"
  | "SKILL_EXPERIENCE"
  | "SKILL_LIST"
  | "DEGREE"
  | "EDUCATION_LEVEL"
  | "EDUCATION"
  | "CERTIFICATION"
  | "SALARY_CURRENT"
  | "SALARY_EXPECTED"
  | "NOTICE_PERIOD"
  | "WORK_AUTHORIZATION"
  | "RELOCATION"
  | "REMOTE_WORK"
  | "AVAILABILITY"
  | "FREE_TEXT"
  | "UNKNOWN";

export interface Classification {
  intent: FieldIntent;
  confidence: number;
  rawText: string;
}

export interface ProposedAnswer {
  value: string;
  source: AnswerSource;
}

export type PlanDisposition =
  | { kind: "auto"; answer: ProposedAnswer }
  | { kind: "blocked"; reason: string }
  | { kind: "skip"; reason: string };

export interface FieldPlan {
  controlId: string;
  intent: FieldIntent;
  confidence: number;
  kind: ControlKind;
  descriptor: string;
  disposition: PlanDisposition;
}

export interface FillRecord {
  controlId: string;
  descriptor: string;
  intent: FieldIntent;
  kind: ControlKind;
  status: "applied" | "skipped" | "blocked";
  value: string | null;
  source: AnswerSource | null;
  note: string;
}