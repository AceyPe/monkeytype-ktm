import * as Misc from "../utils/misc";
import {
  getHtmlByUserFlags,
  SupportsFlags,
} from "../controllers/user-flag-controller";
import {
  getAccountClaimsFromStoredToken,
  getAuthenticatedUser,
  isAuthenticated,
} from "../firebase";
import * as XpBar from "./xp-bar";
import { getAvatarElement } from "../utils/discord-avatar";
import * as AuthEvent from "../observables/auth-event";
import { getSnapshot } from "../db";

export function hide(): void {
  $("nav .accountButtonAndMenu").addClass("hidden");
  $("nav .textButton.view-login").addClass("hidden");
}

export function loading(state: boolean): void {
  $("nav .accountButtonAndMenu .spinner").css({ opacity: state ? "1" : "0" });
  $("nav .accountButtonAndMenu .avatar").css({ opacity: state ? "0" : "1" });
}

export function updateName(name: string): void {
  $("header nav .view-account > .text").text(name);
}

function updateFlags(flags: SupportsFlags): void {
  $("nav .textButton.view-account > .text").append(
    getHtmlByUserFlags(flags, { iconsOnly: true }),
  );
}

export function updateAvatar(avatar?: {
  avatarUrl?: string;
  discordId?: string;
  discordAvatar?: string;
}): void {
  const element = getAvatarElement(avatar ?? {}, {
    userIcon: "fas fa-fw fa-user",
  });
  $("header nav .view-account .avatar").replaceWith(element);
}

/** Label next to the nav avatar: JWT first/last name when present, else session user displayName, else account name. */
function getNavbarProfileDisplayName(
  authenticatedUser: ReturnType<typeof getAuthenticatedUser>,
  snapshotName: string | undefined,
): string {
  const claims = getAccountClaimsFromStoredToken();
  const fromClaims = [claims?.firstName, claims?.lastName]
    .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    .join(" ")
    .trim();
  if (fromClaims !== "") return fromClaims;
  const fromUser = authenticatedUser?.displayName?.trim();
  if (fromUser !== undefined && fromUser !== "") return fromUser;
  return snapshotName ?? "";
}

export function update(): void {
  if (isAuthenticated()) {
    const authenticatedUser = getAuthenticatedUser();
    const snapshot = getSnapshot();

    if (snapshot === undefined) {
      loading(true);
      updateName(getNavbarProfileDisplayName(authenticatedUser, undefined));
      updateAvatar({ avatarUrl: authenticatedUser?.photoURL ?? undefined });
      void Misc.swapElements(
        document.querySelector("nav .textButton.view-login") as HTMLElement,
        document.querySelector("nav .accountButtonAndMenu") as HTMLElement,
        250,
      );
      updateFriendRequestsIndicator();
      return;
    }

    const { xp, name } = snapshot;

    loading(false);
    updateName(getNavbarProfileDisplayName(authenticatedUser, name));
    updateFlags(snapshot ?? {});
    XpBar.setXp(xp);
    updateAvatar({
      avatarUrl: authenticatedUser?.photoURL ?? undefined,
      discordId: snapshot.discordId,
      discordAvatar: snapshot.discordAvatar,
    });

    $("nav .accountButtonAndMenu .menu .items .goToProfile").attr(
      "href",
      `/profile/${name}`,
    );
    void Misc.swapElements(
      document.querySelector("nav .textButton.view-login") as HTMLElement,
      document.querySelector("nav .accountButtonAndMenu") as HTMLElement,
      250,
    );
  } else {
    void Misc.swapElements(
      document.querySelector("nav .accountButtonAndMenu") as HTMLElement,
      document.querySelector("nav .textButton.view-login") as HTMLElement,
      250,
      async () => {
        updateName("");
        updateFlags({});
        XpBar.setXp(0);
        updateAvatar();
      },
    );
  }

  updateFriendRequestsIndicator();
}

export function updateFriendRequestsIndicator(): void {
  const friends = getSnapshot()?.connections;

  if (friends !== undefined) {
    const pendingFriendRequests = Object.values(friends).filter(
      (it) => it === "incoming",
    ).length;
    if (pendingFriendRequests > 0) {
      $("nav .view-account > .notificationBubble").removeClass("hidden");
      $("nav .goToFriends > .notificationBubble")
        .removeClass("hidden")
        .text(pendingFriendRequests);
      return;
    }
  }

  $("nav .view-account > .notificationBubble").addClass("hidden");
  $("nav .goToFriends > .notificationBubble").addClass("hidden");
}

const coarse = window.matchMedia("(pointer:coarse)")?.matches;
if (coarse) {
  $("nav .accountButtonAndMenu .textButton.view-account").attr("href", "");
}

AuthEvent.subscribe((event) => {
  if (event.type === "authStateChanged" || event.type === "snapshotUpdated") {
    update();
  }
});
