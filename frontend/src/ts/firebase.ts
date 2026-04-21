import type { AuthProvider, User, UserCredential } from "./auth-types";
import { promiseWithResolvers } from "./utils/misc";
// eslint-disable-next-line import/no-unresolved
import { envConfig } from "virtual:env-config";

const MOCK_AVATAR_URL = "/images/ktm.png";
const AUTH_TOKEN_STORAGE_KEY = "mt_auth_token";
const AUTH_TOKEN_URL_KEY = "mt_auth_token";

function getNormalizedBackendUrl(): string {
  const backendUrl =
    typeof envConfig.backendUrl === "string" && envConfig.backendUrl !== ""
      ? envConfig.backendUrl
      : "https://api.ieeektm.org";
  if (/^https?:\/\//i.test(backendUrl)) {
    return backendUrl.replace(/\/$/, "");
  }
  return `${window.location.protocol}//${backendUrl.replace(/\/$/, "")}`;
}

const BACKEND_BASE_URL = getNormalizedBackendUrl();
const SESSION_URL = `${BACKEND_BASE_URL}/users/session`;
const LOGOUT_URL = `${BACKEND_BASE_URL}/users/logout`;

type ReadyCallback = (success: boolean, user: User | null) => Promise<void>;
let readyCallback: ReadyCallback | undefined;
let currentUser: User | null = null;

type SessionUser = {
  uid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
};

const { promise: authPromise, resolve: resolveAuthPromise } =
  promiseWithResolvers();

type SessionResponse = {
  data?: {
    authenticated: boolean;
    user: SessionUser | null;
  };
};

type JwtSessionClaims = {
  uid?: unknown;
  email?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  avatarUrl?: unknown;
  exp?: unknown;
};

function toAuthUser(sessionUser: SessionUser): User {
  const displayName = [sessionUser.firstName, sessionUser.lastName]
    .filter((it) => typeof it === "string" && it !== "")
    .join(" ");
  return {
    uid: sessionUser.uid,
    email: sessionUser.email,
    emailVerified: true,
    displayName: displayName === "" ? null : displayName,
    photoURL: sessionUser.avatarUrl ?? MOCK_AVATAR_URL,
    providerData: [],
    delete: async () => {
      await Promise.resolve();
    },
  };
}

function getStoredToken(): string | null {
  try {
    const value = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (value === null || value === "") return null;
    return value;
  } catch {
    return null;
  }
}

function setStoredToken(token: string): void {
  try {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } catch {
    // ignore storage failures and continue with in-memory state
  }
}

function clearStoredToken(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

function hydrateTokenFromUrl(): void {
  const hash = window.location.hash;
  if (!hash.startsWith("#") || hash.length <= 1) return;

  const params = new URLSearchParams(hash.slice(1));
  const token = params.get(AUTH_TOKEN_URL_KEY);
  if (token === null || token === "") return;

  setStoredToken(token);
  params.delete(AUTH_TOKEN_URL_KEY);

  const newHash = params.toString();
  const newUrl = `${window.location.pathname}${window.location.search}${
    newHash === "" ? "" : `#${newHash}`
  }`;
  window.history.replaceState(null, "", newUrl);
}

function decodeJwtPayload(token: string): JwtSessionClaims | null {
  const payloadPart = token.split(".")[1];
  if (payloadPart === undefined || payloadPart === "") {
    return null;
  }
  try {
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const decoded = atob(padded);
    return JSON.parse(decoded) as JwtSessionClaims;
  } catch {
    return null;
  }
}

function normalizeMaybeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.trim() === "") return undefined;
  return value;
}

function readSessionUserFromToken(token: string | null): User | null {
  if (token === null) {
    return null;
  }
  const claims = decodeJwtPayload(token);
  if (claims === null) {
    return null;
  }
  if (
    typeof claims.exp === "number" &&
    claims.exp > 0 &&
    claims.exp * 1000 <= Date.now()
  ) {
    return null;
  }

  const uid = normalizeMaybeString(claims.uid);
  const email = normalizeMaybeString(claims.email);
  if (uid === undefined || email === undefined) {
    return null;
  }

  return toAuthUser({
    uid,
    email,
    firstName: normalizeMaybeString(claims.firstName),
    lastName: normalizeMaybeString(claims.lastName),
    avatarUrl: normalizeMaybeString(claims.avatarUrl),
  });
}

function createAuthHeaders(token: string | null): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Client-Version": envConfig.clientVersion,
  };
  if (token !== null) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

function clearAuthState(): void {
  clearStoredToken();
  currentUser = null;
}

async function fetchSessionUser(): Promise<User | null> {
  const token = getStoredToken();
  const tokenUser = readSessionUserFromToken(token);
  if (token === null) return null;
  if (tokenUser === null) {
    clearStoredToken();
    return null;
  }

  try {
    const response = await fetch(SESSION_URL, {
      method: "GET",
      headers: createAuthHeaders(token),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearAuthState();
      }
      return tokenUser;
    }

    const body = (await response.json()) as SessionResponse;
    if (body.data?.authenticated !== true || body.data.user === null) {
      clearAuthState();
      return null;
    }
    return toAuthUser(body.data.user);
  } catch {
    return tokenUser;
  }
}

export async function init(callback: ReadyCallback): Promise<void> {
  readyCallback = callback;
  try {
    hydrateTokenFromUrl();
    currentUser = await fetchSessionUser();
    await callback(true, currentUser);
  } finally {
    resolveAuthPromise();
  }
}

export function isAuthenticated(): boolean {
  return currentUser !== null;
}

export function getAuthenticatedUser(): User | null {
  return currentUser;
}

export function isAuthAvailable(): boolean {
  return true;
}

export async function signOut(): Promise<void> {
  const token = getStoredToken();
  if (token !== null) {
    await fetch(LOGOUT_URL, {
      method: "POST",
      headers: createAuthHeaders(token),
    });
  }
  clearAuthState();
  await readyCallback?.(true, null);
}

export async function signInWithEmailAndPassword(
  _email: string,
  _password: string,
  _rememberMe: boolean,
): Promise<UserCredential> {
  throw new Error("Email/password sign-in is disabled. Use SAML sign-in.");
}

export async function signInWithPopup(
  _provider: AuthProvider,
  _rememberMe: boolean,
): Promise<void> {
  throw new Error("Popup auth is disabled. Use SAML sign-in.");
}

export async function createUserWithEmailAndPassword(
  _email: string,
  _password: string,
): Promise<UserCredential> {
  throw new Error("Sign-up is disabled. Use SAML sign-in.");
}

export async function getIdToken(): Promise<string | null> {
  return getStoredToken();
}

export function resetIgnoreAuthCallback(): void {
  // no-op: Firebase callback suppression is no longer used.
}

export { authPromise };
