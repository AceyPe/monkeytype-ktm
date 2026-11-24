import type { MiniContest } from "@monkeytype/schemas/contests";
import Page from "./page";
import { blurInputElement } from "../input/input-element";
import * as ActiveMiniContest from "../contest/active-mini-contest";
import * as ContestPage from "../contest/contest-page";

export const page = new Page<MiniContest>({
  id: "miniContest",
  display: "Mini-contest",
  element: $(".page.pageTest"),
  path: "/mini-contest",
  beforeHide: async (): Promise<void> => {
    blurInputElement();
  },
  afterHide: ContestPage.leave,
  beforeShow: async (options): Promise<void> => {
    if (options.data === undefined) {
      throw new Error("Mini-contest data is missing");
    }
    ActiveMiniContest.set(options.data);
    await ContestPage.enter(options.data, `${options.data.title} ends in`);
  },
});
