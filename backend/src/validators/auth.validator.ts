
import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Password must contain at least 8 characters")
  .refine(
    (password) => Buffer.byteLength(password, "utf8") <= 72,
    "Password must not exceed 72 bytes"
  );

export const registerSchema = z.object({
  name: z.string()
    .trim()
    .min(2, "Name must contain at least 2 characters")
    .max(50),

  email: z.string()
    .trim()
    .email("Invalid email address")
    .toLowerCase(),

  password: passwordSchema,
}).strict();

export const loginSchema = z.object({
  email: z.string()
    .trim()
    .email("Invalid email address")
    .toLowerCase(),

  password: passwordSchema,
}).strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

