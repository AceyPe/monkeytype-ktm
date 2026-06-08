import type { Contest } from "@monkeytype/schemas/contests";
import {
  getAccountClaimsFromStoredToken,
  getAccountDisplayName,
  getAuthenticatedUser,
} from "../firebase";
import { getSnapshot } from "../db";
import { getTodaysContest } from "../utils/contest-today";
import {
  formatMarathonCountdown,
  getContestRemainingMs,
} from "../utils/contest-marathon";
import * as ContestMoreInfoModal from "../modals/contest-more-info";

const topSectionElement = $("#testTopSection");
const practiceHeaderElement = $("#testModeHeader");
const contestHeaderElement = $("#contestModeHeader");
const countdownElement = contestHeaderElement.find(".contestMarathonCountdown");

let countdownIntervalId: number | undefined;
let activeContest: Contest | null = null;

function clearCountdownInterval(): void {
  if (countdownIntervalId !== undefined) {
    window.clearInterval(countdownIntervalId);
    countdownIntervalId = undefined;
  }
}

function updateCountdownDisplay(): void {
  if (activeContest === null) return;

  const remainingMs = getContestRemainingMs(activeContest.date);
  const formatted = formatMarathonCountdown(remainingMs);
  countdownElement.text(formatted);
  ContestMoreInfoModal.updateContestMoreInfoCountdown(activeContest.date);
}

function startCountdown(): void {
  clearCountdownInterval();
  updateCountdownDisplay();
  countdownIntervalId = window.setInterval(updateCountdownDisplay, 1000);
}

function getContestDisplayName(): string {
  const authenticatedUser = getAuthenticatedUser();
  const snapshot = getSnapshot();
  const claims = getAccountClaimsFromStoredToken();
  const name = getAccountDisplayName({
    firstName: claims?.firstName,
    lastName: claims?.lastName,
    authDisplayName: authenticatedUser?.displayName,
    accountName: snapshot?.name,
    uid: authenticatedUser?.uid,
  });
  return name === "" ? "Member" : name;
}

function bindMoreInfoButton(): void {
  contestHeaderElement
    .find(".contestMoreInfoButton")
    .off("click")
    .on("click", () => {
      if (activeContest === null) return;
      void ContestMoreInfoModal.show(activeContest, getContestDisplayName());
    });
}

export async function show(): Promise<void> {
  activeContest = await getTodaysContest();
  topSectionElement.removeClass("hidden");
  practiceHeaderElement.addClass("hidden");
  contestHeaderElement.removeClass("hidden");

  if (activeContest === null) {
    contestHeaderElement.find(".contestMarathonTitle").text("Marathon");
    contestHeaderElement.find(".contestMarathonSubtext").addClass("hidden");
    countdownElement.text("—");
    clearCountdownInterval();
    bindMoreInfoButton();
    return;
  }

  contestHeaderElement.find(".contestMarathonTitle").text("Marathon ends in");
  contestHeaderElement.find(".contestMarathonSubtext").removeClass("hidden");
  bindMoreInfoButton();
  startCountdown();
}

export function hide(): void {
  clearCountdownInterval();
  activeContest = null;
  contestHeaderElement.addClass("hidden");
  practiceHeaderElement.removeClass("hidden");
}
