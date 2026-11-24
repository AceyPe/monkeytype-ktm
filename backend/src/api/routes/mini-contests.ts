import { miniContestsContract } from "@monkeytype/contracts/mini-contests";
import { initServer } from "@ts-rest/express";
import * as MiniContestController from "../controllers/mini-contest";
import { callController } from "../ts-rest-adapter";

const s = initServer();
export default s.router(miniContestsContract, {
  get: {
    handler: async (r) =>
      callController(MiniContestController.getMiniContests)(r),
  },
  getPublic: {
    handler: async (r) =>
      callController(MiniContestController.getPublicMiniContests)(r),
  },
  getBySlug: {
    handler: async (r) =>
      callController(MiniContestController.getMiniContestBySlug)(r),
  },
  create: {
    handler: async (r) =>
      callController(MiniContestController.createMiniContest)(r),
  },
  update: {
    handler: async (r) =>
      callController(MiniContestController.updateMiniContest)(r),
  },
  delete: {
    handler: async (r) =>
      callController(MiniContestController.deleteMiniContest)(r),
  },
  setLeaderboardPublic: {
    handler: async (r) =>
      callController(MiniContestController.setMiniContestLeaderboardPublic)(r),
  },
  addResult: {
    handler: async (r) =>
      callController(MiniContestController.addMiniContestResult)(r),
  },
  getBestResult: {
    handler: async (r) =>
      callController(MiniContestController.getMiniContestBestResult)(r),
  },
  getLeaderboard: {
    handler: async (r) =>
      callController(MiniContestController.getMiniContestLeaderboard)(r),
  },
});
