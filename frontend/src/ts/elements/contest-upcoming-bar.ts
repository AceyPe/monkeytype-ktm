import type { Contest } from "@monkeytype/schemas/contests";
import { getUpcomingContest } from "../utils/contest-today";
import { formatContestStartCountdown } from "../utils/contest-marathon";
import * as ContestMoreInfoModal from "../modals/contest-more-info";
import { getContestDisplayName } from "./contest-marathon-header";
import { refreshBannerLayout } from "./notifications";

const COUNTDOWN_PARTS = ["days", "hours", "minutes", "seconds"] as const;

const barElement = document.getElementById("contestUpcomingBar");
const countdownElement = barElement?.querySelector(".contestUpcomingCountdown");

let activeContest: Contest | null = null;
let countdownIntervalId: number | undefined;
let showRequestId = 0;

function clearCountdownInterval(): void {
  if (countdownIntervalId !== undefined) {
    window.clearInterval(countdownIntervalId);
    countdownIntervalId = undefined;
  }
}

function updateCountdownDisplay(): void {
  if (
    activeContest === null ||
    countdownElement === undefined ||
    countdownElement === null
  ) {
    return;
  }

  const remainingMs = Math.max(0, activeContest.date - Date.now());
  const parts = formatContestStartCountdown(remainingMs).split(":");
  for (const [index, part] of COUNTDOWN_PARTS.entries()) {
    const valueElement = countdownElement.querySelector(
      `[data-part="${part}"]`,
    );
    if (valueElement !== null) {
      valueElement.textContent = parts[index] ?? "";
    }
  }
  if (remainingMs <= 0) {
    hide();
  }
}

function bindDetailsLink(): void {
  barElement
    ?.querySelector(".contestUpcomingDetails")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      if (activeContest === null) return;
      void ContestMoreInfoModal.show(activeContest, getContestDisplayName());
    });
}

bindDetailsLink();

export function hide(): void {
  showRequestId += 1;
  clearCountdownInterval();
  activeContest = null;
  barElement?.classList.add("hidden");
  refreshBannerLayout();
}

export async function show(): Promise<void> {
  const requestId = ++showRequestId;
  const contest = await getUpcomingContest();
  if (requestId !== showRequestId) return;

  if (contest === null || barElement === null) {
    clearCountdownInterval();
    activeContest = null;
    barElement?.classList.add("hidden");
    refreshBannerLayout();
    return;
  }

  activeContest = contest;
  barElement.classList.remove("hidden");
  updateCountdownDisplay();
  if (activeContest === null) return;

  clearCountdownInterval();
  countdownIntervalId = window.setInterval(updateCountdownDisplay, 1000);
  refreshBannerLayout();
}
