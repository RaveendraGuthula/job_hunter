import { useEffect, useState } from "react";
import { ApiError, analyzeJob, listJobs, matchJob } from "../utils/api";
import type { Job, JobMatch, JobPayload, Profile } from "../utils/api";

interface JobPanelProps {
  profile: Profile | null;
  onLogout: () => void;
}

const EMPTY_FORM = {
  title: "",
  company: "",
  location: "",
  salary: "",
  job_url: "",
  source: "linkedin",
  required_experience: "",
  skillsText: "",
  description: "",
  external_application_url: "",
};

type FormField = keyof typeof EMPTY_FORM;

function buildPayload(form: typeof EMPTY_FORM): JobPayload {
  const split = (value: string) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  return {
    title: form.title,
    company: form.company || null,
    location: form.location || null,
    description: form.description || null,
    required_experience: form.required_experience || null,
    skills: split(form.skillsText),
    salary: form.salary || null,
    job_url: form.job_url,
    source: form.source || "linkedin",
    external_application_url: form.external_application_url || null,
  };
}

function scoreClass(score: number): string {
  if (score >= 80) return "jh-band--high";
  if (score >= 50) return "jh-band--mid";
  return "jh-band--low";
}

export function JobPanel({ profile, onLogout }: JobPanelProps) {
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM);
  const [job, setJob] = useState<Job | null>(null);
  const [match, setMatch] = useState<JobMatch | null>(null);
  const [history, setHistory] = useState<Job[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = await listJobs();
        if (!cancelled) setHistory(rows);
      } catch {
        // non-fatal: the analyze form still works without history
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function setField(field: FormField, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    setError(null);
    setNotice(null);
    try {
      const normalized = await analyzeJob(buildPayload(form));
      setJob(normalized);
      setMatch(null);
      setHistory((prev) => [normalized, ...prev.filter((item) => item.id !== normalized.id)]);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not analyze the job. Is the backend running?",
      );
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleMatch(jobId: string) {
    setMatching(true);
    setError(null);
    setNotice(null);
    try {
      const result = await matchJob(jobId);
      setMatch(result);
      const analyzed = history.find((item) => item.id === jobId);
      if (analyzed) {
        setJob(analyzed);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setNotice("Confirm your profile on the Profile tab before matching jobs.");
      } else {
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not calculate the match. Is the backend running?",
        );
      }
    } finally {
      setMatching(false);
    }
  }

  return (
    <div className="jh-panel">
      <div className="jh-panel__header">
        <div>
          <h2 className="jh-panel__title">Jobs</h2>
          <p className="jh-panel__subtitle">
            Analyze a job posting, then score it against your confirmed profile.
          </p>
        </div>
        <button type="button" className="jh-button jh-button--small" onClick={onLogout}>
          Log out
        </button>
      </div>

      {error && <p className="jh-error">{error}</p>}
      {notice && <p className="jh-status">{notice}</p>}
      {!profile && (
        <p className="jh-status">
          No confirmed profile yet. Save your profile on the Profile tab before matching.
        </p>
      )}

      <section className="jh-section" aria-label="Job details">
        <legend>Job details</legend>
        <label className="jh-field">
          <span>Title *</span>
          <input
            type="text"
            value={form.title}
            onChange={(event) => setField("title", event.target.value)}
          />
        </label>
        <div className="jh-form__row">
          <label className="jh-field" style={{ flex: 1 }}>
            <span>Company</span>
            <input
              type="text"
              value={form.company}
              onChange={(event) => setField("company", event.target.value)}
            />
          </label>
          <label className="jh-field" style={{ flex: 1 }}>
            <span>Location</span>
            <input
              type="text"
              value={form.location}
              onChange={(event) => setField("location", event.target.value)}
            />
          </label>
        </div>
        <div className="jh-form__row">
          <label className="jh-field" style={{ flex: 2 }}>
            <span>Job URL *</span>
            <input
              type="text"
              value={form.job_url}
              onChange={(event) => setField("job_url", event.target.value)}
            />
          </label>
          <label className="jh-field" style={{ flex: 1 }}>
            <span>Source *</span>
            <input
              type="text"
              value={form.source}
              onChange={(event) => setField("source", event.target.value)}
            />
          </label>
        </div>
        <div className="jh-form__row">
          <label className="jh-field" style={{ flex: 1 }}>
            <span>Salary (optional)</span>
            <input
              type="text"
              value={form.salary}
              onChange={(event) => setField("salary", event.target.value)}
            />
          </label>
          <label className="jh-field" style={{ flex: 1 }}>
            <span>Required experience (optional)</span>
            <input
              type="text"
              value={form.required_experience}
              onChange={(event) => setField("required_experience", event.target.value)}
            />
          </label>
        </div>
        <label className="jh-field">
          <span>Skills (comma separated, optional)</span>
          <input
            type="text"
            value={form.skillsText}
            onChange={(event) => setField("skillsText", event.target.value)}
          />
        </label>
        <label className="jh-field">
          <span>Description</span>
          <textarea
            rows={4}
            value={form.description}
            onChange={(event) => setField("description", event.target.value)}
          />
        </label>
        <label className="jh-field">
          <span>External application URL (optional)</span>
          <input
            type="text"
            value={form.external_application_url}
            onChange={(event) => setField("external_application_url", event.target.value)}
          />
        </label>
        <div className="jh-form__actions jh-inline">
          <button
            type="button"
            className="jh-button"
            onClick={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? "Analyzing..." : "Analyze job"}
          </button>
          {job && (
            <button
              type="button"
              className="jh-button"
              onClick={() => handleMatch(job.id)}
              disabled={matching}
            >
              {matching ? "Scoring..." : "Calculate match"}
            </button>
          )}
        </div>
      </section>

      {job && (
        <section className="jh-section" aria-label="Analyzed job">
          <legend>Analyzed job</legend>
          <dl className="jh-job">
            <div>
              <dt>Title</dt>
              <dd>{job.title}</dd>
            </div>
            <div>
              <dt>Company</dt>
              <dd>{job.company ?? "—"}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{job.location ?? "—"}</dd>
            </div>
            <div>
              <dt>Salary</dt>
              <dd>{job.salary ?? "—"}</dd>
            </div>
            <div>
              <dt>Required experience</dt>
              <dd>{job.required_experience ?? "—"}</dd>
            </div>
            <div>
              <dt>Skills</dt>
              <dd>
                {job.skills && job.skills.length > 0 ? job.skills.join(", ") : "—"}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {match && (
        <section className="jh-section" aria-label="Match result">
          <legend>Match result</legend>
          <div className="jh-score">
            <div className={`jh-band ${scoreClass(match.overall_score)}`}>
              <span className="jh-band__label">Overall</span>
              <span className="jh-band__value">{match.overall_score}</span>
              <span className="jh-band__track">
                <span
                  className="jh-band__fill"
                  style={{ width: `${match.overall_score}%` }}
                />
              </span>
            </div>
            <div className="jh-component">
              <span>Skills</span>
              <span className="jh-component__value">{match.skills_score}</span>
            </div>
            <div className="jh-component">
              <span>Experience</span>
              <span className="jh-component__value">{match.experience_score}</span>
            </div>
            <div className="jh-component">
              <span>Education</span>
              <span className="jh-component__value">{match.education_score}</span>
            </div>
            <div className="jh-component">
              <span>Location</span>
              <span className="jh-component__value">{match.location_score}</span>
            </div>
            <ul className="jh-reasons">
              {match.reasons.map((reason, index) => (
                <li key={`${reason.dimension}-${index}`}>
                  <span className="jh-reasons__dim">{reason.dimension}</span>
                  {reason.message}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="jh-section" aria-label="Analyzed jobs">
        <legend>Analyzed jobs</legend>
        {history.length === 0 ? (
          <p className="jh-status">No jobs analyzed yet.</p>
        ) : (
          <ul className="jh-jobs">
            {history.map((item) => (
              <li key={item.id} className="jh-job-row">
                <div className="jh-job-row__info">
                  <span className="jh-job-row__title">{item.title}</span>
                  <span className="jh-resume__name">{item.company ?? item.source}</span>
                </div>
                <button
                  type="button"
                  className="jh-button jh-button--small"
                  onClick={() => handleMatch(item.id)}
                  disabled={matching}
                >
                  Score
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}