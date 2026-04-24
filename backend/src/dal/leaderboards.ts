import * as db from "../init/db";
import Logger from "../utils/logger";
import { performance } from "perf_hooks";
import { setLeaderboard } from "../utils/prometheus";
import { isDevEnvironment, omit } from "../utils/misc";
import {
  getCachedConfiguration,
  getLiveConfiguration,
} from "../init/configuration";

import { addLog } from "./logs";
import { Collection, Document, ObjectId } from "mongodb";
import { LeaderboardEntry } from "@monkeytype/schemas/leaderboards";
import { DBUser, getUsersCollection } from "./user";
import MonkeyError from "../utils/error";
import { aggregateWithAcceptedConnections } from "./connections";

export type DBLeaderboardEntry = LeaderboardEntry & {
  _id: ObjectId;
};

type LeaderboardIdentityFields = Pick<
  DBUser,
  "uid" | "firstName" | "lastName" | "geocode"
>;

function getCollectionName(key: {
  language: string;
  mode: string;
  mode2: string;
}): string {
  return `leaderboards.${key.language}.${key.mode}.${key.mode2}`;
}
export const getCollection = (key: {
  language: string;
  mode: string;
  mode2: string;
}): Collection<DBLeaderboardEntry> =>
  db.collection<DBLeaderboardEntry>(getCollectionName(key));

/** Single scalar for $setWindowFields + $documentNumber on Atlas (no array/tuple sort keys). */
function lbWindowSortKeyExpr(lbKey: string): Document {
  const wpm = `$${lbKey}.wpm`;
  const acc = `$${lbKey}.acc`;
  const ts = `$${lbKey}.timestamp`;
  const pad8 = "00000000";
  const pad16 = "0000000000000000";
  return {
    $let: {
      vars: {
        invWpm: {
          $subtract: [
            99999999,
            {
              $min: [99999999, { $round: [{ $multiply: [wpm, 10000] }] }],
            },
          ],
        },
        invAcc: {
          $subtract: [
            99999999,
            {
              $min: [99999999, { $round: [{ $multiply: [acc, 10000] }] }],
            },
          ],
        },
        invTs: {
          // 9e15 fits Number.MAX_SAFE_INTEGER; ts is ms (~1e12) so inverted stays positive.
          $subtract: [9000000000000000, ts],
        },
      },
      in: {
        $concat: [
          {
            $substrCP: [
              { $concat: [pad8, { $toString: "$$invWpm" }] },
              {
                $max: [
                  0,
                  {
                    $subtract: [
                      {
                        $strLenCP: {
                          $concat: [pad8, { $toString: "$$invWpm" }],
                        },
                      },
                      8,
                    ],
                  },
                ],
              },
              8,
            ],
          },
          {
            $substrCP: [
              { $concat: [pad8, { $toString: "$$invAcc" }] },
              {
                $max: [
                  0,
                  {
                    $subtract: [
                      {
                        $strLenCP: {
                          $concat: [pad8, { $toString: "$$invAcc" }],
                        },
                      },
                      8,
                    ],
                  },
                ],
              },
              8,
            ],
          },
          {
            $substrCP: [
              { $concat: [pad16, { $toString: "$$invTs" }] },
              {
                $max: [
                  0,
                  {
                    $subtract: [
                      {
                        $strLenCP: {
                          $concat: [pad16, { $toString: "$$invTs" }],
                        },
                      },
                      16,
                    ],
                  },
                ],
              },
              16,
            ],
          },
        ],
      },
    },
  };
}

