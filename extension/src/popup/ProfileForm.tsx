import { useEffect, useState } from "react";
import type { EducationPayload, ExperiencePayload, PreferencesPayload, ProfilePayload, SkillPayload } from "../utils/api";

interface ProfileFormProps {
  initial?: ProfilePayload | null;
  onSubmit: (payload: ProfilePayload) => void;
}

function toIntOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : null;
}

function toList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function initialPreferences(initial?: ProfilePayload | null): PreferencesPayload {
  const prefs = initial?.preferences ?? {};
  return {
    preferred_locations: prefs.preferred_locations ?? [],
    remote_preference: prefs.remote_preference ?? false,
    relocation_preference: prefs.relocation_preference ?? false,
    notice_period: prefs.notice_period ?? "",
    expected_salary: prefs.expected_salary ?? null,
    current_salary: prefs.current_salary ?? null,
  };
}

function formContents(initial?: ProfilePayload | null) {
  return {
    fullName: initial?.full_name ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    location: initial?.location ?? "",
    currentRole: initial?.current_role ?? "",
    totalExperience: initial?.total_experience?.toString() ?? "",
    languages: (initial?.languages ?? []).join(", "),
    certifications: (initial?.certifications ?? []).join(", "),
    workAuthorization: initial?.work_authorization ?? "",
    skills: (initial?.skills ?? []).map(({ name, experience }) => ({
      name,
      experience,
    })) as SkillPayload[],
    experienceRows: (initial?.experience ?? []).map(
      ({ employer, job_title, projects }) => ({
        employer,
        job_title,
        projects: projects ?? [],
      }),
    ) as ExperiencePayload[],
    educationRows: (initial?.education ?? []).map(
      ({ degree, institution, graduation_year }) => ({
        degree,
        institution,
        graduation_year,
      }),
    ) as EducationPayload[],
    preferences: initialPreferences(initial),
  };
}

