import { useState } from "react";
import { storage, TOKEN_KEY, CACHE_KEY } from "../lib/storage";
import { App } from "./App";
import { Connect } from "./Connect";

export function Root() {
  const [token, setToken] = useState<string | null>(() => storage.get(TOKEN_KEY));
  const [notice, setNotice] = useState<string>();

  const connect = (t: string) => {
    storage.set(TOKEN_KEY, t);
    storage.remove(CACHE_KEY);
    setNotice(undefined);
    setToken(t);
  };
  const signOut = (why?: string) => {
    storage.remove(TOKEN_KEY);
    storage.remove(CACHE_KEY);
    setNotice(why);
    setToken(null);
  };

  if (!token) return <Connect onConnect={connect} notice={notice} />;
  return <App key={token} token={token} onSignOut={signOut} />;
}
