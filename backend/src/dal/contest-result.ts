import { Collection, ObjectId } from "mongodb";
import { LeaderboardEntry } from "@monkeytype/schemas/leaderboards";
import * as db from "../init/db";
import { DBResult } from "../utils/result";
import {
  isContestResultBetter,
  toContestResultSummary,
} from "../utils/contest-result";
import {
  applyRankScopeToEntries,
  getRegionCodeFromGeocode,
  normalizeGeocode,
  RankFilterTarget,
  RankSortOptions,
} from "../utils/geocode-rank-scope";
import { getUsersCollection } from "./user";

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

function compareContestLeaderboardResults(
  a: DBContestResult,
  b: DBContestResult,
): number {
  if (a.wpm !== b.wpm) return b.wpm - a.wpm;
  if (a.rawWpm !== b.rawWpm) return b.rawWpm - a.rawWpm;
  return b.acc - a.acc;
}

export async function getContestLeaderboard(
  contestId: string,
  page: number,
  pageSize: number,
  rankFilter: RankFilterTarget,
  rankSort: RankSortOptions,
): Promise<{ entries: LeaderboardEntry[]; count: number }> {
  await ensureIndexes();

  const results = await getContestResultsCollection()
    .find({ contestId })
    .toArray();
  results.sort(compareContestLeaderboardResults);

  if (results.length === 0) {
    return { entries: [], count: 0 };
  }

  const users = await getUsersCollection()
    .find(
      { uid: { $in: results.map((it) => it.uid) } },
      {
        projection: {
          uid: 1,
          firstName: 1,
          lastName: 1,
          geocode: 1,
        },
      },
    )
    .toArray();

  const usersByUid = new Map(users.map((user) => [user.uid, user]));

  const regionCounter = new Map<string, number>();
  const sectionCounter = new Map<string, number>();

  const rankedEntries: LeaderboardEntry[] = results.map((result, index) => {
    const user = usersByUid.get(result.uid);
    const geocode = user?.geocode;

    const regionCode = getRegionCodeFromGeocode(geocode);
    let regionRank: number | undefined;
    if (regionCode !== null) {
      const nextRegionRank = (regionCounter.get(regionCode) ?? 0) + 1;
      regionCounter.set(regionCode, nextRegionRank);
      regionRank = nextRegionRank;
    }

    const sectionCode = normalizeGeocode(geocode);
    let sectionRank: number | undefined;
    if (sectionCode !== null) {
      const nextSectionRank = (sectionCounter.get(sectionCode) ?? 0) + 1;
      sectionCounter.set(sectionCode, nextSectionRank);
      sectionRank = nextSectionRank;
    }

    const entry: LeaderboardEntry = {
      uid: result.uid,
      name: result.name,
      wpm: result.wpm,
      raw: result.rawWpm,
      acc: result.acc,
      consistency: result.consistency,
      timestamp: result.timestamp,
      rank: index + 1,
      regionRank,
      sectionRank,
      mongoId: user?._id.toHexString(),
      firstName: user?.firstName,
      lastName: user?.lastName,
      geocode,
    };

    return entry;
  });

  const scoped = applyRankScopeToEntries(
    rankedEntries,
    page,
    pageSize,
    rankFilter,
    rankSort,
  );

  return {
    entries: scoped.entries,
    count: scoped.count,
  };
}
