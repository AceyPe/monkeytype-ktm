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
import { IdSchema } from "@monkeytype/schemas/util";

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
