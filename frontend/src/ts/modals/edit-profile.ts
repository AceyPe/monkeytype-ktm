import Ape from "../ape";
import { getHTMLById } from "../controllers/badge-controller";
import * as DB from "../db";
import * as Loader from "../elements/loader";
import * as Notifications from "../elements/notifications";
import * as ConnectionState from "../states/connection";
import AnimatedModal from "../utils/animated-modal";
import * as Profile from "../elements/profile";
import { CharacterCounter } from "../elements/character-counter";
import {
  Badge,
  GithubProfileSchema,
  LinkedinProfileSchema,
  UserProfileDetails,
  WebsiteSchema,
} from "@monkeytype/schemas/users";
import { InputIndicator } from "../elements/input-indicator";

export function show(): void {
  if (!ConnectionState.get()) {
    Notifications.add("You are offline", 0, {
      duration: 2,
    });
    return;
  }

  void modal.show({
    beforeAnimation: async () => {
      hydrateInputs();
      initializeCharacterCounters();
    },
  });
}

function hide(): void {
  void modal.hide({
    afterAnimation: async () => {
      const snapshot = DB.getSnapshot();
      if (!snapshot) return;
      void Profile.update("account", snapshot);
    },
  });
}

const bioInput: JQuery<HTMLTextAreaElement> = $("#editProfileModal .bio");
const keyboardInput: JQuery<HTMLTextAreaElement> = $(
  "#editProfileModal .keyboard",
);
const linkedinInput = $("#editProfileModal .linkedin");
const githubInput = $("#editProfileModal .github");
const websiteInput = $("#editProfileModal .website");
const badgeIdsSelect = $("#editProfileModal .badgeSelectionContainer");
const showActivityOnPublicProfileInput = document.querySelector(
  "#editProfileModal .editProfileShowActivityOnPublicProfile",
) as HTMLInputElement;

const indicators = [
  addValidation(linkedinInput, LinkedinProfileSchema),
  addValidation(githubInput, GithubProfileSchema),
  addValidation(websiteInput, WebsiteSchema),
];

let currentSelectedBadgeId = -1;

function hydrateInputs(): void {
  const snapshot = DB.getSnapshot();
  if (!snapshot) return;
  const badges = snapshot.inventory?.badges ?? [];
  const { bio, keyboard, socialProfiles, showActivityOnPublicProfile } =
    snapshot.details ?? {};
  currentSelectedBadgeId = -1;

  bioInput.val(bio ?? "");
  keyboardInput.val(keyboard ?? "");
  const legacySocials = socialProfiles as
    | { linkedin?: string; twitter?: string }
    | undefined;
  linkedinInput.val(legacySocials?.linkedin ?? legacySocials?.twitter ?? "");
  githubInput.val(socialProfiles?.github ?? "");
  websiteInput.val(socialProfiles?.website ?? "");
  badgeIdsSelect.html("");
  showActivityOnPublicProfileInput.checked =
    showActivityOnPublicProfile || false;

  badges?.forEach((badge: Badge) => {
    if (badge.selected) {
      currentSelectedBadgeId = badge.id;
    }

    const badgeOption = getHTMLById(badge.id, false, true);
    const badgeWrapper = `<button type="button" class="badgeSelectionItem ${
      badge.selected ? "selected" : ""
    }" selection-id=${badge.id}>${badgeOption}</button>`;
    badgeIdsSelect.append(badgeWrapper);
  });

  badgeIdsSelect.prepend(
    `<button type="button" class="badgeSelectionItem ${
      currentSelectedBadgeId === -1 ? "selected" : ""
    }" selection-id=${-1}>
      <div class="badge">
        <i class="fas fa-frown-open"></i>
        <div class="text">none</div>
      </div>
    </button>`,
  );

  $(".badgeSelectionItem").on("click", ({ currentTarget }) => {
    const selectionId = $(currentTarget).attr("selection-id") as string;
    currentSelectedBadgeId = parseInt(selectionId, 10);

    badgeIdsSelect.find(".badgeSelectionItem").removeClass("selected");
    $(currentTarget).addClass("selected");
  });

  indicators.forEach((it) => it.hide());
}

function initializeCharacterCounters(): void {
  new CharacterCounter(bioInput, 250);
  new CharacterCounter(keyboardInput, 75);
}

function buildUpdatesFromInputs(): UserProfileDetails {
  const bio = (bioInput.val() ?? "") as string;
  const keyboard = (keyboardInput.val() ?? "") as string;
  const linkedin = (linkedinInput.val() ?? "") as string;
  const github = (githubInput.val() ?? "") as string;
  const website = (websiteInput.val() ?? "") as string;
  const showActivityOnPublicProfile =
    showActivityOnPublicProfileInput.checked ?? false;

  // Legacy profile fields intentionally disabled:
  // const name = "";
  // const avatar = "";
  // const page = "";
  const profileUpdates: UserProfileDetails = {
    bio,
    keyboard,
    socialProfiles: {
      linkedin,
      github,
      website,
    },
    showActivityOnPublicProfile,
  };

  return profileUpdates;
}

async function updateProfile(): Promise<void> {
  const snapshot = DB.getSnapshot();
  if (!snapshot) return;
  const updates = buildUpdatesFromInputs();

  // check for length resctrictions before sending server requests
  const githubLengthLimit = 39;
  if (
    updates.socialProfiles?.github !== undefined &&
    updates.socialProfiles?.github.length > githubLengthLimit
  ) {
    Notifications.add(
      `GitHub username exceeds maximum allowed length (${githubLengthLimit} characters).`,
      -1,
    );
    return;
  }

  const linkedinLengthLimit = 100;
  if (
    updates.socialProfiles?.linkedin !== undefined &&
    updates.socialProfiles?.linkedin.length > linkedinLengthLimit
  ) {
    Notifications.add(
      `LinkedIn profile id exceeds maximum allowed length (${linkedinLengthLimit} characters).`,
      -1,
    );
    return;
  }

  Loader.show();
  const response = await Ape.users.updateProfile({
    body: {
      ...updates,
      selectedBadgeId: currentSelectedBadgeId,
    },
  });
  Loader.hide();

  if (response.status !== 200) {
    Notifications.add("Failed to update profile: " + response.body.message, -1);
    return;
  }

  snapshot.details = response.body.data ?? updates;
  snapshot.inventory?.badges.forEach((badge) => {
    if (badge.id === currentSelectedBadgeId) {
      badge.selected = true;
    } else {
      delete badge.selected;
    }
  });

  Notifications.add("Profile updated", 1);

  hide();
}

function addValidation(element: JQuery, schema: Zod.Schema): InputIndicator {
  const indicator = new InputIndicator(element, {
    valid: {
      icon: "fa-check",
      level: 1,
    },
    invalid: {
      icon: "fa-times",
      level: -1,
    },
    checking: {
      icon: "fa-circle-notch",
      spinIcon: true,
      level: 0,
    },
  });

  element.on("input", (event) => {
    const value = (event.target as HTMLInputElement).value;
    if (value === undefined || value === "") {
      indicator.hide();
      return;
    }
    const validationResult = schema.safeParse(value);
    if (!validationResult.success) {
      indicator.show(
        "invalid",
        validationResult.error.errors.map((err) => err.message).join(", "),
      );
      return;
    }
    indicator.show("valid");
  });
  return indicator;
}

const modal = new AnimatedModal({
  dialogId: "editProfileModal",
  setup: async (modalEl): Promise<void> => {
    modalEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      await updateProfile();
    });
  },
});
