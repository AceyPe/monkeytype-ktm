import { contestsContract } from "@monkeytype/contracts/contests";
import { initServer } from "@ts-rest/express";
import * as ContestController from "../controllers/contest";
import { callController } from "../ts-rest-adapter";

const s = initServer();
export default s.router(contestsContract, {
  get: {
    handler: async (r) => callController(ContestController.getContests)(r),
  },
  create: {
    handler: async (r) => callController(ContestController.createContest)(r),
  },
  update: {
    handler: async (r) => callController(ContestController.updateContest)(r),
  },
  delete: {
    handler: async (r) => callController(ContestController.deleteContest)(r),
  },
});
