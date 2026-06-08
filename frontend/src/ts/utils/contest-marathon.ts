import { format } from "date-fns";
import { UTCDateMini } from "@date-fns/utc";
import type { ContestPrize } from "@monkeytype/schemas/contests";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function getContestEndMs(contestDate: number): number {
  return contestDate + 24 * 60 * 60 * 1000 - 1000;
}

export function getContestRemainingMs(
  contestDate: number,
  now = Date.now(),
): number {
  return Math.max(0, getContestEndMs(contestDate) - now);
}

export function formatMarathonCountdown(remainingMs: number): string {
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

export function formatMarathonCountdownVerbose(remainingMs: number): string {
  if (remainingMs <= 0) {
    return "0 hours, 0 minutes, and 0 seconds";
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [
    `${hours} ${hours === 1 ? "hour" : "hours"}`,
    `${minutes} ${minutes === 1 ? "minute" : "minutes"}`,
    `${seconds} ${seconds === 1 ? "second" : "seconds"}`,
  ];

  const lastPart = parts.pop();
  return `${parts.join(", ")}, and ${lastPart}`;
}

export function formatContestEndUtc(contestDate: number): string {
  const end = new UTCDateMini(getContestEndMs(contestDate));
  return `${format(end, "d MMM yyyy")}, 23:59:59 UTC`;
}

export function formatPrizeRange(
  fromPosition: number,
  toPosition?: number,
): string {
  if (toPosition === undefined || toPosition === fromPosition) {
    return String(fromPosition);
  }
  return `${fromPosition}–${toPosition}`;
}

export function formatPrizeListHtml(prizes: ContestPrize[]): string {
  if (prizes.length === 0) {
    return '<p class="contestPrizeEmpty">Prizes will be announced soon.</p>';
  }

  const items = prizes
    .map(
      (prize) =>
        `<li><span class="contestPrizePosition">${formatPrizeRange(prize.fromPosition, prize.toPosition)}</span> ${escapeHtml(prize.reward)}</li>`,
    )
    .join("");

  return `<ul class="contestPrizeList">${items}</ul>`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
