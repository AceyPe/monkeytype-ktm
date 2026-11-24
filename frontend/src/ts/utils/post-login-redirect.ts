const STORAGE_KEY = "postLoginPath";
const MAX_AGE_MS = 10 * 60 * 1000;

/** SSO always lands on /account, remember where the user wanted to go. */
export function remember(path: string): void {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ path, savedAt: Date.now() }),
    );
  } catch {
    // without storage the user stays on /account after signing in
  }
}

export function take(): string | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    if (raw === null) return null;
    const { path, savedAt } = JSON.parse(raw) as {
      path: string;
      savedAt: number;
    };
    if (!/^\/mini-contest\/[a-z0-9]+$/.test(path)) return null;
    return Date.now() - savedAt <= MAX_AGE_MS ? path : null;
  } catch {
    return null;
  }
}
