import type { AuthProvider, User, UserCredential } from "./auth-types";
import { promiseWithResolvers } from "./utils/misc";
// eslint-disable-next-line import/no-unresolved
import { envConfig } from "virtual:env-config";

const MOCK_AVATAR_URL = "/images/ktm.png";
const SESSION_URL = `${envConfig.backendUrl}/users/session`;
const LOGOUT_URL = `${envConfig.backendUrl}/users/logout`;

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

async function fetchSessionUser(): Promise<User | null> {
  try {
    const response = await fetch(SESSION_URL, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "X-Client-Version": envConfig.clientVersion,
      },
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as SessionResponse;
    if (body.data?.authenticated !== true || body.data.user === null) {
      return null;
    }
    return toAuthUser(body.data.user);
  } catch {
    return null;
  }
}

export async function init(callback: ReadyCallback): Promise<void> {
  readyCallback = callback;
  try {
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
  await fetch(LOGOUT_URL, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "X-Client-Version": envConfig.clientVersion,
    },
  });
  currentUser = null;
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
  return null;
}

export function resetIgnoreAuthCallback(): void {
  // no-op: Firebase callback suppression is no longer used.
}

export { authPromise };
