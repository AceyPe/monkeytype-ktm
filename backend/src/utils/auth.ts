/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import LRUCache from "lru-cache";
import {
  recordTokenCacheAccess,
  setTokenCacheLength,
  setTokenCacheSize,
} from "./prometheus";
import jwt from "jsonwebtoken";
import MonkeyError from "./error";

export type DecodedIdToken = {
  uid: string;
  email: string;
  geocode?: string;
  status?: string;
  ssoid?: string;
  firstName?: string;
  lastName?: string;
  lastname?: string;
  grade?: string;
  avatarUrl?: string;
  iat: number;
  exp: number;
  type: string;
  iss?: string;
  aud?: string;
};

const tokenCache = new LRUCache<string, DecodedIdToken>({
  max: 20000,
  maxSize: 50000000, // 50MB
  sizeCalculation: (token, key): number =>
    JSON.stringify(token).length + key.length, //sizeInBytes
});

const TOKEN_CACHE_BUFFER = 1000 * 60 * 5; // 5 minutes

/**
 * Get JWT secret from environment or generate a secure one
 * In production, JWT_SECRET should be set in environment variables
 */
function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (secret !== undefined && secret !== null && secret.length >= 32) {
    return secret;
  }
  if (process.env["MODE"] === "dev") {
    // Use a default secret for development only
    return "dev-secret-key-change-in-production-min-32-chars";
  }
  throw new Error(
    "JWT_SECRET environment variable must be set (minimum 32 characters)",
  );
}

export async function verifyIdToken(
  idToken: string,
  noCache = false,
): Promise<DecodedIdToken> {
  const secret = getJwtSecret();

  if (!noCache) {
    setTokenCacheLength(tokenCache.size);
    setTokenCacheSize(tokenCache.calculatedSize ?? 0);

    const cached = tokenCache.get(idToken);

    if (cached) {
      const expirationDate = cached.exp * 1000 - TOKEN_CACHE_BUFFER;

      if (expirationDate < Date.now()) {
        recordTokenCacheAccess("hit_expired");
        tokenCache.delete(idToken);
      } else {
        recordTokenCacheAccess("hit");
        return cached;
      }
    } else {
      recordTokenCacheAccess("miss");
    }
  }

  try {
    const decoded = jwt.verify(idToken, secret, {
      issuer: "monkeytype-api",
      audience: "monkeytype-client",
      algorithms: ["HS256"],
    }) as jwt.JwtPayload & {
      uid: string;
      email: string;
      geocode?: string;
      status?: string;
      ssoid?: string;
      firstName?: string;
      lastName?: string;
      lastname?: string;
      grade?: string;
      iat: number;
      exp: number;
      type: string;
    };

    if (
      typeof decoded.uid !== "string" ||
      typeof decoded.email !== "string" ||
      decoded.uid === "" ||
      decoded.email === ""
    ) {
      throw new MonkeyError(
        401,
        "Invalid token: missing required fields",
        "verifyIdToken",
      );
    }

    // Handle aud which can be string, string[], or undefined
    const audValue =
      typeof decoded.aud === "string"
        ? decoded.aud
        : Array.isArray(decoded.aud)
          ? decoded.aud[0]
          : undefined;

    const decodedToken: DecodedIdToken = {
      uid: decoded.uid,
      email: decoded.email,
      geocode:
        typeof decoded.geocode === "string" ? decoded.geocode : undefined,
      status: typeof decoded.status === "string" ? decoded.status : undefined,
      ssoid: typeof decoded.ssoid === "string" ? decoded.ssoid : undefined,
      firstName:
        typeof decoded.firstName === "string" ? decoded.firstName : undefined,
      lastName:
        typeof decoded.lastName === "string" ? decoded.lastName : undefined,
      lastname:
        typeof decoded.lastname === "string" ? decoded.lastname : undefined,
      grade: typeof decoded.grade === "string" ? decoded.grade : undefined,
      avatarUrl:
        typeof decoded["avatarUrl"] === "string"
          ? decoded["avatarUrl"]
          : undefined,
      iat: typeof decoded.iat === "number" ? decoded.iat : 0,
      exp: typeof decoded.exp === "number" ? decoded.exp : 0,
      type: typeof decoded.type === "string" ? decoded.type : "Bearer",
      iss: typeof decoded.iss === "string" ? decoded.iss : undefined,
      aud: audValue,
    };

    if (!noCache) {
      tokenCache.set(idToken, decodedToken);
    }

    return decodedToken;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new MonkeyError(401, "Token expired", "verifyIdToken");
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new MonkeyError(401, "Invalid token", "verifyIdToken");
    } else if (error instanceof MonkeyError) {
      throw error;
    }
    throw new MonkeyError(
      401,
      "Token verification failed",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Revoke tokens for a user by clearing them from cache
 * Note: With JWT tokens, we can't revoke tokens server-side without a blacklist.
 * This function clears cached tokens, but clients may still use tokens until they expire.
 * For production, consider implementing a token blacklist in Redis.
 */
export async function revokeTokensByUid(uid: string): Promise<void> {
  for (const entry of tokenCache.entries()) {
    if (entry[1].uid === uid) {
      tokenCache.delete(entry[0]);
    }
  }
  // TODO: Implement token blacklist in Redis for production use
}

/**
 * Generate a JWT token for a user
 * @param uid - User ID
 * @param email - User email
 * @returns JWT token string
 */
export function generateJwtToken(
  uid: string,
  email: string,
  claims?: {
    geocode?: string;
    status?: string;
    ssoid?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    lastname?: string;
    grade?: string;
    avatarUrl?: string;
  },
): string {
  const secret = getJwtSecret();
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    uid,
    email,
    ...claims,
    iat: now,
    type: "Bearer",
  };

  const token: string = jwt.sign(payload, secret, {
    issuer: "monkeytype-api",
    audience: "monkeytype-client",
    algorithm: "HS256",
  });
  return token;
}
