import { CompletedEvent } from "@monkeytype/schemas/results";
import MonkeyError from "./error";
import { DBResult } from "./result";

export function validateContestCompletedEvent(
  completedEvent: CompletedEvent,
): void {
  if (completedEvent.mode !== "time" || completedEvent.mode2 !== "60") {
    throw new MonkeyError(400, "Contest results must use 60 second time mode");
  }

  if (completedEvent.punctuation) {
    throw new MonkeyError(400, "Punctuation is disabled in contest mode");
  }

  if (completedEvent.numbers) {
    throw new MonkeyError(400, "Numbers are disabled in contest mode");
  }

  if (completedEvent.funbox.length > 0) {
    throw new MonkeyError(400, "Funbox is disabled in contest mode");
  }
}

export function compareContestResults(a: DBResult, b: DBResult): number {
  if (a.wpm !== b.wpm) return a.wpm - b.wpm;
  if (a.rawWpm !== b.rawWpm) return a.rawWpm - b.rawWpm;
  return a.acc - b.acc;
}

export function isContestResultBetter(
  candidate: DBResult,
  existing: DBResult,
): boolean {
  return compareContestResults(candidate, existing) > 0;
}

export function toContestResultSummary(result: DBResult): {
  wpm: number;
  rawWpm: number;
  acc: number;
  consistency: number;
} {
  return {
    wpm: result.wpm,
    rawWpm: result.rawWpm,
    acc: result.acc,
    consistency: result.consistency,
  };
}
