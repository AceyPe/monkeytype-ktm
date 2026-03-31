import type { IncomingHttpHeaders } from "http";
import { Strategy as SamlStrategy } from "passport-saml";
import * as RedisClient from "../init/redis";
import { randomBytes } from "crypto";
import MonkeyError from "./error";

/**
 * IEEE and many IdPs reject HTTP-Redirect AuthnRequests to the SSO URL with:
 * "Request contains insufficient information to determine the protocol binding".
 * HTTP-POST (auto-submit form) avoids that. Set SAML_AUTHN_REQUEST_BINDING=HTTP-Redirect to use redirect.
 */
const SAML_AUTHN_REQUEST_BINDING =
  process.env["SAML_AUTHN_REQUEST_BINDING"] ?? "HTTP-POST";
const SAML_PUBLIC_API_URL = process.env["SAML_PUBLIC_API_URL"];
const FRONTEND_BASE_URL = (
  process.env["FRONTEND_URL"] ?? "https://ieeektm.org"
).replace(/\/$/, "");

// SAML configuration from https://www.samltest.dev/
// SSO URL is the endpoint where users are redirected for authentication
const MOCK_SAML_SSO_URL = process.env["SAML_SSO_URL"];
// Entity ID is the IdP's identifier
const MOCK_SAML_ENTITY_ID = process.env["SAML_ENTITY_ID"];
const MOCK_SAML_CERT = `-----BEGIN CERTIFICATE-----
${process.env["SAML_CERT"]}
-----END CERTIFICATE-----`;

const getAcsUrl = (): string => {
  return `${FRONTEND_BASE_URL}/users/acs`;
};

// Service Provider (SP) Entity ID - our application's identifier
const getEntityId = (): string => {
  return `${FRONTEND_BASE_URL}/users/login`;
};

let samlStrategyInstance: SamlStrategy | null = null;

export function usesAuthnRequestHttpPostBinding(): boolean {
  return SAML_AUTHN_REQUEST_BINDING === "HTTP-POST";
}

export function getSamlRequestHostFromHeaders(
  headers: IncomingHttpHeaders,
): string | undefined {
  const forwarded = headers["x-forwarded-host"];
  if (typeof forwarded === "string" && forwarded !== "") {
    return forwarded.split(",")[0]?.trim();
  }
  return headers.host;
}

/** Public origin of the API (for SAML POST bridge URL), e.g. https://api.example.org */
export function getPublicApiBaseUrlFromExpressRequest(req: {
  headers: IncomingHttpHeaders;
  protocol?: string;
  secure?: boolean;
}): string {
  if (SAML_PUBLIC_API_URL !== undefined && SAML_PUBLIC_API_URL !== "") {
    return SAML_PUBLIC_API_URL.replace(/\/$/, "");
  }
  const xfProto = req.headers["x-forwarded-proto"];
  const proto =
    typeof xfProto === "string" && xfProto !== ""
      ? xfProto.split(",")[0]?.trim()
      : req.secure === true
        ? "https"
        : (req.protocol ?? "http");
  const host = getSamlRequestHostFromHeaders(req.headers) ?? "localhost";
  return `${proto}://${host}`;
}

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
        authnRequestBinding: usesAuthnRequestHttpPostBinding()
          ? "HTTP-POST"
          : "HTTP-Redirect",
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

/**
 * Build the IdP redirect URL including a SAML AuthnRequest (HTTP-Redirect binding).
 * Returning only {@link MOCK_SAML_SSO_URL} without SAMLRequest makes the IdP return
 * "insufficient information to determine the protocol binding" — same as pasting the SSO URL in the bar.
 */
export async function getSamlAuthUrlAsync(
  hostHeader?: string,
): Promise<string> {
  const strategy = getSamlStrategy();
  type NodeSamlLike = {
    getAuthorizeUrlAsync: (
      relayState: string | undefined,
      host: string | undefined,
      options: { additionalParams?: Record<string, string> } | undefined,
    ) => Promise<string>;
  };
  const saml = (strategy as unknown as { _saml: NodeSamlLike | null })._saml;
  if (saml === null || saml === undefined) {
    throw new MonkeyError(500, "SAML strategy not initialized");
  }
  return saml.getAuthorizeUrlAsync(undefined, hostHeader, undefined);
}

type NodeSamlInternal = {
  getAuthorizeUrlAsync: (
    relayState: string | undefined,
    host: string | undefined,
    options: { additionalParams?: Record<string, string> } | undefined,
  ) => Promise<string>;
  getAuthorizeFormAsync: (
    relayState: string | undefined,
    host: string | undefined,
  ) => Promise<string>;
};

function getNodeSaml(): NodeSamlInternal {
  const strategy = getSamlStrategy();
  const saml = (strategy as unknown as { _saml: NodeSamlInternal | null })
    ._saml;
  if (saml === null || saml === undefined) {
    throw new MonkeyError(500, "SAML strategy not initialized");
  }
  return saml;
}

/** HTML page that POSTs SAMLAuthnRequest to the IdP (HTTP-POST binding). */
export async function getSamlAuthorizeFormHtmlAsync(
  hostHeader?: string,
): Promise<string> {
  return getNodeSaml().getAuthorizeFormAsync(undefined, hostHeader);
}

/**
 * URL the browser should open to start SAML: IdP redirect URL, or our POST-bridge page
 * when {@link usesAuthnRequestHttpPostBinding} is true.
 */
export async function getSamlInitiateNavigateUrl(
  publicApiBaseUrl: string,
  hostHeader?: string,
): Promise<string> {
  const base = publicApiBaseUrl.replace(/\/$/, "");
  if (usesAuthnRequestHttpPostBinding()) {
    return `${base}/users/saml-sso`;
  }
  return getSamlAuthUrlAsync(hostHeader);
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
