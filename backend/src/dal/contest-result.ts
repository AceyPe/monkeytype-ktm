import { Collection, ObjectId } from "mongodb";
import * as db from "../init/db";
import { DBResult } from "../utils/result";
import {
  isContestResultBetter,
  toContestResultSummary,
} from "../utils/contest-result";

export type DBContestResult = DBResult & {
  contestId: string;
};

type UpsertBestContestResultResponse = {
  insertedId: ObjectId;
  improved: boolean;
  best: ReturnType<typeof toContestResultSummary>;
};

const getContestResultsCollection = (): Collection<DBContestResult> =>
  db.collection<DBContestResult>("contest-results");

let indexesEnsured = false;

async function ensureIndexes(): Promise<void> {
  if (indexesEnsured) return;
  indexesEnsured = true;

  await getContestResultsCollection().createIndex(
    { contestId: 1, uid: 1 },
    { unique: true },
  );
  await getContestResultsCollection().createIndex({
    contestId: 1,
    wpm: -1,
    rawWpm: -1,
    acc: -1,
  });
}

export async function getBestContestResult(
  uid: string,
  contestId: string,
): Promise<DBContestResult | null> {
  await ensureIndexes();
  return await getContestResultsCollection().findOne({ uid, contestId });
}

export async function upsertBestContestResult(
  uid: string,
  contestId: string,
  result: DBResult,
): Promise<UpsertBestContestResultResponse> {
  await ensureIndexes();

  const existing = await getContestResultsCollection().findOne({
    uid,
    contestId,
  });

  if (existing === null) {
    const document: DBContestResult = {
      ...result,
      contestId,
      uid,
    };
    const insertResult =
      await getContestResultsCollection().insertOne(document);
    return {
      insertedId: insertResult.insertedId,
      improved: true,
      best: toContestResultSummary(document),
    };
  }

  if (!isContestResultBetter(result, existing)) {
    return {
      insertedId: existing._id,
      improved: false,
      best: toContestResultSummary(existing),
    };
  }

  const updated: DBContestResult = {
    ...result,
    _id: existing._id,
    contestId,
    uid,
  };

  await getContestResultsCollection().replaceOne(
    { _id: existing._id },
    updated,
  );

  return {
    insertedId: existing._id,
    improved: true,
    best: toContestResultSummary(updated),
  };
}

export async function getLastContestResultTimestamp(
  uid: string,
  contestId: string,
): Promise<number | undefined> {
  await ensureIndexes();
  const result = await getContestResultsCollection().findOne(
    { uid, contestId },
    { projection: { timestamp: 1 } },
  );
  return result?.timestamp;
}
