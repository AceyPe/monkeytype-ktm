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
  })
  .strict();
export type Contest = z.infer<typeof ContestSchema>;

export const CreateContestRequestSchema = ContestSchema.omit({
  _id: true,
  createdAt: true,
}).strict();
export type CreateContestRequest = z.infer<typeof CreateContestRequestSchema>;
