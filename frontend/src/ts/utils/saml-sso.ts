import * as ConnectionState from "../states/connection";
import * as Loader from "../elements/loader";
import * as Notifications from "../elements/notifications";
import * as Misc from "./misc";
import { tryCatch } from "@monkeytype/util/trycatch";
import { isAuthenticated } from "../firebase";
// eslint-disable-next-line import/no-unresolved
import { envConfig } from "virtual:env-config";

/** SAML initiate uses this host instead of `backendUrl` (temporary). */
const SAML_SSO_INITIATE_URL = "https://api.ieeektm.org/users/login";
// const SAML_SSO_INITIATE_URL = "http://localhost:5005/users/login";

/** Normalize pathname without a trailing slash (except `/`). */
function normalizedPathname(): string {
  const p = window.location.pathname;
  if (p.length > 1 && p.endsWith("/")) {
    return p.slice(0, -1);
  }
  return p || "/";
}

/**
 * If we leave for the IdP while the current history entry is `/login` or
 * `/{locale}/login`, the next "back" would return there and re-trigger SSO.
 * Replace that entry with `/` so back from SAML lands on the home page.
 */
function replaceLoginHistoryEntryWithHome(): void {
  const path = normalizedPathname();
  // `/login`, `/en/login`, optional single path segment before `login`
  if (/^(?:\/[^/]+)?\/login$/.test(path)) {
    window.history.replaceState(null, "", "/");
  }
}

/** Returns true when redirecting to the IdP; false on error or offline. */
export async function startSamlSignIn(): Promise<boolean> {
  if (isAuthenticated()) {
    window.location.assign("/account");
    return true;
  }

  if (!ConnectionState.get()) {
    Notifications.add("You are offline", 0, {
      duration: 2,
    });
    return false;
  }

  Loader.show();

  const { data: response, error } = await tryCatch(
    (async (): Promise<{
      status: number;
      body: { message: string; data?: { url: string } };
    }> => {
      const res = await fetch(SAML_SSO_INITIATE_URL, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Client-Version": envConfig.clientVersion,
        },
      });
      const body = (await res.json()) as {
        message: string;
        data?: { url: string };
      };
      return { status: res.status, body };
    })(),
  );

  if (error !== null) {
    Notifications.add(
      Misc.createErrorMessage(error, "Could not start SSO"),
      -1,
    );
    Loader.hide();
    return false;
  }

  if (response.status !== 200 || response.body.data?.url === undefined) {
    Notifications.add(
      response.status !== 200
        ? response.body.message
        : "SSO URL missing from server response",
      -1,
    );
    Loader.hide();
    return false;
  }

  replaceLoginHistoryEntryWithHome();
  window.location.assign(response.body.data.url);
  return true;
}
