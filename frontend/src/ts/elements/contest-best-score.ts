import type { ContestResultSummary } from "@monkeytype/schemas/contest-results";
import Ape from "../ape";
import { getTodaysContest } from "../utils/contest-today";

const element = $("#contestBestScore");
const valueElement = element.find(".contestBestScoreValue");

function formatBestScore(summary: ContestResultSummary | null): string {
  if (summary === null) {
    return "—";
  }
  return `${summary.wpm} wpm`;
}

function render(summary: ContestResultSummary | null): void {
  valueElement.text(formatBestScore(summary));
}

export async function refresh(): Promise<void> {
  const contest = await getTodaysContest();
  if (contest === null) {
    render(null);
    return;
  }

  const response = await Ape.contests.getTodayBestResult();
  if (response.status === 200) {
    render(response.body.data);
    return;
  }

  render(null);
}

export function update(summary: ContestResultSummary): void {
  render(summary);
}

export function show(): void {
  element.removeClass("hidden");
}

export function hide(): void {
  element.addClass("hidden");
  render(null);
}
