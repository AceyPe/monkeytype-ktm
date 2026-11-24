import { randomInt } from "crypto";
import { ObjectId, type Collection, type WithId } from "mongodb";
import {
  CreateContestRequest,
  MINI_CONTEST_SLUG_LENGTH,
  MiniContest,
  UpdateContestRequest,
} from "@monkeytype/schemas/contests";
import * as db from "../init/db";
import { WithObjectId } from "../utils/misc";
import MonkeyError from "../utils/error";
import { isContestDateToday } from "./contest";

export type DBMiniContest = WithObjectId<MiniContest>;

const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export const getMiniContestsCollection = (): Collection<
  WithId<DBMiniContest>
> => db.collection<DBMiniContest>("mini-contests");

let indexesEnsured = false;

async function ensureIndexes(): Promise<void> {
  if (indexesEnsured) return;
  await getMiniContestsCollection().createIndex({ slug: 1 }, { unique: true });
  indexesEnsured = true;
}

export function generateSlug(): string {
  return Array.from(
    { length: MINI_CONTEST_SLUG_LENGTH },
    () => SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)],
  ).join("");
}

export async function getMiniContests(): Promise<DBMiniContest[]> {
  return await getMiniContestsCollection().find().sort({ date: -1 }).toArray();
}

export async function getPublicMiniContests(): Promise<DBMiniContest[]> {
  return await getMiniContestsCollection()
    .find({ leaderboardPublic: true })
    .sort({ date: -1 })
    .toArray();
}

export async function requireMiniContest(
  contestId: string,
): Promise<DBMiniContest> {
  const contest = await getMiniContestsCollection().findOne({
    _id: new ObjectId(contestId),
  });
  if (contest === null) {
    throw new MonkeyError(404, "Mini-contest not found");
  }
  return contest;
}

export async function requireMiniContestBySlug(
  slug: string,
): Promise<DBMiniContest> {
  await ensureIndexes();
  const contest = await getMiniContestsCollection().findOne({ slug });
  if (contest === null) {
    throw new MonkeyError(404, "Mini-contest not found");
  }
  return contest;
}

export async function requireActiveMiniContest(
  slug: string,
): Promise<DBMiniContest> {
  const contest = await requireMiniContestBySlug(slug);
  if (!isContestDateToday(contest.date)) {
    throw new MonkeyError(403, "This mini-contest is not active today");
  }
  return contest;
}

export async function createMiniContest(
  contest: CreateContestRequest,
): Promise<{ contestId: string; slug: string }> {
  await ensureIndexes();
  const slug = generateSlug();
  const result = await getMiniContestsCollection().insertOne({
    ...contest,
    slug,
    leaderboardPublic: false,
    _id: new ObjectId(),
    createdAt: Date.now(),
  });

  return { contestId: result.insertedId.toHexString(), slug };
}

async function setFields(
  contestId: string,
  fields: Partial<UpdateContestRequest & { leaderboardPublic: boolean }>,
): Promise<void> {
  const result = await getMiniContestsCollection().updateOne(
    { _id: new ObjectId(contestId) },
    { $set: fields },
  );

  if (result.matchedCount === 0) {
    throw new MonkeyError(404, "Mini-contest not found");
  }
}

export async function updateMiniContest(
  contestId: string,
  contest: UpdateContestRequest,
): Promise<void> {
  await setFields(contestId, contest);
}

export async function setMiniContestLeaderboardPublic(
  contestId: string,
  leaderboardPublic: boolean,
): Promise<void> {
  await setFields(contestId, { leaderboardPublic });
}

export async function deleteMiniContest(contestId: string): Promise<void> {
  const result = await getMiniContestsCollection().deleteOne({
    _id: new ObjectId(contestId),
  });

  if (result.deletedCount === 0) {
    throw new MonkeyError(404, "Mini-contest not found");
  }
}
