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