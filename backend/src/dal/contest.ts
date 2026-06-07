import { ObjectId, type Collection, type WithId } from "mongodb";
import {
  Contest,
  CreateContestRequest,
  UpdateContestRequest,
} from "@monkeytype/schemas/contests";
import * as db from "../init/db";
import { WithObjectId } from "../utils/misc";
import MonkeyError from "../utils/error";

type DBContest = WithObjectId<Contest>;

export const getContestsCollection = (): Collection<WithId<DBContest>> =>
  db.collection<DBContest>("contests");

export async function getContests(): Promise<DBContest[]> {
  return await getContestsCollection().find().sort({ date: -1 }).toArray();
}

type ContestCreationResult = {
  contestId: string;
};

export async function createContest(
  contest: CreateContestRequest,
): Promise<ContestCreationResult> {
  const result = await getContestsCollection().insertOne({
    ...contest,
    _id: new ObjectId(),
    createdAt: Date.now(),
  });

  return {
    contestId: result.insertedId.toHexString(),
  };
}

export async function updateContest(
  contestId: string,
  contest: UpdateContestRequest,
): Promise<void> {
  const result = await getContestsCollection().updateOne(
    { _id: new ObjectId(contestId) },
    { $set: contest },
  );

  if (result.matchedCount === 0) {
    throw new MonkeyError(404, "Contest not found");
  }
}

function getUtcTodayStart(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function isContestDateToday(contestDate: number): boolean {
  return contestDate === getUtcTodayStart();
}

export async function deleteContest(contestId: string): Promise<void> {
  const contest = await getContestsCollection().findOne({
    _id: new ObjectId(contestId),
  });

  if (contest === null) {
    throw new MonkeyError(404, "Contest not found");
  }

  if (isContestDateToday(contest.date)) {
    throw new MonkeyError(403, "Cannot delete a contest scheduled for today");
  }

  await getContestsCollection().deleteOne({ _id: new ObjectId(contestId) });
}
