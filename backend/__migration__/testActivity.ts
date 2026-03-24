import "dotenv/config";
import * as DB from "../src/init/db";
import { Collection, Db } from "mongodb";

import readlineSync from "readline-sync";
import { DBUser } from "../src/dal/user";
import { DBResult } from "../src/utils/result";
import { CountByYearAndDay } from "@monkeytype/schemas/users";

const batchSize = 50;

let appRunning = true;
let db: Db | undefined;
let userCollection: Collection<DBUser>;
let resultCollection: Collection<DBResult>;

const filter = { testActivity: { $exists: false } };

process.on("SIGINT", () => {
  console.log("\nshutting down...");
  appRunning = false;
});

if (require.main === module) {
  void main();
}

async function main(): Promise<void> {
  try {
    console.log(
      `Connecting to database ${process.env["DB_NAME"]} on ${process.env["DB_URI"]}...`,
    );

    if (!readlineSync.keyInYN("Ready to start migration?")) {
      appRunning = false;
    }

    if (appRunning) {
      await DB.connect();
      console.log("Connected to database");
      db = DB.getDb();
      if (db === undefined) {
        throw Error("db connection failed");
      }

      await migrate();
    }

    console.log(`\nMigration ${appRunning ? "done" : "aborted"}.`);
  } catch (e) {
    console.log("error occured:", { e });
  } finally {
    await DB.close();
  }
}

export async function migrate(): Promise<void> {
  userCollection = DB.collection("users");
  resultCollection = DB.collection("results");

  console.log("Creating index on users collection...");
  const t1 = Date.now();
  await userCollection.createIndex({ uid: 1 }, { unique: true });
  console.log("Index created in", Date.now() - t1, "ms");
  await migrateResults();
}

async function migrateResults(): Promise<void> {
  const allUsersCount = await userCollection.countDocuments(filter);
  if (allUsersCount === 0) {
    console.log("No users to migrate.");
    return;
  } else {
    console.log("Users to migrate:", allUsersCount);
  }

  console.log(`Migrating ~${allUsersCount} users using batchSize=${batchSize}`);

  let count = 0;
  const start = new Date().valueOf();
  let uids: string[] = [];
  do {
    const t0 = Date.now();
    console.log("Fetching users to migrate...");
    const t1 = Date.now();
    uids = await getUsersToMigrate(batchSize);
    console.log("Fetched", uids.length, "users in", Date.now() - t1, "ms");
    console.log("Users to migrate:", uids.join(","));

    //migrate
    const t2 = Date.now();
    await migrateUsers(uids);
    console.log("Migrated", uids.length, "users in", Date.now() - t2, "ms");
    const t3 = Date.now();
    await handleUsersWithNoResults(uids);
    console.log("Handled users with no results in", Date.now() - t3, "ms");

    //progress tracker
    count += uids.length;
    updateProgress(allUsersCount, count, start, Date.now() - t0);
  } while (uids.length > 0 && appRunning);

  if (appRunning) updateProgress(100, 100, start, 0);
}

async function getUsersToMigrate(limit: number): Promise<string[]> {
  return (
    await userCollection
      .find(filter, { limit })
      .project({ uid: 1, _id: 0 })
      .toArray()
  ).map((it) => it["uid"]);
}

function buildTestActivityForYear(
  days: { day: number; tests: number }[],
  year: number,
): Record<string, (number | null)[]> {
  if (days.length === 0) {
    return {};
  }
  const max = Math.max(...days.map((it) => it.day)) - 1;
  const arr: (number | null)[] = new Array(max).fill(null);
  for (const day of days) {
    arr[day.day - 1] = day.tests;
  }
  return { [String(year)]: arr };
}

async function migrateUsers(uids: string[]): Promise<void> {
  type YearRow = {
    _id: { uid: string; year: number };
    days: { day: number; tests: number }[];
  };

  const yearRows = await resultCollection
    .aggregate<YearRow>(
      [
        {
          $match: {
            uid: { $in: uids },
          },
        },
        {
          $project: {
            _id: 0,
            timestamp: -1,
            uid: 1,
          },
        },
        {
          $addFields: {
            date: {
              $toDate: "$timestamp",
            },
          },
        },
        {
          $replaceWith: {
            uid: "$uid",
            year: {
              $year: "$date",
            },
            day: {
              $dayOfYear: "$date",
            },
          },
        },
        {
          $group: {
            _id: {
              uid: "$uid",
              year: "$year",
              day: "$day",
            },
            count: {
              $sum: 1,
            },
          },
        },
        {
          $group: {
            _id: {
              uid: "$_id.uid",
              year: "$_id.year",
            },
            days: {
              $addToSet: {
                day: "$_id.day",
                tests: "$count",
              },
            },
          },
        },
      ],
      { allowDiskUse: true },
    )
    .toArray();

  const byUid = new Map<string, CountByYearAndDay>();
  for (const row of yearRows) {
    const uid = row._id.uid;
    const partial = buildTestActivityForYear(row.days, row._id.year);
    const cur = byUid.get(uid) ?? {};
    Object.assign(cur, partial);
    byUid.set(uid, cur);
  }

  if (byUid.size === 0) {
    return;
  }

  await userCollection.bulkWrite(
    [...byUid.entries()].map(([uid, testActivity]) => ({
      updateOne: {
        filter: { uid },
        update: { $set: { testActivity } },
      },
    })),
  );
}

async function handleUsersWithNoResults(uids: string[]): Promise<void> {
  await userCollection.updateMany(
    {
      $and: [{ uid: { $in: uids } }, filter],
    },
    { $set: { testActivity: {} } },
  );
}

function updateProgress(
  all: number,
  current: number,
  start: number,
  previousBatchSizeTime: number,
): void {
  const percentage = (current / all) * 100;
  const timeLeft = Math.round(
    (((new Date().valueOf() - start) / percentage) * (100 - percentage)) / 1000,
  );

  process.stdout.clearLine?.(0);
  process.stdout.cursorTo?.(0);
  process.stdout.write(
    `Previous batch took ${Math.round(previousBatchSizeTime)}ms (~${
      previousBatchSizeTime / batchSize
    }ms per user) ${Math.round(
      percentage,
    )}% done, estimated time left ${timeLeft} seconds.`,
  );
}
