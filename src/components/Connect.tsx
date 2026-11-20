import { useState } from "react";

export function Connect({ onConnect, notice }: { onConnect: (token: string) => void; notice?: string }) {
  const [value, setValue] = useState("");
  return (
    <>
      <main>
        <header>
          <h1>Zen</h1>
        </header>
        <p className="lead">A quiet view of your Todoist. Todoist stays the source of truth; changes here write straight back.</p>
        <section aria-labelledby="connect">
          <h2 id="connect">Connect</h2>
          <form
            className="connect"
            onSubmit={(e) => {
              e.preventDefault();
              if (value.trim()) onConnect(value.trim());
            }}
          >
            <label className="field">
              <span className="field-label">API token</span>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                placeholder="Paste your Todoist API token"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
            {notice && <p className="error">{notice}</p>}
            <p className="hint">
              Find it in Todoist under{" "}
              <a href="https://app.todoist.com/app/settings/integrations/developer" target="_blank" rel="noopener noreferrer">
                Settings → Integrations → Developer
              </a>
              . It's kept in this browser only and is sent to nobody but Todoist.
            </p>
            <div className="actions">
              <button type="submit" className="chrome-button" disabled={!value.trim()}>
                Connect
              </button>
              <button type="button" className="chrome-button quiet" onClick={() => onConnect("demo")}>
                Try with sample data
              </button>
            </div>
          </form>
        </section>
      </main>
      <footer>
        <a href="https://todoist.com" target="_blank" rel="noopener noreferrer">
          Todoist
        </a>
      </footer>
    </>
  );
}
