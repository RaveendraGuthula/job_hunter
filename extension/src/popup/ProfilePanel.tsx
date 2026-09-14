import { useState } from "react";
import { ApiError, createProfile, updateProfile } from "../utils/api";
import type { Profile, ProfilePayload } from "../utils/api";
import { ProfileForm } from "./ProfileForm";
import { ResumePanel } from "./ResumePanel";

interface ProfilePanelProps {
  profile: Profile | null;
  onSaved: (profile: Profile) => void;
  onLogout: () => void;
}

export function ProfilePanel({ profile, onSaved, onLogout }: ProfilePanelProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState<ProfilePayload | null>(null);

  async function handleSubmit(payload: ProfilePayload) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = profile
        ? await updateProfile(payload)
        : await createProfile(payload);
      onSaved(result);
      setSaved(true);
      setDraft(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Could not save profile. Is the backend running?");
      }
    } finally {
      setSaving(false);
    }
  }

  function handlePrefill(payload: ProfilePayload) {
    setDraft(payload);
    setError(null);
    setSaved(false);
  }

  return (
    <div className="jh-panel">
      <div className="jh-panel__header">
        <div>
          <h2 className="jh-panel__title">{profile ? "Your profile" : "Create your profile"}</h2>
          <p className="jh-panel__subtitle">
            {profile
              ? "Saved on the backend and used as the source of truth for applications."
              : "Fill this once; it is used for every job application."}
          </p>
        </div>
        <button type="button" className="jh-button jh-button--small" onClick={onLogout}>
          Log out
        </button>
      </div>

      {error && <p className="jh-error">{error}</p>}
      {saved && <p className="jh-success">Profile saved.</p>}
      {draft && <p className="jh-status">Draft loaded from your resume. Review and confirm before saving.</p>}

      <ResumePanel onPrefill={handlePrefill} />

      <ProfileForm initial={draft ?? profile} onSubmit={handleSubmit} />

      {saving && <p className="jh-meta">Saving&hellip;</p>}
    </div>
  );
}