import { analyticsContract } from "@monkeytype/contracts/analytics";
import { initServer } from "@ts-rest/express";
import * as AnalyticsController from "../controllers/analytics";
import { callController } from "../ts-rest-adapter";

const s = initServer();
export default s.router(analyticsContract, {
  get: {
    handler: async (r) => callController(AnalyticsController.getAnalytics)(r),
  },
  realtime: {
    handler: async (r) =>
      callController(AnalyticsController.getRealtimeUsers)(r),
  },
});
