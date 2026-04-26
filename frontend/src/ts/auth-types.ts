/**
 * Minimal auth shapes used across the app. Firebase Auth has been replaced
 * with session (cookie) + SAML; these types keep the rest of the codebase typed.
 */

export type AuthProvider = Record<string, never>;

export type UserInfo = {
  providerId: string;
  uid: string;
  displayName: string | null;
  email: string | null;
  phoneNumber: string | null;
  photoURL: string | null;
};

export type User = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoURL: string | null;
  providerData: UserInfo[];
  /** No-op when auth is session-only (replaces Firebase `User.delete`). */
  delete: () => Promise<void>;
};

export type UserCredential = {
  user: User;
};
