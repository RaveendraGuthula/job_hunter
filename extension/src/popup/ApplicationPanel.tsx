import { useEffect, useState } from "react";
import { ApiError, APPLICATION_STATUSES, createApplication, listApplicationEvents, listApplications, updateApplication } from "../utils/api";
import type { Application, ApplicationEvent, ApplicationPayload, ApplicationStatus } from "../utils/api";

interface ApplicationPanelProps {
  onLogout: () => void;
}

const EMPTY_FORM = {
  jobTitle: "",
  company: "",
  source: "",
  jobUrl: "",
  matchScore: "",
};

const ACTIVE: readonly ApplicationStatus[] = ["SAVED", "READY", "IN_PROGRESS", "REVIEW_REQUIRED"];
const APPLIED: readonly ApplicationStatus[] = ["APPLIED", "INTERVIEW"];
const CLOSED: readonly ApplicationStatus[] = ["REJECTED", "WITHDRAWN", "FAILED"];

const GROUP_LABELS: Record<string, string> = {
  active: "In progress",
  applied: "Applied / interviewing",
  closed: "Closed",
};

function buildPayload(form: typeof EMPTY_FORM): ApplicationPayload {
  const score = form.matchScore.trim();
  return {
    job_title: form.jobTitle,
    company: form.company.trim() || null,
    source: form.source.trim() || null,
    job_url: form.jobUrl,
    match_score: score === "" ? null : Number(score),
  };
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function prettyEvent(eventType: string): string {
  return eventType.replace(/_/g, " ").toLowerCase();
}

function statusClass(status: ApplicationStatus): string {
  switch (status) {
    case "APPLIED":
      return "jh-status-pill--applied";
    case "INTERVIEW":
      return "jh-status-pill--interview";
    case "REJECTED":
    case "WITHDRAWN":
    case "FAILED":
      return "jh-status-pill--closed";
    case "IN_PROGRESS":
    case "REVIEW_REQUIRED":
      return "jh-status-pill--active";
    default:
      return "jh-status-pill--pending";
  }
}

export function ApplicationPanel({ onLogout }: ApplicationPanelProps) {
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM);
  const [apps, setApps] = useState<Application[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [events, setEvents] = useState<ApplicationEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = await listApplications();
        if (!cancelled) setApps(rows);
      } catch {
        if (!cancelled) setError("Could not load applications. Is the backend running?");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadEvents(applicationId: string) {
    setEventsLoading(true);
    try {
      const rows = await listApplicationEvents(applicationId);
      setEvents(rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load application history.");
    } finally {
      setEventsLoading(false);
    }
  }

  async function handleToggleHistory(application: Application) {
    setError(null);
    if (expandedId === application.id) {
      setExpandedId(null);
      setEvents([]);
      return;
    }
    setExpandedId(application.id);
    await loadEvents(application.id);
  }

  function setField(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleAdd() {
    if (!form.jobTitle.trim() || !form.jobUrl.trim()) {
      setError("Job title and job URL are required.");
      return;
    }
    setAdding(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createApplication(buildPayload(form));
      setForm(EMPTY_FORM);
      const rows = await listApplications();
      setApps(rows);
      setExpandedId(created.id);
      await loadEvents(created.id);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not add the application. Is the backend running?",
      );
    } finally {
      setAdding(false);
    }
  }

  async function handleStatusChange(application: Application, status: ApplicationStatus) {
    if (status === application.status) {
      return;
    }
    setSavingStatus(application.id);
    setError(null);
    setNotice(null);
    try {
      const updated = await updateApplication(application.id, { status });
      setApps((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(`Status changed to ${updated.status}.`);
      if (expandedId === application.id) {
        await loadEvents(application.id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the application status.");
    } finally {
      setSavingStatus(null);
    }
  }

  function groupApps(statuses: readonly ApplicationStatus[]): Application[] {
    return apps.filter((app) => statuses.includes(app.status));
  }

  function renderRow(application: Application) {
    const expanded = expandedId === application.id;
    return (
      <li key={application.id} className="jh-app-row">
        <div className="jh-app-row__main">
          <div className="jh-job-row__info">
            <span className="jh-job-row__title">{application.job_title}</span>
            <span className="jh-app-source">
              {application.company ?? application.source ?? "No company"}
            </span>
          </div>
          <span className={`jh-status-pill ${statusClass(application.status)}`}>{application.status}</span>
          <button
            type="button"
            className="jh-button jh-button--small"
            onClick={() => void handleToggleHistory(application)}
          >
            {expanded ? "Hide history" : "History"}
          </button>
        </div>
        <div className="jh-job-row jh-app-status-row">
          <label className="jh-app-status-label">
            <span>Status</span>
            <select
              value={application.status}
              onChange={(event) =>
                void handleStatusChange(application, event.target.value as ApplicationStatus)
              }
              disabled={savingStatus === application.id}
            >
              {APPLICATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          {expanded && (
            <ul className="jh-events">
              {eventsLoading ? (
                <li className="jh-status">Loading history&hellip;</li>
              ) : events.length === 0 ? (
                <li className="jh-status">No events recorded yet.</li>
              ) : (
                events.map((event) => (
                  <li key={event.id} className="jh-event">
                    <span className="jh-event__type">{prettyEvent(event.event_type)}</span>
                    <span className="jh-event__date">{formatDate(event.created_at)}</span>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </li>
    );
  }

  const groups = [
    ["active", groupApps(ACTIVE)],
    ["applied", groupApps(APPLIED)],
    ["closed", groupApps(CLOSED)],
  ] as const;

  return (
    <div className="jh-panel">
      <div className="jh-panel__header">
        <div>
          <h2 className="jh-panel__title">Applications</h2>
          <p className="jh-panel__subtitle">
            Track every application's status and history, all in one place.
          </p>
        </div>
        <button type="button" className="jh-button jh-button--small" onClick={onLogout}>
          Log out
        </button>
      </div>

      {error && <p className="jh-error">{error}</p>}
      {notice && <p className="jh-success">{notice}</p>}

      <section className="jh-section" aria-label="Add application">
        <legend>Add application</legend>
        <div className="jh-form__row">
          <label className="jh-field" style={{ flex: 2 }}>
            <span>Job title *</span>
            <input
              type="text"
              value={form.jobTitle}
              onChange={(event) => setField("jobTitle", event.target.value)}
            />
          </label>
          <label className="jh-field" style={{ flex: 1 }}>
            <span>Company</span>
            <input
              type="text"
              value={form.company}
              onChange={(event) => setField("company", event.target.value)}
            />
          </label>
        </div>
        <div className="jh-form__row">
          <label className="jh-field" style={{ flex: 2 }}>
            <span>Job URL *</span>
            <input
              type="text"
              value={form.jobUrl}
              onChange={(event) => setField("jobUrl", event.target.value)}
            />
          </label>
          <label className="jh-field" style={{ flex: 1 }}>
            <span>Source</span>
            <input
              type="text"
              value={form.source}
              onChange={(event) => setField("source", event.target.value)}
            />
          </label>
        </div>
        <label className="jh-field">
          <span>Match score (0&ndash;100, optional)</span>
          <input
            type="number"
            min={0}
            max={100}
            value={form.matchScore}
            onChange={(event) => setField("matchScore", event.target.value)}
          />
        </label>
        <div className="jh-form__actions">
          <button
            type="button"
            className="jh-button"
            onClick={() => void handleAdd()}
            disabled={adding}
          >
            {adding ? "Adding..." : "Add to tracker"}
          </button>
        </div>
      </section>

      {apps.length === 0 ? (
        <p className="jh-status">No applications tracked yet.</p>
      ) : (
        groups.map(([group, rows]) =>
          rows.length === 0 ? null : (
            <section key={group} className="jh-section" aria-label={GROUP_LABELS[group]}>
              <legend>{GROUP_LABELS[group]}</legend>
              <ul className="jh-jobs">{rows.map(renderRow)}</ul>
            </section>
          ),
        )
      )}
    </div>
  );
}