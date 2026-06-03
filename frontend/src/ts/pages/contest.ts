import * as TestStats from "../test/test-stats";
import * as ManualRestart from "../test/manual-restart-tracker";
import * as TestLogic from "../test/test-logic";
import * as Funbox from "../test/funbox/funbox";
import Page from "./page";
import { updateFooterAndVerticalAds } from "../controllers/ad-controller";
import * as ModesNotice from "../elements/modes-notice";
import * as Keymap from "../elements/keymap";
import * as TestConfig from "../test/test-config";
import * as ScrollToTop from "../elements/scroll-to-top";
import { blurInputElement } from "../input/input-element";
import * as ContestMode from "../contest/contest-mode";

export const page = new Page({
  id: "contest",
  display: "Contest",
  element: $(".page.pageTest"),
  path: "/contest",
  beforeHide: async (): Promise<void> => {
    blurInputElement();
  },
  afterHide: async (): Promise<void> => {
    $(".page.pageTest").removeClass("contest-mode");
    ContestMode.restore();
    ManualRestart.set();
    TestLogic.restart({
      noAnim: true,
    });
    void Funbox.clear();
    void ModesNotice.update();
    updateFooterAndVerticalAds(true);
    TestConfig.show();
  },
  beforeShow: async (): Promise<void> => {
    $(".page.pageTest").addClass("contest-mode");
    ContestMode.apply();
    TestConfig.hide();
    updateFooterAndVerticalAds(false);
    TestStats.resetIncomplete();
    ManualRestart.set();
    TestLogic.restart({
      noAnim: true,
    });
    void Keymap.refresh();
    ScrollToTop.hide();
  },
});