export async function get(
  mode: string,
  mode2: string,
  language: string,
  page: number,
  pageSize: number,
  premiumFeaturesEnabled: boolean = false,
  uid?: string,
): Promise<DBLeaderboardEntry[] | false> {
  if (page < 0 || pageSize < 0) {
    throw new MonkeyError(500, "Invalid page or pageSize");
  }

  const skip = page * pageSize;
  const limit = pageSize;

  let leaderboard: DBLeaderboardEntry[] | false = [];

  const pipeline: Document[] = [
    { $sort: { rank: 1 } },
    { $skip: skip },
    { $limit: limit },
  ];

  try {
    if (uid !== undefined) {
      leaderboard = await aggregateWithAcceptedConnections(
        {
          uid,
          collectionName: getCollectionName({ language, mode, mode2 }),
        },
        [
          {
            $setWindowFields: {
              sortBy: { rank: 1 },
              output: { friendsRank: { $documentNumber: {} } },
            },
          },
          ...pipeline,
        ],
      );
    } else {
      leaderboard = await getCollection({ language, mode, mode2 })
        .aggregate<DBLeaderboardEntry>(pipeline)
        .toArray();
    }
    leaderboard = await hydrateLeaderboardIdentityFields(leaderboard);

    if (!premiumFeaturesEnabled) {
      leaderboard = leaderboard.map((it) => omit(it, ["isPremium"]));
    }

    return leaderboard;
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (e.error === 175) {
      //QueryPlanKilled, collection was removed during the query
      return false;
    }
    throw e;
  }
}

const cachedCounts = new Map<string, number>();

export async function getCount(
  mode: string,
  mode2: string,
  language: string,
  uid?: string,
): Promise<number> {
  const key = `${language}_${mode}_${mode2}`;
  if (uid === undefined && cachedCounts.has(key)) {
    return cachedCounts.get(key) as number;
  } else {
    if (uid === undefined) {
      const count = await getCollection({
        language,
        mode,
        mode2,
      }).estimatedDocumentCount();
      cachedCounts.set(key, count);
      return count;
    } else {
      return (
        await aggregateWithAcceptedConnections(
          {
            collectionName: getCollectionName({ language, mode, mode2 }),
            uid,
          },
          [{ $project: { _id: true } }],
        )
      ).length;
    }
  }
}

export async function getRank(
  mode: string,
  mode2: string,
  language: string,
  uid: string,
  friendsOnly: boolean = false,
): Promise<DBLeaderboardEntry | null | false> {
  try {
    if (!friendsOnly) {
      const entry = await getCollection({ language, mode, mode2 }).findOne({
        uid,
      });

      if (entry === null) return null;
      const [hydratedEntry] = await hydrateLeaderboardIdentityFields([entry]);
      return hydratedEntry ?? null;
    } else {
      const results =
        await aggregateWithAcceptedConnections<DBLeaderboardEntry>(
          {
            collectionName: getCollectionName({ language, mode, mode2 }),
            uid,
          },
          [
            {
              $setWindowFields: {
                sortBy: { rank: 1 },
                output: { friendsRank: { $documentNumber: {} } },
              },
            },
            { $match: { uid } },
          ],
        );
      const [hydratedEntry] = await hydrateLeaderboardIdentityFields(results);
      return hydratedEntry ?? null;
    }
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (e.error === 175) {
      //QueryPlanKilled, collection was removed during the query
      return false;
    }
    throw e;
  }
}

async function hydrateLeaderboardIdentityFields(
  entries: DBLeaderboardEntry[],
): Promise<DBLeaderboardEntry[]> {
  if (entries.length === 0) return entries;

  const users = await getUsersCollection()
    .find(
      { uid: { $in: entries.map((it) => it.uid) } },
      { projection: { uid: 1, firstName: 1, lastName: 1, geocode: 1 } },
    )
    .toArray();

  const byUid = new Map<string, LeaderboardIdentityFields>(
    users.map((it) => [it.uid, it]),
  );

  return entries.map((entry) => {
    const identity = byUid.get(entry.uid);
    if (identity === undefined) return entry;

    return {
      ...entry,
      firstName: identity.firstName ?? entry.firstName,
      lastName: identity.lastName ?? entry.lastName,
      geocode: identity.geocode ?? entry.geocode,
    };
  });
}

