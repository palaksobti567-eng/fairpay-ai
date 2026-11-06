
import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import Project from "../models/Project";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { sendError } from "../utils/errors";
import {
  generateMilestones,
  AiGenerationError,
} from "../services/milestoneGenerator";

const router = Router();

const generateSchema = z.object({
  projectId: z
    .string()
    .refine((v) => mongoose.isValidObjectId(v), "Invalid project id"),

  description: z.string().trim().min(10).max(2000),
}).strict();

// POST /api/ai/generate-milestones
// Generates suggestions only. Nothing is saved.
router.post(
  "/generate-milestones",
  requireAuth,
  requireRole("client"),
  async (req: Request, res: Response) => {
    try {
      const parsed = generateSchema.safeParse(req.body);

      if (!parsed.success) {
        return sendError(
          res,
          400,
          "VALIDATION_ERROR",
          "Invalid request data",
          parsed.error.issues
        );
      }

      const { projectId, description } = parsed.data;

      // Only the project owner can generate milestones.
      const project = await Project.findOne({
        _id: projectId,
        clientId: req.user!._id,
      });

      if (!project) {
        return sendError(
          res, 404, "NOT_FOUND", "Project not found"
        );
      }

      // Budget must come from the saved project.
      if (
        !Number.isFinite(project.totalBudget) ||
        project.totalBudget <= 0
      ) {
        return sendError(
          res,
          409,
          "INVALID_STATE",
          "Project budget is not configured"
        );
      }

      const milestones = await generateMilestones({
        description,
        totalBudget: project.totalBudget,
        currency: project.currency,
      });

      return res.status(200).json({ milestones });

    } catch (err) {
      if (err instanceof AiGenerationError) {
        if (err.code === "AI_UNAVAILABLE") {
          return sendError(
            res, 502, "AI_UNAVAILABLE",
            "AI service is temporarily unavailable"
          );
        }

        return sendError(
          res, 422, "AI_INVALID_OUTPUT",
          "AI service returned an invalid milestone response"
        );
      }

      return sendError(
        res,
        500,
        "INTERNAL_ERROR",
        "Could not generate milestones"
      );
    }
  }
);

export default router;
