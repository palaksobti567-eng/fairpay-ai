
import { z } from "zod";

export const createMilestoneSchema = z.object({
  title: z.string().trim().min(3).max(100),

  amount: z
    .number()
    .finite()
    .positive()
    .refine(
      (value) =>
        Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
      "Amount must have no more than 2 decimal places"
    ),

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

// Bulk milestone creation
export const bulkCreateMilestonesSchema = z.object({
  milestones: z
    .array(
      z.object({
        title: z.string().trim().min(3).max(100),

        amount: z
          .number()
          .finite()
          .positive()
          .refine(
            (value) =>
              Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
            "Amount must have no more than 2 decimal places"
          ),

        criteria: z
          .array(
            z.object({
              text: z.string().trim().min(1).max(1000),
            }).strict()
          )
          .min(1)
          .max(20),
      }).strict()
    )
    .min(1)
    .max(20),
}).strict();

export const updateMilestoneSchema = z.object({
  title: z.string().trim().min(3).max(100).optional(),

  amount: z
    .number()
    .finite()
    .positive()
    .refine(
      (value) =>
        Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
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

export const submitMilestoneSchema = z.object({
  description: z
    .string()
    .trim()
    .min(20, "Submission description must contain at least 20 characters")
    .max(3000, "Submission description cannot exceed 3000 characters"),

  evidenceLinks: z
    .array(
      z.string().url("Each evidence link must be a valid URL")
        .refine(
          (value) => {
            try {
              const url = new URL(value);
              return url.protocol === "http:" || url.protocol === "https:";
            } catch {
              return false;
            }
          },
          "Only HTTP and HTTPS links are allowed"
        )
    )
    .max(10, "Maximum 10 evidence links are allowed")
    .default([]),
}).strict();

export type SubmitMilestoneInput = z.infer<
  typeof submitMilestoneSchema
>;
export const rejectMilestoneSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
}).strict();
export type RejectMilestoneInput = z.infer<typeof rejectMilestoneSchema>;
