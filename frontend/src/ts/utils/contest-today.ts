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

let contestsPromise: Promise<Contest[] | null> | null = null;

async function getContests(): Promise<Contest[] | null> {
  contestsPromise ??= fetchContests();
  return contestsPromise;
}

async function fetchContests(): Promise<Contest[] | null> {
  const response = await Ape.contests.get();
  if (response.status !== 200) {
    return null;
  }

  return response.body.data;
}

export async function getTodaysContest(): Promise<Contest | null> {
  const contests = await getContests();
  if (contests === null) return null;

  return contests.find((contest) => isContestDateToday(contest.date)) ?? null;
}

export async function hasContestToday(): Promise<boolean> {
  return (await getTodaysContest()) !== null;
}

/** Soonest contest whose start (UTC midnight of the contest day) is still ahead. */
export async function getUpcomingContest(): Promise<Contest | null> {
  const contests = await getContests();
  if (contests === null) return null;

  const now = Date.now();
  return (
    contests
      .filter((contest) => contest.date > now)
      .sort((a, b) => a.date - b.date)[0] ?? null
  );
}