export function ProfileForm({ initial, onSubmit }: ProfileFormProps) {
  const [fullName, setFullName] = useState(initial?.full_name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [currentRole, setCurrentRole] = useState(initial?.current_role ?? "");
  const [totalExperience, setTotalExperience] = useState(
    initial?.total_experience?.toString() ?? "",
  );
  const [languages, setLanguages] = useState((initial?.languages ?? []).join(", "));
  const [certifications, setCertifications] = useState(
    (initial?.certifications ?? []).join(", "),
  );
  const [workAuthorization, setWorkAuthorization] = useState(
    initial?.work_authorization ?? "",
  );
  const [skills, setSkills] = useState<SkillPayload[]>(
    (initial?.skills ?? []).map(({ name, experience }) => ({ name, experience })),
  );
  const [experienceRows, setExperienceRows] = useState<ExperiencePayload[]>(
    (initial?.experience ?? []).map(({ employer, job_title, projects }) => ({
      employer,
      job_title,
      projects: projects ?? [],
    })),
  );
  const [educationRows, setEducationRows] = useState<EducationPayload[]>(
    (initial?.education ?? []).map(
      ({ degree, institution, graduation_year }) => ({
        degree,
        institution,
        graduation_year,
      }),
    ),
  );
  const [preferences, setPreferences] = useState<PreferencesPayload>(
    initialPreferences(initial),
  );

  useEffect(() => {
    const contents = formContents(initial);
    setFullName(contents.fullName);
    setEmail(contents.email);
    setPhone(contents.phone);
    setLocation(contents.location);
    setCurrentRole(contents.currentRole);
    setTotalExperience(contents.totalExperience);
    setLanguages(contents.languages);
    setCertifications(contents.certifications);
    setWorkAuthorization(contents.workAuthorization);
    setSkills(contents.skills);
    setExperienceRows(contents.experienceRows);
    setEducationRows(contents.educationRows);
    setPreferences(contents.preferences);
  }, [initial]);

  function updateSkill(index: number, patch: Partial<SkillPayload>) {
    setSkills((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function updateExperienceRow(index: number, patch: Partial<ExperiencePayload>) {
    setExperienceRows((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function updateEducationRow(index: number, patch: Partial<EducationPayload>) {
    setEducationRows((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload: ProfilePayload = {
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim() || null,
      location: location.trim() || null,
      current_role: currentRole.trim() || null,
      total_experience: toIntOrNull(totalExperience),
      languages: toList(languages),
      certifications: toList(certifications),
      work_authorization: workAuthorization.trim() || null,
      skills: skills.filter((item) => item.name.trim().length > 0),
      experience: experienceRows.filter(
        (item) => item.employer.trim().length > 0 && item.job_title.trim().length > 0,
      ),
      education: educationRows.filter(
        (item) => item.degree.trim().length > 0 && item.institution.trim().length > 0,
      ),
      preferences: {
        ...preferences,
        preferred_locations: toList(preferences.preferred_locations?.join(", ") ?? ""),
        expected_salary: toIntOrNull(String(preferences.expected_salary ?? "")),
        current_salary: toIntOrNull(String(preferences.current_salary ?? "")),
      },
    };
    onSubmit(payload);
  }

  return (
    <form className="jh-form" onSubmit={handleSubmit}>
      <fieldset className="jh-section">
        <legend>Personal</legend>
        <label className="jh-field">
          <span>Full name</span>
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="jh-field">
          <span>Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="jh-field">
          <span>Phone</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="jh-field">
          <span>Location</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
      </fieldset>

      <fieldset className="jh-section">
        <legend>Professional</legend>
        <label className="jh-field">
          <span>Current role</span>
          <input value={currentRole} onChange={(e) => setCurrentRole(e.target.value)} />
        </label>
        <label className="jh-field">
          <span>Total experience (years)</span>
          <input
            type="number"
            min={0}
            value={totalExperience}
            onChange={(e) => setTotalExperience(e.target.value)}
          />
        </label>

        <div className="jh-field-row">
          <span className="jh-field-row__label">Skills</span>
          {skills.map((skill, index) => (
            <div key={index} className="jh-inline">
              <input
                value={skill.name}
                placeholder="Skill"
                onChange={(e) => updateSkill(index, { name: e.target.value })}
              />
              <input
                type="number"
                min={0}
                value={skill.experience ?? ""}
                placeholder="Yrs"
                onChange={(e) =>
                  updateSkill(index, { experience: toIntOrNull(e.target.value) })
                }
              />
              <button
                type="button"
                className="jh-button jh-button--small"
                onClick={() =>
                  setSkills((current) => current.filter((_, i) => i !== index))
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="jh-button jh-button--small"
            onClick={() => setSkills((current) => [...current, { name: "" }])}
          >
            Add skill
          </button>
        </div>

        <div className="jh-field-row">
          <span className="jh-field-row__label">Experience</span>
          {experienceRows.map((row, index) => (
            <div key={index} className="jh-inline">
              <input
                value={row.employer}
                placeholder="Employer"
                onChange={(e) => updateExperienceRow(index, { employer: e.target.value })}
              />
              <input
                value={row.job_title}
                placeholder="Job title"
                onChange={(e) => updateExperienceRow(index, { job_title: e.target.value })}
              />
              <input
                value={row.projects?.join(", ") ?? ""}
                placeholder="Projects (comma separated)"
                onChange={(e) =>
                  updateExperienceRow(index, { projects: toList(e.target.value) })
                }
              />
              <button
                type="button"
                className="jh-button jh-button--small"
                onClick={() =>
                  setExperienceRows((current) => current.filter((_, i) => i !== index))
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="jh-button jh-button--small"
            onClick={() =>
              setExperienceRows((current) => [
                ...current,
                { employer: "", job_title: "" },
              ])
            }
          >
            Add role
          </button>
        </div>

        <div className="jh-field-row">
          <span className="jh-field-row__label">Education</span>
          {educationRows.map((row, index) => (
            <div key={index} className="jh-inline">
              <input
                value={row.degree}
                placeholder="Degree"
                onChange={(e) => updateEducationRow(index, { degree: e.target.value })}
              />
              <input
                value={row.institution}
                placeholder="Institution"
                onChange={(e) =>
                  updateEducationRow(index, { institution: e.target.value })
                }
              />
              <input
                type="number"
                min={1900}
                max={2200}
                value={row.graduation_year ?? ""}
                placeholder="Year"
                onChange={(e) =>
                  updateEducationRow(index, {
                    graduation_year: toIntOrNull(e.target.value),
                  })
                }
              />
              <button
                type="button"
                className="jh-button jh-button--small"
                onClick={() =>
                  setEducationRows((current) => current.filter((_, i) => i !== index))
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="jh-button jh-button--small"
            onClick={() =>
              setEducationRows((current) => [...current, { degree: "", institution: "" }])
            }
          >
            Add education
          </button>
        </div>
      </fieldset>

      <fieldset className="jh-section">
        <legend>Preferences</legend>
        <label className="jh-field">
          <span>Preferred locations</span>
          <input
            value={preferences.preferred_locations?.join(", ") ?? ""}
            placeholder="e.g. Bengaluru, Pune"
            onChange={(e) =>
              setPreferences((current) => ({
                ...current,
                preferred_locations: toList(e.target.value),
              }))
            }
          />
        </label>
        <label className="jh-field">
          <span>Notice period</span>
          <input
            value={preferences.notice_period ?? ""}
            placeholder="e.g. 30 days"
            onChange={(e) =>
              setPreferences((current) => ({
                ...current,
                notice_period: e.target.value,
              }))
            }
          />
        </label>
        <label className="jh-field jh-field--checkbox">
          <input
            type="checkbox"
            checked={preferences.remote_preference ?? false}
            onChange={(e) =>
              setPreferences((current) => ({
                ...current,
                remote_preference: e.target.checked,
              }))
            }
          />
          <span>Open to remote work</span>
        </label>
        <label className="jh-field jh-field--checkbox">
          <input
            type="checkbox"
            checked={preferences.relocation_preference ?? false}
            onChange={(e) =>
              setPreferences((current) => ({
                ...current,
                relocation_preference: e.target.checked,
              }))
            }
          />
          <span>Willing to relocate</span>
        </label>
        <label className="jh-field">
          <span>Expected salary (annual INR)</span>
          <input
            type="number"
            min={0}
            value={preferences.expected_salary ?? ""}
            onChange={(e) =>
              setPreferences((current) => ({
                ...current,
                expected_salary: toIntOrNull(e.target.value),
              }))
            }
          />
        </label>
        <label className="jh-field">
          <span>Current salary (annual INR)</span>
          <input
            type="number"
            min={0}
            value={preferences.current_salary ?? ""}
            onChange={(e) =>
              setPreferences((current) => ({
                ...current,
                current_salary: toIntOrNull(e.target.value),
              }))
            }
          />
        </label>
      </fieldset>

      <fieldset className="jh-section">
        <legend>Additional</legend>
        <label className="jh-field">
          <span>Languages</span>
          <input
            value={languages}
            placeholder="Comma separated"
            onChange={(e) => setLanguages(e.target.value)}
          />
        </label>
        <label className="jh-field">
          <span>Certifications</span>
          <input
            value={certifications}
            placeholder="Comma separated"
            onChange={(e) => setCertifications(e.target.value)}
          />
        </label>
        <label className="jh-field">
          <span>Work authorization</span>
          <input
            value={workAuthorization}
            onChange={(e) => setWorkAuthorization(e.target.value)}
          />
        </label>
      </fieldset>

      <div className="jh-form__actions">
        <button type="submit" className="jh-button">
          {initial ? "Save changes" : "Create profile"}
        </button>
      </div>
    </form>
  );
}