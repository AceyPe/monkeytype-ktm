import {
  GetAnalyticsQuery,
  GetAnalyticsRealtimeResponse,
  GetAnalyticsResponse,
} from "@monkeytype/contracts/analytics";
import { MonkeyResponse } from "../../utils/monkey-response";
import { MonkeyRequest } from "../types";
import * as GoogleAnalytics from "../../services/google-analytics";

export async function getAnalytics(
  req: MonkeyRequest<GetAnalyticsQuery>,
): Promise<GetAnalyticsResponse> {
  const data = await GoogleAnalytics.getAnalyticsDashboard(req.query);
  return new MonkeyResponse("Analytics retrieved", data);
}

export async function getRealtimeUsers(
  _req: MonkeyRequest,
): Promise<GetAnalyticsRealtimeResponse> {
  const users = await GoogleAnalytics.getActiveUsersRightNow();
  return new MonkeyResponse("Realtime users retrieved", { users });
}
