import type { Response } from "express";

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details: unknown[] = []
): Response {
  return res.status(status).json({
    error: {
      code,
      message,
      details
    }
  });
}
