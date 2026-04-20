import type { Analytics as AnalyticsType } from "firebase/analytics";
import type { AuthProvider, User, UserCredential } from "firebase/auth";
import { promiseWithResolvers } from "./utils/misc";

const AUTH_TOKEN_COOKIE = "mt_auth_token";

type ReadyCallback = (success: boolean, user: User | null) => Promise<void>;
let readyCallback: ReadyCallback | undefined;

type JwtClaims = {
  uid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  grade?: string;
  ssoid?: string;
  exp?: number;
};

const { promise: authPromise, resolve: resolveAuthPromise } =
  promiseWithResolvers();

function getCookieValue(name: string): string | null {
  const prefix = `${name}=`;
  const cookies = document.cookie.split(";");
  for (const rawCookie of cookies) {
    const cookie = rawCookie.trim();
    if (cookie.startsWith(prefix)) {
      const value = cookie.slice(prefix.length);
      if (value !== "") return decodeURIComponent(value);
    }
  }
  return null;
}

function clearCookie(name: string): void {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  return atob(`${normalized}${"=".repeat(padLength)}`);
}

function getTokenClaimsFromCookie(): JwtClaims | null {
  const token = getCookieValue(AUTH_TOKEN_COOKIE);
  if (token === null) return null;

  try {
    const parts = token.split(".");
    const payload = parts[1];
    if (payload === undefined || payload === "") return null;
    const parsed = JSON.parse(decodeBase64Url(payload)) as Partial<JwtClaims>;
    if (typeof parsed.uid !== "string" || parsed.uid === "") return null;
    if (typeof parsed.email !== "string" || parsed.email === "") return null;

    if (typeof parsed.exp === "number" && Date.now() >= parsed.exp * 1000) {
      clearCookie(AUTH_TOKEN_COOKIE);
      return null;
    }

    return {
      uid: parsed.uid,
      email: parsed.email,
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      grade: parsed.grade,
      ssoid: parsed.ssoid,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

function getJwtUser(): User | null {
  const claims = getTokenClaimsFromCookie();
  if (claims === null) return null;
  const displayName = [claims.firstName, claims.lastName]
    .filter((it) => typeof it === "string" && it !== "")
    .join(" ");

  return {
    uid: claims.uid,
    email: claims.email,
    emailVerified: true,
    displayName: displayName === "" ? null : displayName,
    providerData: [],
    // expose custom claims for callers that need SAML payload fields
    ssoid: claims.ssoid,
    firstName: claims.firstName,
    lastName: claims.lastName,
    grade: claims.grade,
  } as unknown as User;
}

export async function init(callback: ReadyCallback): Promise<void> {
  readyCallback = callback;
  try {
    await callback(true, getJwtUser());
  } finally {
    resolveAuthPromise();
  }
}

export function isAuthenticated(): boolean {
  return getJwtUser() !== null;
}

export function getAuthenticatedUser(): User | null {
  return getJwtUser();
}

export function getAnalytics(): AnalyticsType {
  throw new Error("Analytics is unavailable without Firebase auth runtime");
}

export function isAuthAvailable(): boolean {
  return true;
}

export async function signOut(): Promise<void> {
  clearCookie(AUTH_TOKEN_COOKIE);
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
  return getCookieValue(AUTH_TOKEN_COOKIE);
}

export function resetIgnoreAuthCallback(): void {
  // no-op: Firebase callback suppression is no longer used.
}

export { authPromise };
