import type { Contest } from "@monkeytype/schemas/contests";
import * as TestStats from "../test/test-stats";
import * as ManualRestart from "../test/manual-restart-tracker";
import * as TestLogic from "../test/test-logic";
import * as Funbox from "../test/funbox/funbox";
import { updateFooterAndVerticalAds } from "../controllers/ad-controller";
import * as ModesNotice from "../elements/modes-notice";
import * as Keymap from "../elements/keymap";
import * as TestConfig from "../test/test-config";
import * as ScrollToTop from "../elements/scroll-to-top";
import * as Notifications from "../elements/notifications";
import * as Misc from "../utils/misc";
import * as ContestMode from "./contest-mode";
import * as ContestClient from "./contest-client";
import * as ContestMarathonHeader from "../elements/contest-marathon-header";
import * as ContestBestScore from "../elements/contest-best-score";

export async function enter(
  contest: Contest,
  countdownTitle: string,
): Promise<void> {
  $(".page.pageTest").addClass("contest-mode");
  ContestMode.apply();
  ContestBestScore.show();
  void ContestBestScore.refresh();
  try {
    await ContestClient.startSession();
  } catch (e) {
    Notifications.add(
      Misc.createErrorMessage(e, "Contest server unavailable"),
      -1,
      { important: true },
    );
  }
  TestConfig.hide();
  ContestMarathonHeader.show(contest, countdownTitle);
  updateFooterAndVerticalAds(false);
  TestStats.resetIncomplete();
  ManualRestart.set();
  TestLogic.restart({
    noAnim: true,
  });
  void Keymap.refresh();
  ScrollToTop.hide();
}

export async function leave(): Promise<void> {
  await ContestClient.disconnect();
  $(".page.pageTest").removeClass("contest-mode");
  ContestMarathonHeader.hide();
  ContestBestScore.hide();
  ContestMode.restore();
  ManualRestart.set();
  TestLogic.restart({
    noAnim: true,
  });
  void Funbox.clear();
  void ModesNotice.update();
  updateFooterAndVerticalAds(true);
  TestConfig.show();
}
