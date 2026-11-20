import { useEffect, useState } from "react";
import { checkSession, logout, type SessionState } from "../todoist/api";
import { storage, CACHE_KEY, DEMO_KEY, LEGACY_TOKEN_KEY } from "../lib/storage";
import { App } from "./App";
import { Connect } from "./Connect";

export function Root() {
  const [demo, setDemo] = useState(() => storage.get(DEMO_KEY) === "1");
  const [session, setSession] = useState<SessionState | "checking">("checking");
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    storage.remove(LEGACY_TOKEN_KEY);
    if (!demo) void checkSession().then(setSession);
  }, [demo]);

  const signOut = async (why?: string) => {
    storage.remove(CACHE_KEY);
    if (demo) {
      storage.remove(DEMO_KEY);
      setDemo(false);
    } else await logout();
    setNotice(why);
    setSession("out");
  };

  if (demo) return <App key="demo" demo onSignOut={signOut} />;
  if (session === "checking") return null;
  if (session === "in") return <App key="live" demo={false} onSignOut={signOut} />;
  return (
    <Connect
      state={session}
      notice={notice}
      onSignedIn={() => {
        storage.remove(CACHE_KEY);
        setNotice(undefined);
        setSession("in");
      }}
      onDemo={() => {
        storage.set(DEMO_KEY, "1");
        setDemo(true);
      }}
    />
  );
}
