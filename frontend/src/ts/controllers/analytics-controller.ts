import { createErrorMessage } from "../utils/misc";

let activated = false;

declare global {
  // `interface` is required here so `Window` merges with the DOM lib; `type` cannot augment.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export async function log(
  eventName: string,
  params?: Record<string, string>,
): Promise<void> {
  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, params ?? {});
    }
  } catch {
    console.log("Analytics unavailable");
  }
}

export function activateAnalytics(): void {
  if (activated) {
    console.warn("Analytics already activated");
    return;
  }
  activated = true;
  console.log("Activating Analytics");
  try {
    $("body").append(`
    <script
    async
    src="https://www.googletagmanager.com/gtag/js?id=UA-165993088-1"
  ></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag() {
      dataLayer.push(arguments);
    }
    gtag("js", new Date());

    gtag("config", "UA-165993088-1");
  </script>`);
  } catch (e) {
    console.error(createErrorMessage(e, "Failed to activate analytics"));
  }
}
