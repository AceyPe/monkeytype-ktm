import Ape from "../ape";
import { UTCDateMini } from "@date-fns/utc";

function getUtcTodayStart(): number {
  const now = new UTCDateMini();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function isContestDateToday(contestDate: number): boolean {
  return contestDate === getUtcTodayStart();
}

let hasContestTodayPromise: Promise<boolean> | null = null;

export async function hasContestToday(): Promise<boolean> {
  hasContestTodayPromise ??= fetchHasContestToday();
  return hasContestTodayPromise;
}

async function fetchHasContestToday(): Promise<boolean> {
  const response = await Ape.contests.get();
  if (response.status !== 200) {
    return false;
  }

  return response.body.data.some((contest) => isContestDateToday(contest.date));
}