export async function update(
  mode: string,
  mode2: string,
  language: string,
): Promise<{
  message: string;
  rank?: number;
}> {
  const key = `lbPersonalBests.${mode}.${mode2}.${language}`;
  const lbCollectionName = getCollectionName({ language, mode, mode2 });
  const minTimeTyping = (await getCachedConfiguration(true)).leaderboards
    .minTimeTyping;
  const lb = db.collection<DBUser>("users").aggregate<LeaderboardEntry>(
    [
      {
        $match: {
          [`${key}.wpm`]: {
            $gt: 0,
          },
          [`${key}.acc`]: {
            $gt: 0,
          },
          [`${key}.timestamp`]: {
            $gt: 0,
          },
          banned: {
            $ne: true,
          },
          lbOptOut: {
            $ne: true,
          },
          needsToChangeName: {
            $ne: true,
          },
          timeTyping: {
            $gt: isDevEnvironment() ? 0 : minTimeTyping,
          },
        },
      },
      {
        $sort: {
          [`${key}.wpm`]: -1,
          [`${key}.acc`]: -1,
          [`${key}.timestamp`]: -1,
        },
      },
      // Atlas: $documentNumber needs one scalar sort key (arrays are rejected).
      // Fixed-width inverted fields concatenate to a string that sorts like
      // (wpm↓, acc↓, timestamp↓).
      {
        $addFields: {
          _lbRankSort: lbWindowSortKeyExpr(key),
        },
      },
      {
        $setWindowFields: {
          sortBy: { _lbRankSort: 1 },
          output: {
            rank: { $documentNumber: {} },
          },
        },
      },
      {
        $project: {
          _id: 0,
          rank: 1,
          [`${key}.wpm`]: 1,
          [`${key}.acc`]: 1,
          [`${key}.raw`]: 1,
          [`${key}.consistency`]: 1,
          [`${key}.timestamp`]: 1,
          uid: 1,
          name: 1,
          firstName: 1,
          lastName: 1,
          geocode: 1,
          discordId: 1,
          discordAvatar: 1,
          inventory: 1,
          premium: 1,
        },
      },

      {
        $addFields: {
          _leaderboardDisplayName: {
            $let: {
              vars: {
                fullName: {
                  $trim: {
                    input: {
                      $concat: [
                        { $ifNull: ["$firstName", ""] },
                        " ",
                        { $ifNull: ["$lastName", ""] },
                      ],
                    },
                  },
                },
              },
              in: {
                $cond: [
                  { $ne: ["$$fullName", ""] },
                  "$$fullName",
                  { $ifNull: ["$name", "$uid"] },
                ],
              },
            },
          },
          "user.uid": "$uid",
          "user.name": "$_leaderboardDisplayName",
          "user.firstName": { $ifNull: ["$firstName", "$$REMOVE"] },
          "user.lastName": { $ifNull: ["$lastName", "$$REMOVE"] },
          "user.geocode": { $ifNull: ["$geocode", "$$REMOVE"] },
          "user.discordId": { $ifNull: ["$discordId", "$$REMOVE"] },
          "user.discordAvatar": { $ifNull: ["$discordAvatar", "$$REMOVE"] },
          [`${key}.consistency`]: {
            $ifNull: [`$${key}.consistency`, "$$REMOVE"],
          },
          calculated: {
            rank: "$rank",
            badgeId: {
              $let: {
                vars: {
                  selectedBadge: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: { $ifNull: ["$inventory.badges", []] },
                          as: "b",
                          cond: { $eq: ["$$b.selected", true] },
                        },
                      },
                      0,
                    ],
                  },
                },
                in: {
                  $cond: {
                    if: { $ne: ["$$selectedBadge", null] },
                    // oxlint-disable-next-line no-thenable -- MongoDB $cond operator
                    then: "$$selectedBadge.id",
                    else: "$$REMOVE",
                  },
                },
              },
            },
            isPremium: {
              $switch: {
                branches: [
                  {
                    case: {
                      $or: [
                        {
                          $eq: [
                            { $type: "$premium.expirationTimestamp" },
                            "missing",
                          ],
                        },
                        { $eq: ["$premium.expirationTimestamp", null] },
                      ],
                    },
                    // oxlint-disable-next-line no-thenable -- MongoDB $switch branch
                    then: "$$REMOVE",
                  },
                  {
                    case: { $eq: ["$premium.expirationTimestamp", -1] },
                    // oxlint-disable-next-line no-thenable -- MongoDB $switch branch
                    then: true,
                  },
                  {
                    case: {
                      $gt: [
                        { $toDate: "$premium.expirationTimestamp" },
                        "$$NOW",
                      ],
                    },
                    // oxlint-disable-next-line no-thenable -- MongoDB $switch branch
                    then: true,
                  },
                ],
                default: "$$REMOVE",
              },
            },
          },
        },
      },
      {
        $replaceWith: {
          $mergeObjects: [`$${key}`, "$user", "$calculated"],
        },
      },
      { $out: lbCollectionName },
    ],
    { allowDiskUse: true },
  );

  const start1 = performance.now();
  await lb.toArray();
  const end1 = performance.now();

  const start2 = performance.now();
  await db.collection(lbCollectionName).createIndex({ uid: -1 });
  await db.collection(lbCollectionName).createIndex({ rank: 1 });
  const end2 = performance.now();

  cachedCounts.delete(`${language}_${mode}_${mode2}`);

  //update speedStats
  const boundaries = [...Array(32).keys()].map((it) => it * 10);
  const statsKey = `${language}_${mode}_${mode2}`;
  const src = db.collection(lbCollectionName);
  const histogram = src.aggregate(
    [
      {
        $bucket: {
          groupBy: "$wpm",
          boundaries: boundaries,
          default: "Other",
        },
      },
      {
        $replaceRoot: {
          newRoot: {
            $arrayToObject: [[{ k: { $toString: "$_id" }, v: "$count" }]],
          },
        },
      },
      {
        $group: {
          _id: "speedStatsHistogram", //we only expect one document with type=speedStats
          [`${statsKey}`]: {
            $mergeObjects: "$$ROOT",
          },
        },
      },
      {
        $merge: {
          into: "public",
          on: "_id",
          whenMatched: "merge",
          whenNotMatched: "insert",
        },
      },
    ],
    { allowDiskUse: true },
  );
  const start3 = performance.now();
  await histogram.toArray();
  const end3 = performance.now();

  const timeToRunAggregate = (end1 - start1) / 1000;
  const timeToRunIndex = (end2 - start2) / 1000;
  const timeToSaveHistogram = (end3 - start3) / 1000; // not sent to prometheus yet

  void addLog(
    `system_lb_update_${language}_${mode}_${mode2}`,
    `Aggregate ${timeToRunAggregate}s, loop 0s, insert 0s, index ${timeToRunIndex}s, histogram ${timeToSaveHistogram}`,
  );

  setLeaderboard(language, mode, mode2, [
    timeToRunAggregate,
    0,
    0,
    timeToRunIndex,
  ]);

  return {
    message: "Successfully updated leaderboard",
  };
}

