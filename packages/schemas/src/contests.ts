import { z } from "zod";
import { IdSchema } from "./util";

export const ContestPrizeSchema = z
  .object({
    fromPosition: z.number().int().positive(),
    toPosition: z.number().int().positive().optional(),
    reward: z.string().min(1),
  })
  .strict()
  .superRefine((prize, ctx) => {
    if (
      prize.toPosition !== undefined &&
      prize.toPosition < prize.fromPosition
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "To position must be greater than or equal to from position",
        path: ["toPosition"],
      });
    }
  });
export type ContestPrize = z.infer<typeof ContestPrizeSchema>;

export const ContestSchema = z
  .object({
    _id: IdSchema,
    title: z.string().min(1),
    date: z.number().int().nonnegative(),
    prizes: z.array(ContestPrizeSchema).min(1),
    createdAt: z.number().int().nonnegative(),
    leaderboardPublic: z.boolean(),
  })
  .strict();
export type Contest = z.infer<typeof ContestSchema>;

export const CreateContestRequestSchema = ContestSchema.omit({
  _id: true,
  createdAt: true,
  leaderboardPublic: true,
}).strict();
export type CreateContestRequest = z.infer<typeof CreateContestRequestSchema>;

export const UpdateContestRequestSchema = CreateContestRequestSchema;
export type UpdateContestRequest = z.infer<typeof UpdateContestRequestSchema>;

export const MINI_CONTEST_SLUG_LENGTH = 26;
export const MiniContestSlugSchema = z
  .string()
  .length(MINI_CONTEST_SLUG_LENGTH)
  .regex(/^[a-z0-9]+$/);
export type MiniContestSlug = z.infer<typeof MiniContestSlugSchema>;

/** Only reachable through its slug, never listed next to regular contests. */
export const MiniContestSchema = ContestSchema.extend({
  slug: MiniContestSlugSchema,
}).strict();
export type MiniContest = z.infer<typeof MiniContestSchema>;
