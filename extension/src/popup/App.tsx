import { useEffect, useState } from "react";
import { EXTENSION_NAME, VERSION } from "../version";
import { ApiError, getProfile, login, register } from "../utils/api";
import type { Profile } from "../utils/api";
import { clearToken, getToken } from "../utils/storage";
import { AuthForm } from "./AuthForm";
import type { AuthMode } from "./AuthForm";
import { JobPanel } from "./JobPanel";
import { ProfilePanel } from "./ProfilePanel";

type View =
  | { name: "loading" }
  | { name: "auth"; error: string | null }
  | { name: "menu"; tab: "profile" | "jobs"; profile: Profile | null };

export function App() {
  const [view, setView] = useState<View>({ name: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = await getToken();
      if (!token) {
        if (!cancelled) setView({ name: "auth", error: null });
        return;
      }
      try {
        const profile = await getProfile();
        if (!cancelled) setView({ name: "menu", tab: "profile", profile });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setView({ name: "menu", tab: "profile", profile: null });
        } else if (err instanceof ApiError && err.status === 401) {
          setView({ name: "auth", error: null });
        } else {
          setView({ name: "auth", error: null });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAuthSubmit(mode: AuthMode, email: string, password: string) {
    setView({ name: "loading" });
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password);
      }
      const profile = await getProfile();
      setView({ name: "menu", tab: "profile", profile });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Could not reach the backend. Is it running?";
      setView({ name: "auth", error: message });
    }
  }

  async function handleLogout() {
    await clearToken();
    setView({ name: "auth", error: null });
  }

  return (
    <main className="jh-popup">
      <h1 className="jh-popup__title">{EXTENSION_NAME}</h1>
      <p className="jh-popup__meta">Extension version {VERSION}</p>

      {view.name === "loading" && <p className="jh-status">Loading&hellip;</p>}

      {view.name === "auth" && (
        <div>
          {view.error && <p className="jh-error">{view.error}</p>}
          <AuthForm onSubmit={handleAuthSubmit} />
        </div>
      )}

      {view.name === "menu" && (
        <div>
          <nav className="jh-seg-row" aria-label="Sections">
            <button
              type="button"
              className={`jh-seg ${view.tab === "profile" ? "jh-seg--active" : ""}`}
              onClick={() => setView({ ...view, tab: "profile" })}
            >
              Profile
            </button>
            <button
              type="button"
              className={`jh-seg ${view.tab === "jobs" ? "jh-seg--active" : ""}`}
              onClick={() => setView({ ...view, tab: "jobs" })}
            >
              Jobs
            </button>
          </nav>
          {view.tab === "profile" ? (
            <ProfilePanel
              profile={view.profile}
              onSaved={(profile) => setView({ name: "menu", tab: "profile", profile })}
              onLogout={handleLogout}
            />
          ) : (
            <JobPanel profile={view.profile} onLogout={handleLogout} />
          )}
        </div>
      )}
    </main>
  );
}