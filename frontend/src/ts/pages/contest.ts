import Page from "./page";
import { blurInputElement } from "../input/input-element";
import * as Notifications from "../elements/notifications";
import * as ContestPage from "../contest/contest-page";
import { getTodaysContest } from "../utils/contest-today";
import * as NavigationEvent from "../observables/navigation-event";

export const page = new Page({
  id: "contest",
  display: "Contest",
  element: $(".page.pageTest"),
  path: "/contest",
  beforeHide: async (): Promise<void> => {
    blurInputElement();
  },
  afterHide: ContestPage.leave,
  beforeShow: async (): Promise<void> => {
    const todaysContest = await getTodaysContest();
    if (todaysContest === null) {
      Notifications.add("No contest is active today", -1, { important: true });
      await NavigationEvent.dispatch({ url: "/", force: true });
      return;
    }

    await ContestPage.enter(todaysContest, "Marathon ends in");
  },
});
