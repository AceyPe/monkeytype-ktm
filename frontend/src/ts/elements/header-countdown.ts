const ANNOUNCEMENT_SELECTOR = ".announcment";
const ANNOUNCEMENT_COUNTER_SELECTOR = ".announcment .counter";
const ANNOUNCEMENT_CLOSE_BUTTON_SELECTOR = ".announcment button:last-child";
const SESSION_STORAGE_KEY = "announcementClosed";

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

function initHeaderCountdown(): void {
  const announcementElement = document.querySelector<HTMLElement>(
    ANNOUNCEMENT_SELECTOR,
  );
  if (!announcementElement) {
    return;
  }

  // Check if announcement was closed in this session
  const isClosed = sessionStorage.getItem(SESSION_STORAGE_KEY) === "true";
  if (isClosed) {
    announcementElement.classList.add("hidden");
    return;
  }

  // Initialize countdown
  const counterElement = announcementElement.querySelector<HTMLElement>(
    ANNOUNCEMENT_COUNTER_SELECTOR,
  );
  if (counterElement) {
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

  // Setup close button
  const closeButton = announcementElement.querySelector<HTMLButtonElement>(
    ANNOUNCEMENT_CLOSE_BUTTON_SELECTOR,
  );
  if (closeButton) {
    closeButton.addEventListener("click", () => {
      announcementElement.classList.add("hidden");
      sessionStorage.setItem(SESSION_STORAGE_KEY, "true");
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHeaderCountdown);
} else {
  initHeaderCountdown();
}
