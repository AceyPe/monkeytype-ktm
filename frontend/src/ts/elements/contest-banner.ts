import * as Notifications from "./notifications";
import { hasContestToday } from "../utils/contest-today";

const SESSION_STORAGE_KEY = "contestTodayBannerClosed";

export async function showIfContestToday(): Promise<void> {
  if (sessionStorage.getItem(SESSION_STORAGE_KEY) === "true") {
    return;
  }

  if (!(await hasContestToday())) {
    return;
  }

  const bannerMessage = `
    <div style="text-align: center">
      <span>
        The marathon has started! Race your way to the top of the leaderboard for exclusive rewards!
        <a href="/contest" router-link>Compete now</a>
      </span>
    </div>
  `;

  Notifications.addBanner(
    bannerMessage,
    1,
    "",
    false,
    () => {
      sessionStorage.setItem(SESSION_STORAGE_KEY, "true");
    },
    true,
  );
}
