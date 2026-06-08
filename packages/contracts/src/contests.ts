import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  CommonResponses,
  meta,
  MonkeyResponseSchema,
  responseWithData,
} from "./util/api";
import {
  ContestSchema,
  CreateContestRequestSchema,
  UpdateContestRequestSchema,
} from "@monkeytype/schemas/contests";
import {
  AddContestResultRequestSchema,
  AddContestResultResponseDataSchema,
  GetContestBestResultResponseDataSchema,
} from "@monkeytype/schemas/contest-results";
import { IdSchema } from "@monkeytype/schemas/util";
import { LeaderboardEntrySchema } from "@monkeytype/schemas/leaderboards";
import {
  PaginationQuerySchema,
  RankFilterQuerySchema,
  RankScopeQuerySchema,
  RankSortQuerySchema,
} from "./leaderboards";

export const GetContestsResponseSchema = responseWithData(
  z.array(ContestSchema),
);
export type GetContestsResponse = z.infer<typeof GetContestsResponseSchema>;

export const CreateContestResponseSchema = responseWithData(
  z.object({ contestId: IdSchema }),
);
export type CreateContestResponse = z.infer<typeof CreateContestResponseSchema>;

export const UpdateContestParamsSchema = z.object({
  contestId: IdSchema,
});
export type UpdateContestParams = z.infer<typeof UpdateContestParamsSchema>;

export type AddContestResultRequest = z.infer<
  typeof AddContestResultRequestSchema
>;

export const AddContestResultResponseSchema = responseWithData(
  AddContestResultResponseDataSchema,
);
export type AddContestResultResponse = z.infer<
  typeof AddContestResultResponseSchema
>;

export const GetContestBestResultResponseSchema = responseWithData(
  GetContestBestResultResponseDataSchema,
);
export type GetContestBestResultResponse = z.infer<
  typeof GetContestBestResultResponseSchema
>;

export const GetContestLeaderboardParamsSchema = z.object({
  contestId: IdSchema,
});
export type GetContestLeaderboardParams = z.infer<
  typeof GetContestLeaderboardParamsSchema
>;

export const GetContestLeaderboardQuerySchema = PaginationQuerySchema.merge(
  RankScopeQuerySchema,
)
  .merge(RankFilterQuerySchema)
  .merge(RankSortQuerySchema);
export type GetContestLeaderboardQuery = z.infer<
  typeof GetContestLeaderboardQuerySchema
>;

export const GetContestLeaderboardResponseSchema = responseWithData(
  z.object({
    count: z.number().int().nonnegative(),
    pageSize: z.number().int().positive(),
    entries: z.array(LeaderboardEntrySchema),
  }),
);
export type GetContestLeaderboardResponse = z.infer<
  typeof GetContestLeaderboardResponseSchema
>;

const c = initContract();

export const contestsContract = c.router(
  {
    get: {
      summary: "get contests",
      description: "Get all contests.",
      method: "GET",
      path: "",
      responses: {
        200: GetContestsResponseSchema,
      },
      metadata: meta({
        rateLimit: "contestsGet",
        authenticationOptions: {
          isPublic: true,
        },
      }),
    },
    create: {
      summary: "create contest",
      description: "Create a new contest.",
      method: "POST",
      path: "",
      body: CreateContestRequestSchema,
      responses: {
        200: CreateContestResponseSchema,
      },
      metadata: meta({
        rateLimit: "contestsAdd",
        requirePermission: "admin",
      }),
    },
    update: {
      summary: "update contest",
      description: "Update an existing contest.",
      method: "PATCH",
      path: "/:contestId",
      pathParams: UpdateContestParamsSchema,
      body: UpdateContestRequestSchema,
      responses: {
        200: MonkeyResponseSchema,
      },
      metadata: meta({
        rateLimit: "contestsEdit",
        requirePermission: "admin",
      }),
    },
    delete: {
      summary: "delete contest",
      description: "Delete an existing contest.",
      method: "DELETE",
      path: "/:contestId",
      pathParams: UpdateContestParamsSchema,
      body: c.noBody(),
      responses: {
        200: MonkeyResponseSchema,
      },
      metadata: meta({
        rateLimit: "contestsRemove",
        requirePermission: "admin",
      }),
    },
    addTodayResult: {
      summary: "submit today's contest result",
      description:
        "Save a contest run for today's active contest. Only the user's best score is kept.",
      method: "POST",
      path: "/today/result",
      body: AddContestResultRequestSchema,
      responses: {
        200: AddContestResultResponseSchema,
      },
      metadata: meta({
        rateLimit: "contestResultAdd",
      }),
    },
    getTodayBestResult: {
      summary: "get today's contest best result",
      description:
        "Get the authenticated user's best result for today's active contest.",
      method: "GET",
      path: "/today/result",
      responses: {
        200: GetContestBestResultResponseSchema,
      },
      metadata: meta({
        rateLimit: "contestResultGet",
      }),
    },
    getLeaderboard: {
      summary: "get contest leaderboard",
      description:
        "Get the leaderboard for a specific contest from contest-results.",
      method: "GET",
      path: "/:contestId/leaderboard",
      pathParams: GetContestLeaderboardParamsSchema,
      query: GetContestLeaderboardQuerySchema,
      responses: {
        200: GetContestLeaderboardResponseSchema,
      },
      metadata: meta({
        rateLimit: "contestsLeaderboardGet",
        requirePermission: "admin",
      }),
    },
  },
  {
    pathPrefix: "/contests",
    strictStatusCodes: true,
    metadata: meta({
      openApiTags: "contests",
    }),
    commonResponses: CommonResponses,
  },
);
