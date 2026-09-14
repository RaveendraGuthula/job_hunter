import { useEffect, useState } from "react";
import {
  ApiError,
  deleteResume,
  getResume,
  listResumes,
  requestReparse,
  uploadResume,
} from "../utils/api";
import type { ProfilePayload, Resume, ResumeListItem } from "../utils/api";

interface ResumePanelProps {
  onPrefill: (draft: ProfilePayload) => void;
}

export function ResumePanel({ onPrefill }: ResumePanelProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<Resume | null>(null);
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [reparsingId, setReparsingId] = useState<string | null>(null);
  const [listLoaded, setListLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = await listResumes();
        if (!cancelled) {
          setResumes(rows);
          setListLoaded(true);
        }
      } catch {
        // A list failure should not block the upload flow.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    setLatest(null);
    try {
      const resume = await uploadResume(file);
      setLatest(resume);
      setResumes((current) => [
        resume,
        ...current.filter((item) => item.id !== resume.id),
      ]);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Upload failed. Is the backend running?",
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleReparse(id: string) {
    setReparsingId(id);
    setError(null);
    try {
      const resume = await requestReparse(id);
      setResumes((current) =>
        current.map((item) => (item.id === resume.id ? resume : item)),
      );
      setLatest((current) => (current && current.id === resume.id ? resume : current));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Reparse failed. Is the backend running?",
      );
    } finally {
      setReparsingId(null);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteResume(id);
      setResumes((current) => current.filter((item) => item.id !== id));
      setLatest((current) => (current && current.id === id ? null : current));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Delete failed. Is the backend running?",
      );
    }
  }

  async function handleFillFromList(id: string) {
    setError(null);
    try {
      const resume = await getResume(id);
      if (resume.parse_status === "parsed" && resume.parsed_data) {
        onPrefill(resume.parsed_data);
      } else {
        setError("This resume has no parsed data. Try a reparse first.");
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load that resume.",
      );
    }
  }

  const prefillable = latest !== null && latest.parse_status === "parsed" && latest.parsed_data !== null;

  return (
    <div className="jh-resume">
      <label className="jh-upload">
        <span>Upload a resume (PDF or DOCX) to prefill your profile.</span>
        <input
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={uploading}
          data-testid="resume-file-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleFile(file);
            }
            event.target.value = "";
          }}
        />
      </label>

      {uploading && <p className="jh-status">Uploading and parsing&hellip;</p>}
      {error && <p className="jh-error">{error}</p>}

      {latest !== null && latest.parse_status === "failed" && (
        <div className="jh-resume__fail">
          <p className="jh-error">
            RESUME_PARSE_FAILED: {latest.parse_error ?? "Could not read this resume."}
          </p>
          <p className="jh-status">
            Parsing stopped after bounded attempts. Enter your details manually below, or
            retry from the list.
          </p>
        </div>
      )}

      {prefillable && latest.parsed_data !== null && (
        <div className="jh-resume__ok">
          <p className="jh-status">
            Parsed {latest.original_filename} into a draft. Review and correct the fields
            below, then save to confirm.
          </p>
          <button
            type="button"
            className="jh-button"
            onClick={() => onPrefill(latest.parsed_data as ProfilePayload)}
          >
            Fill profile from resume
          </button>
        </div>
      )}

      {listLoaded && resumes.length > 0 && (
        <div className="jh-resume__list">
          <p className="jh-field-row__label">Uploaded resumes</p>
          {resumes.map((resume) => (
            <div key={resume.id} className="jh-inline">
              <span className="jh-resume__name">{resume.original_filename}</span>
              <span className={`jh-resume__status jh-resume__status--${resume.parse_status}`}>
                {resume.parse_status}
              </span>
              {resume.parse_status !== "parsed" ? (
                <button
                  type="button"
                  className="jh-button jh-button--small"
                  disabled={reparsingId === resume.id}
                  onClick={() => void handleReparse(resume.id)}
                >
                  {reparsingId === resume.id ? "Retrying&hellip;" : "Retry"}
                </button>
              ) : (
                latest?.id !== resume.id && (
                  <button
                    type="button"
                    className="jh-button jh-button--small"
                    onClick={() => void handleFillFromList(resume.id)}
                  >
                    Fill
                  </button>
                )
              )}
              <button
                type="button"
                className="jh-button jh-button--small"
                onClick={() => void handleDelete(resume.id)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}