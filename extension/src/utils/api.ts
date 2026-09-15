import { API_PREFIX } from "../config";
import { clearToken, getToken, setToken } from "./storage";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

export interface SkillPayload {
  name: string;
  experience?: number | null;
}

export interface ExperiencePayload {
  employer: string;
  job_title: string;
  projects?: string[];
}

export interface EducationPayload {
  degree: string;
  institution: string;
  graduation_year?: number | null;
}

export interface PreferencesPayload {
  preferred_locations?: string[];
  remote_preference?: boolean | null;
  relocation_preference?: boolean | null;
  notice_period?: string | null;
  expected_salary?: number | null;
  current_salary?: number | null;
}

export interface ProfilePayload {
  full_name: string;
  email: string;
  phone?: string | null;
  location?: string | null;
  current_role?: string | null;
  total_experience?: number | null;
  languages?: string[];
  certifications?: string[];
  work_authorization?: string | null;
  skills?: SkillPayload[];
  experience?: ExperiencePayload[];
  education?: EducationPayload[];
  preferences?: PreferencesPayload;
}

export type Profile = ProfilePayload & {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
};

// Same shape as `ProfilePayload` but with every field optional, so callers can
// send a deliberately small subset (contact details omitted) as AI context.
export type AnswerProfileContext = Partial<ProfilePayload> & { full_name: string };

export type ResumeParseStatus = "pending" | "parsed" | "failed";

export interface ResumeListItem {
  id: string;
  user_id: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  parse_status: ResumeParseStatus;
  parse_error: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export type Resume = ResumeListItem & {
  extracted_text: string | null;
  parsed_data: ProfilePayload | null;
};

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}

