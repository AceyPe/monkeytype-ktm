import { describe, it, expect, beforeEach, vi } from "vitest";
import { ObjectId } from "mongodb";
import { MiniContestSlugSchema } from "@monkeytype/schemas/contests";
import { setup } from "../../__testData__/controller-test";
import * as Db from "../../../src/init/db";
import * as AdminUidsDal from "../../../src/dal/admin-uids";
import * as ContestDal from "../../../src/dal/contest";
import * as ContestResultDal from "../../../src/dal/contest-result";
import * as LogsDal from "../../../src/dal/logs";
import * as UserDal from "../../../src/dal/user";
import * as MiniContestDal from "../../../src/dal/mini-contest";

const { mockApp, uid } = setup();

const slug = MiniContestDal.generateSlug();
const today = new Date().setUTCHours(0, 0, 0, 0);
const body = {
  title: "mini",
  date: today,
  prizes: [{ fromPosition: 1, reward: "cup" }],
};
const contest: MiniContestDal.DBMiniContest = {
  ...body,
  _id: new ObjectId(),
  slug,
  createdAt: 1,
  leaderboardPublic: true,
};
const id = contest._id.toHexString();

const result = {
  acc: 86,
  afkDuration: 5,
  bailedOut: false,
  blindMode: false,
  charStats: [100, 2, 3, 5],
  chartData: { wpm: [1, 2, 3], burst: [50, 55, 56], err: [0, 2, 0] },
  consistency: 23.5,
  difficulty: "normal",
  funbox: [],
  hash: "hash",
  incompleteTestSeconds: 2,
  incompleteTests: [{ acc: 75, seconds: 10 }],
  keyConsistency: 12,
  keyDuration: [0, 3, 5],
  keySpacing: [0, 2, 4],
  language: "english",
  lazyMode: false,
  mode: "time",
  mode2: "60",
  numbers: false,
  punctuation: false,
  rawWpm: 99,
  restartCount: 4,
  tags: [],
  testDuration: 60,
  timestamp: 1000,
  uid,
  wpmConsistency: 55,
  wpm: 80,
  stopOnLetter: false,
  charTotal: 5,
  keyOverlap: 7,
  lastKeyToEnd: 9,
  startToFirstKey: 11,
};

