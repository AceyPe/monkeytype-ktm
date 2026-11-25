import type { MiniContest } from "@monkeytype/schemas/contests";
import Page from "./page";
import * as NavigationEvent from "../observables/navigation-event";
import * as Skeleton from "../utils/skeleton";
import { formatMarathonStartCountdown } from "../utils/contest-marathon";

const pageElement = $(".page.pageMiniContestUpcoming");

let countdownIntervalId: number | undefined;

function clearCountdownInterval(): void {
  window.clearInterval(countdownIntervalId);
  countdownIntervalId = undefined;
}

function updateCountdown(contest: MiniContest): void {
  const remainingMs = contest.date - Date.now();
  pageElement
    .find(".contestMarathonCountdown")
    .text(formatMarathonStartCountdown(remainingMs));

  if (remainingMs <= 0) {
    clearCountdownInterval();
    // the same link opens the typing page once the contest has started
    void NavigationEvent.dispatch({
      url: `/mini-contest/${contest.slug}`,
      force: true,
    });
  }
}

export const page = new Page<MiniContest>({
  id: "miniContestUpcoming",
  display: "Mini-contest",
  element: pageElement,
  path: "/mini-contest",
  beforeHide: async (): Promise<void> => {
    clearCountdownInterval();
  },
  afterHide: async (): Promise<void> => {
    Skeleton.remove("pageMiniContestUpcoming");
  },
  beforeShow: async (options): Promise<void> => {
    const contest = options.data;
    if (contest === undefined) {
      throw new Error("Mini-contest data is missing");
    }
    Skeleton.append("pageMiniContestUpcoming", "main");
    pageElement
      .find(".contestMarathonTitle")
      .text(`${contest.title} starts in`);
    pageElement
      .find(".contestMarathonCountdown")
      .text(formatMarathonStartCountdown(contest.date - Date.now()));
    clearCountdownInterval();
    countdownIntervalId = window.setInterval(() => {
      updateCountdown(contest);
    }, 1000);
  },
});

Skeleton.save("pageMiniContestUpcoming");
