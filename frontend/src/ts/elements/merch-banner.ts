import * as Notifications from "./notifications";

const SESSION_STORAGE_KEY = "countdownBannerClosed";
const COUNTER_SELECTOR = ".countdown-counter";

function getNextAprilFirst(now: Date): Date {
  const year = now.getFullYear();
  const aprilFirstThisYear = new Date(year, 3, 1, 0, 0, 0, 0); // month is 0-based; 3 = April

  if (now <= aprilFirstThisYear) {
    return aprilFirstThisYear;
  }

  return new Date(year + 1, 3, 1, 0, 0, 0, 0);
}

function formatTime(diffMs: number): string {
  if (diffMs <= 0) {
    return "0 days, 0 hours, 0 minutes, and 0 seconds";
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [
    `${days} ${days === 1 ? "day" : "days"}`,
    `${hours} ${hours === 1 ? "hour" : "hours"}`,
    `${minutes} ${minutes === 1 ? "minute" : "minutes"}`,
    `${seconds} ${seconds === 1 ? "second" : "seconds"}`,
  ];

  const lastPart = parts.pop();
  return `${parts.join(", ")}, and ${lastPart}`;
}

function initCountdown(bannerId: number): void {
  const bannerElement = document.querySelector(
    `#bannerCenter .banner[id='${bannerId}'], #bannerCenter .psa[id='${bannerId}']`,
  );
  if (!bannerElement) {
    return;
  }

  const counterElement =
    bannerElement.querySelector<HTMLElement>(COUNTER_SELECTOR);
  if (!counterElement) {
    return;
  }

  const target = getNextAprilFirst(new Date());

  const update = (): void => {
    const now = new Date();
    const diff = target.getTime() - now.getTime();
    counterElement.textContent = formatTime(diff);
    return;
  };

  update();
  window.setInterval(update, 1000);
}

export function showIfNotClosedBefore(): void {
  // Check if April 1st has already passed
  // const now = new Date();
  // const year = now.getFullYear();
  // const aprilFirstThisYear = new Date(year, 3, 1, 0, 0, 0, 0); // month is 0-based; 3 = April

  // If we're on or past April 1st, don't show the banner
  // if (now >= aprilFirstThisYear) {
  //   return;
  // }

  // Check if banner was closed in this session
  const isClosed = sessionStorage.getItem(SESSION_STORAGE_KEY) === "true";
  if (isClosed) {
    return;
  }
  // <div>
  //           Contest mode opens in <b class="countdown-counter"></b>.
  //           <a href="/login">Register here!</a>
  //         </div>

  const bannerMessage = `
    <div style="text-align: center">
              <a href="https://ieee-collabratec.ieee.org/app/community/1387/activities" target="_blank">
        Join our IEEE Collabratec Community!
      </a>
    </div>
  `;

  const bannerId = Notifications.addBanner(
    bannerMessage,
    1,
    "", // empty string to remove the custom icon
    false,
    () => {
      sessionStorage.setItem(SESSION_STORAGE_KEY, "true");
    },
    true,
  );

  // Initialize countdown after banner is created
  // Use setTimeout to ensure DOM is ready
  setTimeout(() => {
    initCountdown(bannerId);
  }, 0);
}
