import Ape from "./ape";
import * as Notifications from "./elements/notifications";
import Config, * as UpdateConfig from "./config";
import * as Misc from "./utils/misc";
import * as DB from "./db";
import * as Loader from "./elements/loader";
import * as LoginPage from "./pages/login";
import type { AuthProvider } from "./auth-types";
import {
  isAuthAvailable,
  isAuthenticated,
  signOut as authSignOut,
} from "./firebase";
import * as ConnectionState from "./states/connection";
import { navigate } from "./controllers/route-controller";
import { getActiveFunboxesWithFunction } from "./test/funbox/list";
import * as Sentry from "./sentry";
import { tryCatch } from "@monkeytype/util/trycatch";
import * as AuthEvent from "./observables/auth-event";
import { startSamlSignIn } from "./utils/saml-sso";

export const gmailProvider = {} as AuthProvider;
export const githubProvider = {} as AuthProvider;

async function sendVerificationEmail(): Promise<void> {
  if (!isAuthAvailable()) {
    Notifications.add("Authentication uninitialized", -1, {
      duration: 3,
    });
    return;
  }

  Loader.show();
  $(".sendVerificationEmail").prop("disabled", true);
  const result = await Ape.users.verificationEmail();
  $(".sendVerificationEmail").prop("disabled", false);
  if (result.status !== 200) {
    Loader.hide();
    Notifications.add(
      "Failed to request verification email: " + result.body.message,
      -1,
    );
  } else {
    Loader.hide();
    Notifications.add("Verification email sent", 1);
  }
}

async function getDataAndInit(): Promise<boolean> {
  try {
    console.log("getting account data");
    const snapshot = await DB.initSnapshot();

    if (snapshot === false) {
      throw new Error(
        "Snapshot didn't initialize due to lacking authentication even though user is authenticated",
      );
    }

    void Sentry.setUser(snapshot.uid, snapshot.name);
    if (snapshot.needsToChangeName) {
      Notifications.addPSA(
        "You need to update your account name. <a class='openNameChange'>Click here</a> to change it and learn more about why.",
        -1,
        undefined,
        true,
        undefined,
        true,
      );
    }

    const areConfigsEqual =
      JSON.stringify(Config) === JSON.stringify(snapshot.config);

    if (Config === undefined || !areConfigsEqual) {
      console.log(
        "no local config or local and db configs are different - applying db",
      );
      await UpdateConfig.apply(snapshot.config);
      UpdateConfig.saveFullConfigToLocalStorage(true);

      //funboxes might be different and they wont activate on the account page
      for (const fb of getActiveFunboxesWithFunction("applyGlobalCSS")) {
        fb.functions.applyGlobalCSS();
      }
    }
    return true;
  } catch (error) {
    console.error(error);
    LoginPage.enableInputs();
    $("header nav .view-account").css("opacity", 1);
    if (error instanceof DB.SnapshotInitError) {
      if (error.responseCode === 429) {
        Notifications.add(
          "Doing so will save you bandwidth, make the next test be ready faster and will not sign you out (which could mean your new personal best would not save to your account).",
          0,
          {
            duration: 0,
          },
        );
        Notifications.add(
          "You will run into this error if you refresh the website to restart the test. It is NOT recommended to do that. Instead, use tab + enter or just tab (with quick tab mode enabled) to restart the test.",
          0,
          {
            duration: 0,
          },
        );
      }

      Notifications.add("Failed to get user data: " + error.message, -1);
    } else {
      const message = Misc.createErrorMessage(error, "Failed to get user data");
      Notifications.add(message, -1);
    }
    return false;
  }
}

export async function loadUser(_user: unknown): Promise<void> {
  if (!(await getDataAndInit())) {
    signOut();
    return;
  }
  AuthEvent.dispatch({ type: "snapshotUpdated", data: { isInitial: true } });
}

