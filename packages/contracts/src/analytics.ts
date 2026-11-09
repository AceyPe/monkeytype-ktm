import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { CommonResponses, meta, responseWithData } from "./util/api";

export const AnalyticsRangeSchema = z.enum([
  "7daysAgo",
  "28daysAgo",
  "90daysAgo",
]);
export type AnalyticsRange = z.infer<typeof AnalyticsRangeSchema>;

const AnalyticsLimitSchema = z.number().int().min(1).max(50).default(10);

export const GetAnalyticsQuerySchema = z
  .object({
    range: AnalyticsRangeSchema.default("28daysAgo"),
    limitCountries: AnalyticsLimitSchema,
    limitPages: AnalyticsLimitSchema,
    limitLandings: AnalyticsLimitSchema,
    limitReferrers: AnalyticsLimitSchema,
  })
  .strict();
export type GetAnalyticsQuery = z.infer<typeof GetAnalyticsQuerySchema>;

const UsersByDevicePointSchema = z.object({
  date: z.string(),
  desktop: z.number(),
  mobile: z.number(),
});

const TrafficSourceSchema = z.object({
  channel: z.string(),
  users: z.number(),
});

const NewVsReturningSchema = z.object({
  userType: z.string(),
  users: z.number(),
});

const TopPageSchema = z.object({
  path: z.string(),
  title: z.string(),
  views: z.number(),
});

const LandingPageSchema = z.object({
  path: z.string(),
  sessions: z.number(),
});

const ReferrerSchema = z.object({
  referrer: z.string(),
  sessions: z.number(),
});

const CountrySchema = z.object({
  country: z.string(),
  users: z.number(),
});

export const AnalyticsDashboardSchema = z.object({
  totalUsers: z.number(),
  totalPageViews: z.number(),
  engagementRate: z.number(),
  averageSessionDuration: z.number(),
  realtimeUsers: z.number(),
  usersByDevice: z.array(UsersByDevicePointSchema),
  trafficSources: z.array(TrafficSourceSchema),
  newVsReturning: z.array(NewVsReturningSchema),
  topPages: z.array(TopPageSchema),
  topLandingPages: z.array(LandingPageSchema),
  topReferrers: z.array(ReferrerSchema),
  topCountries: z.array(CountrySchema),
});
export type AnalyticsDashboardData = z.infer<typeof AnalyticsDashboardSchema>;

export const GetAnalyticsResponseSchema = responseWithData(
  AnalyticsDashboardSchema,
);
export type GetAnalyticsResponse = z.infer<typeof GetAnalyticsResponseSchema>;

export const GetAnalyticsRealtimeResponseSchema = responseWithData(
  z.object({
    users: z.number(),
  }),
);
export type GetAnalyticsRealtimeResponse = z.infer<
  typeof GetAnalyticsRealtimeResponseSchema
>;

const analyticsMetadata = meta({
  openApiTags: "analytics",
  rateLimit: "analyticsGet",
  requirePermission: "admin",
});

const c = initContract();

export const analyticsContract = c.router(
  {
    get: {
      summary: "get google analytics dashboard",
      description:
        "Get Google Analytics overview metrics for the admin dashboard.",
      method: "GET",
      path: "",
      query: GetAnalyticsQuerySchema,
      responses: {
        200: GetAnalyticsResponseSchema,
      },
      metadata: analyticsMetadata,
    },
    realtime: {
      summary: "get realtime analytics users",
      description: "Get the number of users active on the site right now.",
      method: "GET",
      path: "/realtime",
      responses: {
        200: GetAnalyticsRealtimeResponseSchema,
      },
      metadata: analyticsMetadata,
    },
  },
  {
    pathPrefix: "/analytics",
    strictStatusCodes: true,
    metadata: analyticsMetadata,
    commonResponses: CommonResponses,
  },
);
