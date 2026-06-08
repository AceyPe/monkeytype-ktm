import Ape from "../ape";
import { UTCDateMini } from "@date-fns/utc";
import type { Contest } from "@monkeytype/schemas/contests";

function getUtcTodayStart(): number {
  const now = new UTCDateMini();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function isContestDateToday(contestDate: number): boolean {
  return contestDate === getUtcTodayStart();
}

let todaysContestPromise: Promise<Contest | null> | null = null;

export async function getTodaysContest(): Promise<Contest | null> {
  todaysContestPromise ??= fetchTodaysContest();
  return todaysContestPromise;
}

export async function hasContestToday(): Promise<boolean> {
  return (await getTodaysContest()) !== null;
}

async function fetchTodaysContest(): Promise<Contest | null> {
  const response = await Ape.contests.get();
  if (response.status !== 200) {
    return null;
  }

  return (
    response.body.data.find((contest) => isContestDateToday(contest.date)) ??
    null
  );
}