export async function onAuthStateChanged(
  authInitialisedAndConnected: boolean,
  user: unknown | null,
): Promise<void> {
  console.debug(`account controller ready`);

  let userPromise: Promise<void> = Promise.resolve();
  const isUserSignedIn = user !== null;

  if (authInitialisedAndConnected) {
    console.debug(
      `auth state changed, user ${isUserSignedIn ? "true" : "false"}`,
    );
    console.debug(user);
    if (isUserSignedIn) {
      userPromise = loadUser(user);
    } else {
      DB.setSnapshot(undefined);
    }
  }

  if (!authInitialisedAndConnected || !isUserSignedIn) {
    void Sentry.clearUser();
  }

  let keyframes = [
    {
      percentage: 90,
      durationMs: 1000,
      text: "Downloading user data...",
    },
  ];

  //undefined means navigate to whatever the current window.location.pathname is
  await navigate(undefined, {
    force: true,
    loadingOptions: {
      loadingMode: () => {
        if (user !== null) {
          return "sync";
        } else {
          return "none";
        }
      },
      loadingPromise: async () => {
        await userPromise;
      },
      style: "bar",
      keyframes: keyframes,
    },
  });

  AuthEvent.dispatch({
    type: "authStateChanged",
    data: { isUserSignedIn: user !== null },
  });
}

export async function signIn(_email: string, _password: string): Promise<void> {
  if (!isAuthAvailable()) {
    Notifications.add("Authentication uninitialized", -1);
    return;
  }
  if (!ConnectionState.get()) {
    Notifications.add("You are offline", 0, {
      duration: 2,
    });
    return;
  }

  LoginPage.showPreloader();
  LoginPage.disableInputs();
  LoginPage.disableSignUpButton();

  const { error } = await tryCatch(startSamlSignIn());
  if (error !== null) {
    Notifications.add(error.message, -1);
    LoginPage.hidePreloader();
    LoginPage.enableInputs();
    LoginPage.updateSignupButton();
    return;
  }
}

export function signOut(): void {
  if (!isAuthAvailable()) {
    Notifications.add("Authentication uninitialized", -1, {
      duration: 3,
    });
    return;
  }
  if (!isAuthenticated()) return;
  void authSignOut();
}

async function signUp(): Promise<void> {
  Notifications.add(
    "Sign up is disabled. Please sign in with your SAML provider.",
    0,
  );
}

$(".pageLogin .login form").on("submit", (e) => {
  e.preventDefault();
  const email =
    ($(".pageLogin .login input")[0] as HTMLInputElement).value ?? "";
  const password =
    ($(".pageLogin .login input")[1] as HTMLInputElement).value ?? "";
  void signIn(email, password);
});

$(".pageLogin .login button.signInWithGoogle").on("click", () => {
  void startSamlSignIn();
});

$(".pageLogin .login button.signInWithGitHub").on("click", () => {
  void startSamlSignIn();
});

$("nav").on("click", "a.textButton.view-login", (e) => {
  e.preventDefault();
  void startSamlSignIn();
});

$("nav .accountButtonAndMenu .menu button.signOut").on("click", () => {
  if (!isAuthAvailable()) {
    Notifications.add("Authentication uninitialized", -1, {
      duration: 3,
    });
    return;
  }
  signOut();
});

$(".pageLogin .register form").on("submit", (e) => {
  e.preventDefault();
  void signUp();
});

$(".pageAccountSettings").on("click", "#addGoogleAuth", () => {
  Notifications.add("Additional auth providers are disabled in JWT mode.", 0);
});
$(".pageAccountSettings").on("click", "#addGithubAuth", () => {
  Notifications.add("Additional auth providers are disabled in JWT mode.", 0);
});

$(".pageAccount").on("click", ".sendVerificationEmail", () => {
  if (!ConnectionState.get()) {
    Notifications.add("You are offline", 0, {
      duration: 2,
    });
    return;
  }
  void sendVerificationEmail();
});
