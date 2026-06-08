import { z } from "zod";
import { CompletedEventSchema } from "./results";
import { IdSchema, PercentageSchema, WpmSchema } from "./util";

export const ContestResultSummarySchema = z
  .object({
    wpm: WpmSchema,
    rawWpm: WpmSchema,
    acc: PercentageSchema,
    consistency: PercentageSchema,
  })
  .strict();
export type ContestResultSummary = z.infer<typeof ContestResultSummarySchema>;

export const AddContestResultRequestSchema = z
  .object({
    result: CompletedEventSchema,
  })
  .strict();
export type AddContestResultRequest = z.infer<
  typeof AddContestResultRequestSchema
>;

export const AddContestResultResponseDataSchema = z
  .object({
    insertedId: IdSchema,
    improved: z.boolean(),
    best: ContestResultSummarySchema,
  })
  .strict();
export type AddContestResultResponseData = z.infer<
  typeof AddContestResultResponseDataSchema
>;

export const GetContestBestResultResponseDataSchema =
  ContestResultSummarySchema.nullable();
export type GetContestBestResultResponseData = z.infer<
  typeof GetContestBestResultResponseDataSchema
>;
