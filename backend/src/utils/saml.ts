import type { IncomingHttpHeaders } from "http";
import { Strategy as SamlStrategy } from "passport-saml";
import * as RedisClient from "../init/redis";
import { randomBytes } from "crypto";
import MonkeyError from "./error";
import Logger from "./logger";

/**
 * IEEE and many IdPs reject HTTP-Redirect AuthnRequests to the SSO URL with:
 * "Request contains insufficient information to determine the protocol binding".
 * HTTP-POST (auto-submit form) avoids that. Set SAML_AUTHN_REQUEST_BINDING=HTTP-Redirect to use redirect.
 */
const SAML_AUTHN_REQUEST_BINDING =
  process.env["SAML_AUTHN_REQUEST_BINDING"] ?? "";
const SAML_PUBLIC_API_URL = process.env["SAML_PUBLIC_API_URL"];
// const FRONTEND_BASE_URL = (
//   process.env["FRONTEND_URL"] ?? "https://ieeektm.org"
// ).replace(/\/$/, "");

// SAML configuration from https://www.samltest.dev/
// SSO URL is the endpoint where users are redirected for authentication
const MOCK_SAML_SSO_URL = process.env["SAML_SSO_URL"];
// Entity ID is the IdP's identifier
const MOCK_SAML_ENTITY_ID = process.env["SAML_ENTITY_ID"];
const MOCK_SAML_CERT = `-----BEGIN CERTIFICATE-----
${process.env["SAML_CERT"]}
-----END CERTIFICATE-----`;

const getAcsUrl = (): string => {
  return `https://api.ieeektm.org/users/acs`;
};

// Service Provider (SP) Entity ID - our application's identifier
const getEntityId = (): string => {
  return `https://ieeektm.org`;
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
  const host = getSamlRequestHostFromHeaders(req.headers) ?? "ieeektm.org";
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
  ssoid?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  grade?: string;
  nameID?: string;
  nameIDFormat?: string;
  [key: string]: unknown;
};

const SAML_LOG_XML_STATUS_MAX = 8000;

/** Non-PII fields from decoded SAMLResponse XML for troubleshooting (no assertion body). */
function extractSamlResponseDebugInfo(
  samlResponse: string,
): Record<string, string> | null {
  try {
    const xml = Buffer.from(samlResponse, "base64").toString("utf8");
    if (xml.length === 0 || xml.length > 2_000_000) {
      return null;
    }
    const pickAttr = (re: RegExp): string | undefined => {
      const m = xml.match(re);
      return m?.[1];
    };
    const issuerEl = xml.match(/<(?:[\w-]+:)?Issuer(?:\s[^>]*)?>([^<]*)</);
    const statusCode = xml.match(
      /<(?:[\w-]+:)?StatusCode[^>]*\sValue="([^"]*)"[^/]*\/?>/,
    );
    const nestedStatus = xml.match(
      /<(?:[\w-]+:)?StatusCode[^>]*>[\s\S]*?<(?:[\w-]+:)?StatusCode[^>]*\sValue="([^"]*)"[^/]*\/?>/,
    );
    const statusMsg = xml.match(/<(?:[\w-]+:)?StatusMessage[^>]*>([^<]*)</);
    return {
      decodedLength: String(xml.length),
      destination: pickAttr(/\bDestination="([^"]*)"/) ?? "",
      inResponseTo: pickAttr(/\bInResponseTo="([^"]*)"/) ?? "",
      responseId: pickAttr(/\bID="([^"]*)"/) ?? "",
      issuer: (issuerEl?.[1] ?? "").trim(),
      topLevelStatusCode: (statusCode?.[1] ?? "").trim(),
      nestedStatusCode: (nestedStatus?.[1] ?? "").trim(),
      statusMessage: (statusMsg?.[1] ?? "").trim(),
    };
  } catch {
    return null;
  }
}

function hasXmlStatus(error: unknown): error is { xmlStatus: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "xmlStatus" in error &&
    typeof (error as { xmlStatus: unknown }).xmlStatus === "string"
  );
}

/**
 * passport-saml throws when the IdP returns a SAML Status with top-level code
 * `urn:oasis:names:tc:SAML:2.0:status:Responder` and no Assertion — i.e. the
 * failure happened on the identity provider (e.g. IEEE "Authn Adapter" runtime
 * errors), not signature/Audience validation on our side.
 */
function isSamlIdpResponderError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith("SAML provider returned Responder error:")
  );
}

function serializeSamlValidationError(error: unknown): Record<string, unknown> {
  const base = {} as Record<string, unknown>;
  if (error instanceof Error) {
    base["name"] = error.name;
    base["message"] = error.message;
    if (error.stack !== undefined && error.stack !== "") {
      base["stack"] = error.stack;
    }
    if ("cause" in error && error.cause !== undefined) {
      base["cause"] = serializeSamlValidationError(error.cause);
    }
  } else {
    base["value"] = String(error);
  }
  if (hasXmlStatus(error)) {
    const xs = error.xmlStatus;
    base["xmlStatus"] =
      xs.length > SAML_LOG_XML_STATUS_MAX
        ? `${xs.slice(0, SAML_LOG_XML_STATUS_MAX)}…`
        : xs;
  }
  return base;
}

function buildSamlValidationFailureDetail(
  error: unknown,
  samlResponse: string,
  relayState: string | undefined,
): string {
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message);
    if (hasXmlStatus(error)) {
      parts.push(`xmlStatus: ${error.xmlStatus}`);
    }
    if (error.stack !== undefined && error.stack !== "") {
      parts.push(error.stack);
    }
  } else {
    parts.push(String(error));
  }
  const meta = extractSamlResponseDebugInfo(samlResponse);
  if (meta !== null) {
    parts.push(`samlResponseMeta: ${JSON.stringify(meta)}`);
  }
  if (relayState !== undefined && relayState !== "") {
    parts.push(`relayStateLength: ${String(relayState.length)}`);
  }
  return parts.join("\n");
}

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
    const logPayload = {
      ...serializeSamlValidationError(error),
      samlResponseMeta: extractSamlResponseDebugInfo(samlResponse),
      relayStatePresent: relayState !== undefined && relayState !== "",
      relayStateLength:
        relayState !== undefined ? String(relayState.length) : undefined,
      sp: {
        issuer: getEntityId(),
        callbackUrl: getAcsUrl(),
        idpIssuer: MOCK_SAML_ENTITY_ID,
        entryPoint: MOCK_SAML_SSO_URL,
      },
    };
    if (isSamlIdpResponderError(error)) {
      logPayload["idpResponderFailure"] = true;
    }
    Logger.error(
      `SAML validatePostResponseAsync failed: ${JSON.stringify(logPayload)}`,
    );
    const userMessage = isSamlIdpResponderError(error)
      ? "The identity provider returned an error and could not complete sign-in. Please try again later."
      : "SAML validation failed";
    throw new MonkeyError(
      401,
      userMessage,
      buildSamlValidationFailureDetail(error, samlResponse, relayState),
    );
  }
}