describe("MiniContestController", () => {
  const isAdminMock = vi.spyOn(AdminUidsDal, "isAdmin");
  const getAllMock = vi.spyOn(MiniContestDal, "getMiniContests");
  const getPublicMock = vi.spyOn(MiniContestDal, "getPublicMiniContests");
  const createMock = vi.spyOn(MiniContestDal, "createMiniContest");
  const bySlugMock = vi.spyOn(MiniContestDal, "requireMiniContestBySlug");
  const requireMock = vi.spyOn(MiniContestDal, "requireMiniContest");
  const bestMock = vi.spyOn(ContestResultDal, "getBestContestResult");
  const leaderboardMock = vi.spyOn(ContestResultDal, "getContestLeaderboard");
  const todaysContestMock = vi.spyOn(ContestDal, "getTodaysContest");

  beforeEach(() => {
    vi.clearAllMocks();
    isAdminMock.mockResolvedValue(true);
    getAllMock.mockResolvedValue([contest]);
    getPublicMock.mockResolvedValue([contest]);
    createMock.mockResolvedValue({ contestId: id, slug });
    bySlugMock.mockResolvedValue(contest);
    requireMock.mockResolvedValue(contest);
    bestMock.mockResolvedValue(null);
    leaderboardMock.mockResolvedValue({ entries: [], count: 0 });
  });

  it("generates valid and unique slugs", () => {
    const slugs = Array.from({ length: 200 }, MiniContestDal.generateSlug);
    for (const it of slugs) {
      expect(MiniContestSlugSchema.safeParse(it).success).toBe(true);
    }
    expect(new Set(slugs).size).toBe(200);
  });

  it("lists slugs for admins", async () => {
    const res = await mockApp
      .get("/mini-contests")
      .set("Authorization", `Bearer ${uid}`)
      .expect(200);
    expect(res.body.data).toEqual([{ ...contest, _id: id }]);
  });

  it("creates with a generated link", async () => {
    const res = await mockApp
      .post("/mini-contests")
      .set("Authorization", `Bearer ${uid}`)
      .send(body)
      .expect(200);
    expect(res.body.data).toEqual({ contestId: id, slug });
    expect(createMock).toHaveBeenCalledWith(body);
  });

  it("does not accept a client provided slug", async () => {
    await mockApp
      .post("/mini-contests")
      .set("Authorization", `Bearer ${uid}`)
      .send({ ...body, slug })
      .expect(422);
    expect(createMock).not.toHaveBeenCalled();
  });

  it.each([
    ["get", "/mini-contests"],
    ["post", "/mini-contests"],
    ["patch", `/mini-contests/${id}`],
    ["delete", `/mini-contests/${id}`],
    ["patch", `/mini-contests/${id}/leaderboard-public`],
  ] as const)("rejects non admins on %s %s", async (method, path) => {
    isAdminMock.mockResolvedValue(false);
    const req = mockApp[method](path).set("Authorization", `Bearer ${uid}`);
    if (method === "post") req.send(body);
    if (method === "patch") {
      req.send(path.endsWith("public") ? { leaderboardPublic: true } : body);
    }
    await req.expect(403);
  });

  it("does not reveal slugs publicly", async () => {
    const res = await mockApp.get("/mini-contests/public").expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain(slug);
  });

  it("requires authentication to open a link", async () => {
    await mockApp.get(`/mini-contests/link/${slug}`).expect(401);
  });

  it("opens a link for non admins", async () => {
    isAdminMock.mockResolvedValue(false);
    const res = await mockApp
      .get(`/mini-contests/link/${slug}`)
      .set("Authorization", `Bearer ${uid}`)
      .expect(200);
    expect(res.body.data.title).toBe("mini");
  });

  it("gets the best result of the linked mini-contest only", async () => {
    await mockApp
      .get(`/mini-contests/link/${slug}/result`)
      .set("Authorization", `Bearer ${uid}`)
      .expect(200);
    expect(bestMock).toHaveBeenCalledWith(uid, id);
    expect(todaysContestMock).not.toHaveBeenCalled();
  });

  it("shows public leaderboards to everyone", async () => {
    await mockApp
      .get(`/mini-contests/${id}/leaderboard`)
      .query({ page: 0, pageSize: 50 })
      .expect(200);
  });

  it("hides private leaderboards", async () => {
    requireMock.mockResolvedValue({ ...contest, leaderboardPublic: false });
    await mockApp
      .get(`/mini-contests/${id}/leaderboard`)
      .query({ page: 0, pageSize: 50 })
      .expect(403);
  });

  describe("submit result", () => {
    const upsertMock = vi.spyOn(ContestResultDal, "upsertBestContestResult");
    const mockStoredContest = (date: number): void => {
      vi.spyOn(Db, "collection").mockReturnValue({
        createIndex: async () => "slug_1",
        findOne: async () => ({ ...contest, date }),
      } as never);
    };
    const best = { wpm: 80, rawWpm: 99, acc: 86, consistency: 23.5 };

    beforeEach(() => {
      vi.spyOn(UserDal, "getUser").mockResolvedValue({
        uid,
        name: "bob",
      } as Awaited<ReturnType<typeof UserDal.getUser>>);
      vi.spyOn(LogsDal, "addLog").mockResolvedValue();
      vi.spyOn(
        ContestResultDal,
        "getLastContestResultTimestamp",
      ).mockResolvedValue(undefined);
      upsertMock.mockResolvedValue({
        insertedId: new ObjectId(),
        improved: true,
        best,
      });
    });

    it("saves against the linked mini-contest without a contest today", async () => {
      mockStoredContest(today);
      const res = await mockApp
        .post(`/mini-contests/link/${slug}/result`)
        .set("Authorization", `Bearer ${uid}`)
        .send({ result })
        .expect(200);
      expect(res.body.data.best).toEqual(best);
      expect(upsertMock).toHaveBeenCalledWith(uid, id, expect.anything());
      expect(todaysContestMock).not.toHaveBeenCalled();
    });

    it.each([-86_400_000, 86_400_000])(
      "rejects when not active today (offset %s)",
      async (offset) => {
        mockStoredContest(today + offset);
        const res = await mockApp
          .post(`/mini-contests/link/${slug}/result`)
          .set("Authorization", `Bearer ${uid}`)
          .send({ result })
          .expect(403);
        expect(res.body.message).toBe("This mini-contest is not active today");
        expect(upsertMock).not.toHaveBeenCalled();
      },
    );
  });
});
