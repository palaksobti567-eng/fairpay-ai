
import { z } from "zod";

export const createProjectSchema = z.object({
  title: z.string().trim().min(3).max(100),

  description: z.string().trim().min(10).max(5000),

  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "Currency must be a 3-letter code"),

  totalBudget: z
    .number()
    .positive("Budget must be positive")
    .max(10000000, "Budget exceeds maximum limit")
    .refine(
      (value) => Number.isInteger(value * 100),
      "Budget can have at most 2 decimal places"
    ),
}).strict();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  title: z.string().trim().min(3).max(100).optional(),

  description: z.string().trim().min(10).max(5000).optional(),

  totalBudget: z
    .number()
    .positive("Budget must be positive")
    .max(10000000, "Budget exceeds maximum limit")
    .refine(
      (value) => Number.isInteger(value * 100),
      "Budget can have at most 2 decimal places"
    )
    .optional(),
}).strict().refine(
  (data) => Object.keys(data).length > 0,
  "At least one field must be provided"
);

export const inviteFreelancerSchema = z.object({
  freelancerEmail: z
    .string()
    .trim()
    .email("Invalid freelancer email")
    .toLowerCase(),
}).strict();
