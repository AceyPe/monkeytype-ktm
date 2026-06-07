import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  CommonResponses,
  meta,
  // MonkeyResponseSchema,
  responseWithData,
} from "./util/api";
import {
  ContestSchema,
  CreateContestRequestSchema,
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
