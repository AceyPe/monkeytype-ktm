import { ObjectId, type Collection, type WithId } from "mongodb";
import { Contest, CreateContestRequest } from "@monkeytype/schemas/contests";
import * as db from "../init/db";
import { WithObjectId } from "../utils/misc";

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
