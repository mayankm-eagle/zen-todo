import { useState } from "react";
import { login, type SessionState } from "../todoist/api";

interface Props {
  state: SessionState;
  notice?: string;
  onSignedIn: () => void;
  onDemo: () => void;
}

export function Connect({ state, notice, onSignedIn, onDemo }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | undefined>(notice);
  const [busy, setBusy] = useState(false);
  const missing = typeof state === "object" && "missing" in state ? state.missing : null;
  const serverError = typeof state === "object" && "error" in state ? state.error : null;

  return (
    <>
      <main>
        <header>
          <h1>Zen</h1>
        </header>
        <p className="lead">A quiet view of your Todoist. Todoist stays the source of truth; changes here write straight back.</p>
        {missing ? (
          <section aria-labelledby="setup">
            <h2 id="setup">Setup</h2>
            <p>
              This deployment needs {missing.map((m, i) => (
                <span key={m}>
                  {i > 0 && " and "}
                  <code>{m}</code>
                </span>
              ))}{" "}
              set as environment variables, then a redeploy.
            </p>
            <p className="hint">
              <code>TODOIST_API_TOKEN</code> comes from Todoist under Settings → Integrations → Developer.{" "}
              <code>APP_PASSWORD</code> is any password you choose; you'll type it once per device.
            </p>
          </section>
        ) : (
          <section aria-labelledby="signin">
            <h2 id="signin">Sign in</h2>
            <form
              className="connect"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!value || busy) return;
                setBusy(true);
                const err = await login(value).catch(() => "Can't reach the server.");
                setBusy(false);
                if (err) setError(err);
                else onSignedIn();
              }}
            >
              <label className="field">
                <span className="field-label">Password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </label>
              {(error || serverError) && <p className="error">{error ?? serverError}</p>}
              <p className="hint">This device stays signed in for a year.</p>
              <div className="actions">
                <button type="submit" className="chrome-button" disabled={!value || busy}>
                  {busy ? "Signing in…" : "Sign in"}
                </button>
              </div>
            </form>
          </section>
        )}
      </main>
      <footer>
        <button type="button" className="footer-link" onClick={onDemo}>
          Try with sample data
        </button>
      </footer>
    </>
  );
}
