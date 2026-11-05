
import { z } from "zod";

export const createMilestoneSchema = z.object({
  title: z.string().trim().min(3).max(100),

  amount: z
    .number()
    .finite()
    .positive()
    .refine(
      (value) => Number.isInteger(value * 100),
      "Amount must have no more than 2 decimal places"
    ),

  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "Currency must be a 3-letter code"),

  criteria: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(1000),
      }).strict()
    )
    .min(1)
    .max(20),
}).strict();

export type CreateMilestoneInput = z.infer<
  typeof createMilestoneSchema
>;

export const updateMilestoneSchema = z.object({
  title: z.string().trim().min(3).max(100).optional(),

  amount: z
    .number()
    .finite()
    .positive()
    .refine(
      (value) => Number.isInteger(value * 100),
      "Amount must have no more than 2 decimal places"
    )
    .optional(),

  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "Currency must be a 3-letter code")
    .optional(),

  criteria: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(1000),
      }).strict()
    )
    .min(1)
    .max(20)
    .optional(),
})
.strict()
.refine(
  (data) => Object.keys(data).length > 0,
  "At least one field must be provided"
);

