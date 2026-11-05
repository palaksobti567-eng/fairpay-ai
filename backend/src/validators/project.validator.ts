
import { z } from "zod";

export const createProjectSchema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(5000),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "Currency must be a 3-letter code"),
}).strict();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export const inviteFreelancerSchema = z.object({
  freelancerEmail: z.string()
    .trim()
    .email("Invalid freelancer email")
    .toLowerCase(),
}).strict();