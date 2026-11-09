
import { z } from "zod";

export const createSubmissionSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "Submission description is required")
    .max(3000, "Description cannot exceed 3000 characters"),

  previewUrl: z
    .string()
    .trim()
    .max(2000, "Preview URL cannot exceed 2000 characters")
    .url("Invalid preview URL")
    .refine(
      (value) => {
        try {
          return new URL(value).protocol === "https:";
        } catch {
          return false;
        }
      },
      "Preview URL must use HTTPS"
    )
    .optional(),

  screenshots: z
    .array(z.string().trim().min(1).max(2000))
    .max(10, "Maximum 10 screenshots are allowed")
    .optional(),
});
