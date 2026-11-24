import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  CommonResponses,
  meta,
  MonkeyClientError,
  MonkeyResponseSchema,
  responseWithData,
} from "./util/api";
import {
  ContestSchema,
  CreateContestRequestSchema,
  MiniContestSchema,
  MiniContestSlugSchema,
  UpdateContestRequestSchema,
} from "@monkeytype/schemas/contests";
import { AddContestResultRequestSchema } from "@monkeytype/schemas/contest-results";
import { IdSchema } from "@monkeytype/schemas/util";
import {
  AddContestResultResponseSchema,
  GetContestBestResultResponseSchema,
  GetContestLeaderboardParamsSchema,
  GetContestLeaderboardQuerySchema,
  GetContestLeaderboardResponseSchema,
  SetContestLeaderboardPublicRequestSchema,
  UpdateContestParamsSchema,
} from "./contests";

export const GetMiniContestsResponseSchema = responseWithData(
  z.array(MiniContestSchema),
);
export type GetMiniContestsResponse = z.infer<
  typeof GetMiniContestsResponseSchema
>;

/** The slug is left out, public listings must not reveal the contest link. */
export const GetPublicMiniContestsResponseSchema = responseWithData(
  z.array(ContestSchema),
);
export type GetPublicMiniContestsResponse = z.infer<
  typeof GetPublicMiniContestsResponseSchema
>;

export const CreateMiniContestResponseSchema = responseWithData(
  z.object({ contestId: IdSchema, slug: MiniContestSlugSchema }),
);
export type CreateMiniContestResponse = z.infer<
  typeof CreateMiniContestResponseSchema
>;

export const MiniContestSlugParamsSchema = z.object({
  slug: MiniContestSlugSchema,
});
export type MiniContestSlugParams = z.infer<typeof MiniContestSlugParamsSchema>;

export const GetMiniContestResponseSchema = responseWithData(MiniContestSchema);
export type GetMiniContestResponse = z.infer<
  typeof GetMiniContestResponseSchema
>;

const c = initContract();

export const miniContestsContract = c.router(
  {
    get: {
      summary: "get mini-contests",
      description: "Get all mini-contests including their links.",
      method: "GET",
      path: "",
      responses: {
        200: GetMiniContestsResponseSchema,
      },
      metadata: meta({
        rateLimit: "contestsGet",
        requirePermission: "admin",
      }),
    },
    getPublic: {
      summary: "get public mini-contests",
      description: "Get mini-contests with a public leaderboard.",
      method: "GET",
      path: "/public",
      responses: {
        200: GetPublicMiniContestsResponseSchema,
      },
      metadata: meta({
        rateLimit: "contestsGet",
        authenticationOptions: {
          isPublic: true,
        },
      }),
    },
    getBySlug: {
      summary: "get mini-contest by slug",
      description: "Get the mini-contest behind a link.",
      method: "GET",
      path: "/link/:slug",
      pathParams: MiniContestSlugParamsSchema,
      responses: {
        200: GetMiniContestResponseSchema,
        404: MonkeyClientError.describe("Mini-contest not found"),
      },
      metadata: meta({
        rateLimit: "contestResultGet",
      }),
    },
    create: {
      summary: "create mini-contest",
      description: "Create a new mini-contest with a randomly generated link.",
      method: "POST",
      path: "",
      body: CreateContestRequestSchema,
      responses: {
        200: CreateMiniContestResponseSchema,
      },
      metadata: meta({
        rateLimit: "contestsAdd",
        requirePermission: "admin",
      }),
    },
    update: {
      summary: "update mini-contest",
      description: "Update an existing mini-contest.",
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
      summary: "delete mini-contest",
      description: "Delete an existing mini-contest.",
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
    setLeaderboardPublic: {
      summary: "set mini-contest leaderboard visibility",
      description: "Make a mini-contest leaderboard public or private.",
      method: "PATCH",
      path: "/:contestId/leaderboard-public",
      pathParams: UpdateContestParamsSchema,
      body: SetContestLeaderboardPublicRequestSchema,
      responses: {
        200: MonkeyResponseSchema,
      },
      metadata: meta({
        rateLimit: "contestsEdit",
        requirePermission: "admin",
      }),
    },
    addResult: {
      summary: "submit mini-contest result",
      description:
        "Save a run for an active mini-contest. Only the user's best score is kept.",
      method: "POST",
      path: "/link/:slug/result",
      pathParams: MiniContestSlugParamsSchema,
      body: AddContestResultRequestSchema,
      responses: {
        200: AddContestResultResponseSchema,
      },
      metadata: meta({
        rateLimit: "contestResultAdd",
      }),
    },
    getBestResult: {
      summary: "get mini-contest best result",
      description: "Get the authenticated user's best result.",
      method: "GET",
      path: "/link/:slug/result",
      pathParams: MiniContestSlugParamsSchema,
      responses: {
        200: GetContestBestResultResponseSchema,
      },
      metadata: meta({
        rateLimit: "contestResultGet",
      }),
    },
    getLeaderboard: {
      summary: "get mini-contest leaderboard",
      description: "Get the leaderboard for a specific mini-contest.",
      method: "GET",
      path: "/:contestId/leaderboard",
      pathParams: GetContestLeaderboardParamsSchema,
      query: GetContestLeaderboardQuerySchema,
      responses: {
        200: GetContestLeaderboardResponseSchema,
        404: MonkeyClientError.describe("Mini-contest not found"),
      },
      metadata: meta({
        rateLimit: "contestsLeaderboardGet",
        authenticationOptions: {
          isPublic: true,
        },
      }),
    },
  },
  {
    pathPrefix: "/mini-contests",
    strictStatusCodes: true,
    metadata: meta({
      openApiTags: "contests",
    }),
    commonResponses: CommonResponses,
  },
);
