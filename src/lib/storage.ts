// localStorage can throw (private windows, blocked storage). Never let it crash the app.
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export const DEMO_KEY = "zen.demo";
/** Older builds kept a Todoist token in the browser; remove it if found. */
export const LEGACY_TOKEN_KEY = "zen.token";
export const CACHE_KEY = "zen.cache";
