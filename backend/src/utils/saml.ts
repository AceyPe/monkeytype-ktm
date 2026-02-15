import { Strategy as SamlStrategy } from "passport-saml";
import { getFrontendUrl, isDevEnvironment } from "./misc";
import * as RedisClient from "../init/redis";
import { randomBytes } from "crypto";
import MonkeyError from "./error";

// SAML configuration from https://www.samltest.dev/
// SSO URL is the endpoint where users are redirected for authentication
const MOCK_SAML_SSO_URL =
  "https://www.samltest.dev/idp/profile/saml2/redirect/sso";
// Entity ID is the IdP's identifier
const MOCK_SAML_ENTITY_ID = "https://www.samltest.dev/idp";
const MOCK_SAML_CERT = `-----BEGIN CERTIFICATE-----
MIIDBzCCAe+gAwIBAgIUCLBK4f75EXEe4gyroYnVaqLoSp4wDQYJKoZIhvcNAQEL
BQAwEzERMA8GA1UEAwwIZHVtbXlpZHAwHhcNMjQwNTEzMjE1NDE2WhcNMzQwNTEx
MjE1NDE2WjATMREwDwYDVQQDDAhkdW1teWlkcDCCASIwDQYJKoZIhvcNAQEBBQAD
ggEPADCCAQoCggEBAKhmgQmWb8NvGhz952XY4SlJlpWIK72RilhOZS9frDYhqWVJ
HsGH9Z7sSzrM/0+YvCyEWuZV9gpMeIaHZxEPDqW3RJ7KG51fn/s/qFvwctf+CZDj
yfGDzYs+XIgf7p56U48EmYeWpB/aUW64gSbnPqrtWmVFBisOfIx5aY3NubtTsn+g
0XbdX0L57+NgSvPQHXh/GPXA7xCIWm54G5kqjozxbKEFA0DS3yb6oHRQWHqIAM/7
mJMdUVZNIV1q7c2JIgAl23uDWq+2KTE2R5liP/KjvjwKonVKtTqGqX6ei25rsTHO
aDpBH/LdQK2txgsm7R7+IThWNvUI0TttrmwBqyMCAwEAAaNTMFEwHQYDVR0OBBYE
FD142gxIAJMhpgMkgpzmRNoW9XbEMB8GA1UdIwQYMBaAFD142gxIAJMhpgMkgpzm
RNoW9XbEMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBADQd6k6z
FIc20GfGHY5C2MFwyGOmP5/UG/JiTq7Zky28G6D0NA0je+GztzXx7VYDfCfHxLcm
2k5t9nYhb9kVawiLUUDVF6s+yZUXA4gUA3KoTWh1/oRxR3ggW7dKYm9fsNOdQAbx
UUkzp7HLZ45ZlpKUS0hO7es+fPyF5KVw0g0SrtQWwWucnQMAQE9m+B0aOf+92y7J
QkdgdR8Gd/XZ4NZfoOnKV7A1utT4rWxYCgICeRTHx9tly5OhPW4hQr5qOpngcsJ9
vhr86IjznQXhfj3hql5lA3VbHW04ro37ROIkh2bShDq5dwJJHpYCGrF3MQv8S3m+
jzGhYL6m9gFTm/8=
-----END CERTIFICATE-----`;

const getAcsUrl = (): string => {
  const baseUrl = isDevEnvironment()
    ? "http://localhost:5005"
    : getFrontendUrl().replace(/\/$/, "");
  return `${baseUrl}/users/acs`;
};

// Service Provider (SP) Entity ID - our application's identifier
const getEntityId = (): string => {
  const baseUrl = isDevEnvironment()
    ? "http://localhost:5005"
    : getFrontendUrl().replace(/\/$/, "");
  return `${baseUrl}/users/login`;
};

let samlStrategyInstance: SamlStrategy | null = null;

export function getSamlStrategy(): SamlStrategy {
  if (!samlStrategyInstance) {
    samlStrategyInstance = new SamlStrategy(
      {
        entryPoint: MOCK_SAML_SSO_URL,
        issuer: getEntityId(), // Service Provider (SP) Entity ID
        idpIssuer: MOCK_SAML_ENTITY_ID, // Identity Provider (IdP) Entity ID
        callbackUrl: getAcsUrl(),
        cert: MOCK_SAML_CERT,
        identifierFormat:
          "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
        signatureAlgorithm: "sha256",
        acceptedClockSkewMs: 5000,
      },
      () => {
        // This callback is not used when manually processing SAML
      },
    );
  }
  return samlStrategyInstance;
}

export async function generateSamlRequestId(): Promise<string> {
  const connection = RedisClient.getConnection();
  if (!connection) {
    throw new MonkeyError(500, "Redis connection not found");
  }
  const requestId = randomBytes(20).toString("hex");
  // Store request ID for 5 minutes to validate response
  await connection.setex(`saml:request:${requestId}`, 300, "1");
  return requestId;
}

export async function validateSamlRequestId(
  requestId: string,
): Promise<boolean> {
  const connection = RedisClient.getConnection();
  if (!connection) {
    throw new MonkeyError(500, "Redis connection not found");
  }
  const exists = await connection.getdel(`saml:request:${requestId}`);
  return exists === "1";
}

export function getSamlAuthUrl(): string {
  // const strategy = getSamlStrategy();
  // Generate SAML AuthnRequest and return the redirect URL
  // passport-saml's authenticate method generates the request
  // We'll use the entry point directly since mocksaml.com handles the redirect
  return MOCK_SAML_SSO_URL;
}

export type SamlProfile = {
  email?: string;
  firstName?: string;
  lastName?: string;
  nameID?: string;
  nameIDFormat?: string;
  [key: string]: unknown;
};

export async function validateSamlResponse(
  samlResponse: string,
  relayState?: string,
): Promise<SamlProfile> {
  const strategy = getSamlStrategy();

  // Access the internal SAML instance which has validatePostResponseAsync
  // The Strategy class has a _saml property that contains the SAML instance
  type StrategyWithSAML = SamlStrategy & {
    _saml: {
      validatePostResponseAsync: (container: {
        SAMLResponse: string;
        RelayState?: string;
      }) => Promise<{ profile?: SamlProfile | null; loggedOut?: boolean }>;
    };
  };

  const strategyWithSAML = strategy as unknown as StrategyWithSAML;

  if (strategyWithSAML._saml === null || strategyWithSAML._saml === undefined) {
    throw new MonkeyError(500, "SAML strategy not initialized");
  }

  try {
    const result = await strategyWithSAML._saml.validatePostResponseAsync({
      SAMLResponse: samlResponse,
      RelayState: relayState,
    });

    if (result.loggedOut) {
      throw new MonkeyError(401, "SAML logout response received");
    }

    if (!result.profile) {
      throw new MonkeyError(401, "SAML profile not found");
    }

    return result.profile;
  } catch (error) {
    if (error instanceof MonkeyError) {
      throw error;
    }
    throw new MonkeyError(
      401,
      "SAML validation failed",
      error instanceof Error ? error.message : String(error),
    );
  }
}