async function extractError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: unknown };
    if (typeof data.detail === "string" && data.detail.length > 0) {
      return data.detail;
    }
  } catch {
    // fall through to generic message
  }
  return "Request failed";
}

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body } = options;
  const headers: Record<string, string> = {};
  const isFormData = body instanceof FormData;
  if (body !== undefined && !isFormData) {
    headers["Content-Type"] = "application/json";
  }
  const token = await getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await globalThis.fetch(`${API_PREFIX}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  });

  if (response.status === 401) {
    await clearToken();
  }
  if (!response.ok) {
    throw new ApiError(await extractError(response), response.status);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function register(email: string, password: string): Promise<void> {
  const data = await apiRequest<AuthResponse>("/auth/register", {
    method: "POST",
    body: { email, password },
  });
  await setToken(data.access_token);
}

export async function login(email: string, password: string): Promise<void> {
  const data = await apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  await setToken(data.access_token);
}

export async function getProfile(): Promise<Profile> {
  return apiRequest<Profile>("/profile");
}

export async function createProfile(payload: ProfilePayload): Promise<Profile> {
  return apiRequest<Profile>("/profile", { method: "POST", body: payload });
}

export async function updateProfile(payload: ProfilePayload): Promise<Profile> {
  return apiRequest<Profile>("/profile", { method: "PATCH", body: payload });
}

export async function uploadResume(file: File): Promise<Resume> {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<Resume>("/resumes", { method: "POST", body: formData });
}

export async function listResumes(): Promise<ResumeListItem[]> {
  return apiRequest<ResumeListItem[]>("/resumes");
}

export async function getResume(id: string): Promise<Resume> {
  return apiRequest<Resume>(`/resumes/${id}`);
}

export async function deleteResume(id: string): Promise<void> {
  return apiRequest<void>(`/resumes/${id}`, { method: "DELETE" });
}

export async function requestReparse(id: string): Promise<Resume> {
  return apiRequest<Resume>(`/resumes/${id}/reparse`, { method: "POST" });
}

export interface JobPayload {
  title: string;
  company?: string | null;
  location?: string | null;
  description?: string | null;
  required_experience?: string | null;
  skills?: string[];
  salary?: string | null;
  job_url: string;
  source: string;
  external_application_url?: string | null;
}

export type Job = JobPayload & {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
};

export interface MatchReason {
  dimension: string;
  outcome: string;
  message: string;
}

export interface JobMatch {
  id: string;
  user_id: string;
  job_id: string;
  overall_score: number;
  skills_score: number;
  experience_score: number;
  education_score: number;
  location_score: number;
  reasons: MatchReason[];
  created_at: string;
  updated_at: string;
}

export async function analyzeJob(payload: JobPayload): Promise<Job> {
  return apiRequest<Job>("/jobs/analyze", { method: "POST", body: payload });
}

export async function matchJob(jobId: string): Promise<JobMatch> {
  return apiRequest<JobMatch>("/jobs/match", {
    method: "POST",
    body: { job_id: jobId },
  });
}

export async function listJobs(): Promise<Job[]> {
  return apiRequest<Job[]>("/jobs");
}

export async function getJobMatch(jobId: string): Promise<JobMatch> {
  return apiRequest<JobMatch>(`/jobs/${jobId}/match`);
}

export type ApiAnswerSource = "PROFILE" | "RULE" | "CACHE" | "DERIVED" | "AI" | "USER";

export interface QuestionClassifyResult {
  question: string;
  normalized_question: string;
  intent: string;
  confidence: number;
  skill_hint?: string | null;
}

export interface RelevantJobContext {
  title?: string | null;
  company?: string | null;
  location?: string | null;
  skills?: string[];
  description?: string | null;
}

export interface ConversationTurn {
  role: "BOT" | "USER";
  text: string;
}

export interface QuestionAnswerResult {
  answer: string | null;
  confidence: number;
  requires_user_confirmation: boolean;
  reason: string | null;
  answer_source: ApiAnswerSource | null;
  intent: string;
  was_ai_generated: boolean;
}

export interface AnswerQuestionPayload {
  question: string;
  relevant_profile?: AnswerProfileContext;
  relevant_job_context?: RelevantJobContext;
  relevant_conversation_context?: ConversationTurn[];
}

export interface AiUsageSummary {
  total_calls: number;
  ai_generated_answers: number;
  failed_calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  average_latency_ms: number;
  last_used_at: string | null;
}

export async function classifyQuestion(question: string): Promise<QuestionClassifyResult> {
  return apiRequest<QuestionClassifyResult>("/questions/classify", {
    method: "POST",
    body: { question },
  });
}

export async function answerQuestion(payload: AnswerQuestionPayload): Promise<QuestionAnswerResult> {
  return apiRequest<QuestionAnswerResult>("/questions/answer", { method: "POST", body: payload });
}

export async function getAiUsage(): Promise<AiUsageSummary> {
  return apiRequest<AiUsageSummary>("/usage/ai");
}

export type ApplicationStatus =
  | "SAVED"
  | "READY"
  | "IN_PROGRESS"
  | "REVIEW_REQUIRED"
  | "APPLIED"
  | "INTERVIEW"
  | "REJECTED"
  | "WITHDRAWN"
  | "FAILED";

export const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  "SAVED",
  "READY",
  "IN_PROGRESS",
  "REVIEW_REQUIRED",
  "APPLIED",
  "INTERVIEW",
  "REJECTED",
  "WITHDRAWN",
  "FAILED",
];

export type ApplicationEventType =
  | "APPLICATION_STARTED"
  | "APPLICATION_TYPE_DETECTED"
  | "QUESTION_RECEIVED"
  | "QUESTION_CLASSIFIED"
  | "ANSWER_RETRIEVED"
  | "AI_REQUESTED"
  | "ANSWER_GENERATED"
  | "ANSWER_MODIFIED"
  | "ANSWER_SUBMITTED"
  | "USER_PAUSED"
  | "USER_RESUMED"
  | "CAPTCHA_DETECTED"
  | "LOGIN_REQUIRED"
  | "APPLICATION_COMPLETED"
  | "APPLICATION_FAILED"
  | "TIMEOUT"
  | "RESUME_PARSE_FAILED"
  | "EMERGENCY_STOP"
  | "APPLICATION_CREATED"
  | "APPLICATION_STATUS_CHANGED"
  | "APPLICATION_CANCELLED"
  | "MANUAL_TAKEOVER"
  | "USER_CORRECTION";

export interface ApplicationPayload {
  job_title: string;
  company?: string | null;
  source?: string | null;
  job_url: string;
  status?: ApplicationStatus;
  match_score?: number | null;
  job_id?: string | null;
  resume_id?: string | null;
  application_date?: string | null;
}

export interface Application extends Omit<ApplicationPayload, "status"> {
  id: string;
  user_id: string;
  job_id: string | null;
  resume_id: string | null;
  status: ApplicationStatus;
  application_date: string;
  created_at: string;
  updated_at: string;
}

export interface ApplicationUpdatePayload {
  status?: ApplicationStatus;
  job_title?: string;
  company?: string | null;
  source?: string | null;
  match_score?: number | null;
}

export interface ApplicationEvent {
  id: string;
  application_id: string;
  event_type: ApplicationEventType;
  state: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export async function createApplication(payload: ApplicationPayload): Promise<Application> {
  return apiRequest<Application>("/applications", { method: "POST", body: payload });
}

export async function listApplications(): Promise<Application[]> {
  return apiRequest<Application[]>("/applications");
}

export async function getApplication(id: string): Promise<Application> {
  return apiRequest<Application>(`/applications/${id}`);
}

export async function updateApplication(
  id: string,
  payload: ApplicationUpdatePayload,
): Promise<Application> {
  return apiRequest<Application>(`/applications/${id}`, { method: "PATCH", body: payload });
}

export async function listApplicationEvents(id: string): Promise<ApplicationEvent[]> {
  return apiRequest<ApplicationEvent[]>(`/applications/${id}/events`);
}

export async function addApplicationEvent(
  id: string,
  eventType: ApplicationEventType,
  message?: string,
): Promise<ApplicationEvent> {
  return apiRequest<ApplicationEvent>(`/applications/${id}/events`, {
    method: "POST",
    body: { event_type: eventType, message },
  });
}