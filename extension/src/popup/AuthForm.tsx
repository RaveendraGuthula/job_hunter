import { useState } from "react";

export type AuthMode = "login" | "register";

interface AuthFormProps {
  onSubmit: (mode: AuthMode, email: string, password: string) => void;
}

export function AuthForm({ onSubmit }: AuthFormProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onSubmit(mode, email.trim(), password);
  }

  return (
    <form className="jh-form" onSubmit={handleSubmit}>
      <div className="jh-form__row">
        <button
          type="button"
          className={`jh-seg ${mode === "login" ? "jh-seg--active" : ""}`}
          onClick={() => setMode("login")}
        >
          Log in
        </button>
        <button
          type="button"
          className={`jh-seg ${mode === "register" ? "jh-seg--active" : ""}`}
          onClick={() => setMode("register")}
        >
          Register
        </button>
      </div>

      <label className="jh-field">
        <span>Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
        />
      </label>

      <label className="jh-field">
        <span>Password</span>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="At least 8 characters"
        />
      </label>

      <button type="submit" className="jh-button">
        {mode === "login" ? "Log in" : "Create account"}
      </button>
    </form>
  );
}