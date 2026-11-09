
import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import Project from "../models/Project";
import Milestone from "../models/Milestone";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { sendError } from "../utils/errors";
import {
  generateMilestones,
  generateRevisionSuggestions,
  AiGenerationError,
} from "../services/milestoneGenerator";
import Submission from "../models/Submission";
import VerificationReport from "../models/VerificationReport";

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

      const existingMilestones = await Milestone.find({
        projectId: project._id,
      }).select("amount");

      const allocatedCents = existingMilestones.reduce(
        (sum, milestone) => sum + Math.round(milestone.amount * 100),
        0
      );
      const remainingCents =
        Math.round(project.totalBudget * 100) - allocatedCents;

      if (remainingCents <= 0) {
        return sendError(
          res,
          409,
          "INVALID_STATE",
          "The project budget is already fully allocated"
        );
      }

      const milestones = await generateMilestones({
        description,
        totalBudget: remainingCents / 100,
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

const revisionSchema = z.object({
  milestoneId: z
    .string()
    .refine((v) => mongoose.isValidObjectId(v), "Invalid milestone id"),
}).strict();

// POST /api/ai/revision-suggestions
// AI module C: actionable revision guidance for unmet criteria.
router.post(
  "/revision-suggestions",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const parsed = revisionSchema.safeParse(req.body);

      if (!parsed.success) {
        return sendError(
          res, 400, "VALIDATION_ERROR",
          "Invalid request data", parsed.error.issues
        );
      }

      const milestone = await Milestone.findById(parsed.data.milestoneId);
      if (!milestone) {
        return sendError(res, 404, "NOT_FOUND", "Milestone not found");
      }

      const project = await Project.findById(milestone.projectId);
      if (!project) {
        return sendError(res, 404, "NOT_FOUND", "Project not found");
      }

      const userId = req.user!._id.toString();
      const isParticipant =
        project.clientId.toString() === userId ||
        project.freelancerId?.toString() === userId;
      if (!isParticipant) {
        return sendError(res, 404, "NOT_FOUND", "Milestone not found");
      }

      const submission = await Submission.findOne({
        milestoneId: milestone._id,
      }).sort({ createdAt: -1 });
      if (!submission) {
        return sendError(res, 404, "NOT_FOUND", "No submission yet");
      }

      const report = await VerificationReport.findOne({
        submissionId: submission._id,
        status: "completed",
      });
      if (!report) {
        return sendError(
          res, 409, "NO_REPORT",
          "A completed verification report is required first"
        );
      }

      const suggestions = await generateRevisionSuggestions({
        criteria: milestone.criteria.map((c) => ({ id: c.id, text: c.text })),
        results: report.criteriaResults.map((r) => ({
          criterionId: r.criterionId,
          status: r.status,
          reason: r.reason,
        })),
      });

      return res.status(200).json({ suggestions });
    } catch (err) {
      if (err instanceof AiGenerationError) {
        return sendError(res, 502, err.code, err.message);
      }
      return sendError(
        res, 500, "INTERNAL_ERROR", "Could not generate revision suggestions"
      );
    }
  }
);

export default router;