async function createIndex(
  key: string,
  minTimeTyping: number,
  dropIfMismatch = true,
): Promise<void> {
  const index = {
    [`${key}.wpm`]: -1,
    [`${key}.acc`]: -1,
    [`${key}.timestamp`]: -1,
    [`${key}.raw`]: -1,
    [`${key}.consistency`]: -1,
    banned: 1,
    lbOptOut: 1,
    needsToChangeName: 1,
    timeTyping: 1,
    uid: 1,
    name: 1,
    discordId: 1,
    discordAvatar: 1,
    inventory: 1,
    premium: 1,
  };
  const partial = {
    partialFilterExpression: {
      [`${key}.wpm`]: {
        $gt: 0,
      },
      timeTyping: {
        $gt: minTimeTyping,
      },
    },
  };
  try {
    await getUsersCollection().createIndex(index, partial);
  } catch (e) {
    if (!dropIfMismatch) throw e;
    if (
      (e as Error).message.startsWith(
        "An existing index has the same name as the requested index",
      )
    ) {
      Logger.warning(`Index ${key} not matching, dropping and recreating...`);

      const existingIndex = (await getUsersCollection().listIndexes().toArray())
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        .map((it) => it.name as string)
        .find((it) => it.startsWith(key));

      if (existingIndex !== undefined && existingIndex !== null) {
        await getUsersCollection().dropIndex(existingIndex);
        return createIndex(key, minTimeTyping, false);
      } else {
        throw e;
      }
    }
  }
}

export async function createIndicies(): Promise<void> {
  const minTimeTyping = (await getLiveConfiguration()).leaderboards
    .minTimeTyping;
  await createIndex("lbPersonalBests.time.15.english", minTimeTyping);
  await createIndex("lbPersonalBests.time.60.english", minTimeTyping);

  if (isDevEnvironment()) {
    Logger.info("Updating leaderboards in dev mode...");
    await update("time", "15", "english");
    await update("time", "60", "english");
  }
}
