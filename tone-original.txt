
import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import Milestone from "../models/Milestone";
import Project from "../models/Project";
import { requireAuth } from "../middleware/auth.middleware";
import { sendError } from "../utils/errors";
import { updateMilestoneSchema } from "../validators/milestone.validator";

const router = Router();

// PATCH /api/milestones/:id - Update a draft milestone
router.patch(
  "/:id",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!mongoose.isValidObjectId(id)) {
        return sendError(res, 400, "INVALID_ID", "Invalid milestone ID");
      }

      const parsed = updateMilestoneSchema.safeParse(req.body);

      if (!parsed.success) {
        return sendError(
          res,
          400,
          "VALIDATION_ERROR",
          "Invalid milestone data",
          parsed.error.issues
        );
      }

      const milestone = await Milestone.findById(id);

      if (!milestone) {
        return sendError(res, 404, "NOT_FOUND", "Milestone not found");
      }

      const project = await Project.findById(milestone.projectId);

      if (!project) {
        return sendError(res, 404, "NOT_FOUND", "Milestone not found");
      }

      const userId = req.user!._id.toString();

      const isParticipant =
        project.clientId.toString() === userId ||
        project.freelancerId?.toString() === userId;

      if (!isParticipant) {
        return sendError(res, 404, "NOT_FOUND", "Milestone not found");
      }

      if (req.user!.role !== "client") {
        return sendError(
          res,
          403,
          "FORBIDDEN",
          "Only the client can edit milestones"
        );
      }

      if (project.clientId.toString() !== userId) {
        return sendError(res, 404, "NOT_FOUND", "Milestone not found");
      }

      if (milestone.status !== "draft") {
        return sendError(
          res,
          409,
          "INVALID_STATE",
          "Only draft milestones can be edited"
        );
      }

      const updates = parsed.data;

      if (updates.title !== undefined) {
        milestone.title = updates.title;
      }

      if (updates.amount !== undefined) {
        milestone.amount = updates.amount;
      }

      if (updates.currency !== undefined) {
        milestone.currency = updates.currency.toUpperCase();
      }

      if (updates.criteria !== undefined) {
        milestone.criteria = updates.criteria.map((criterion) => ({
          id: new mongoose.Types.ObjectId().toString(),
          text: criterion.text,
        })) as typeof milestone.criteria;
      }

      await milestone.save();

      return res.status(200).json({ milestone });
    } catch {
      return sendError(
        res,
        500,
        "INTERNAL_ERROR",
        "Could not update milestone"
      );
    }
  }
);

// POST /api/milestones/:id/approve-criteria
router.post(
  "/:id/approve-criteria",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!mongoose.isValidObjectId(id)) {
        return sendError(res, 400, "INVALID_ID", "Invalid milestone ID");
      }

      const milestone = await Milestone.findById(id);

      if (!milestone) {
        return sendError(res, 404, "NOT_FOUND", "Milestone not found");
      }

      const project = await Project.findById(milestone.projectId);

      if (!project) {
        return sendError(res, 404, "NOT_FOUND", "Milestone not found");
      }

      const userId = req.user!._id.toString();

      const isParticipant =
        project.clientId.toString() === userId ||
        project.freelancerId?.toString() === userId;

      if (!isParticipant) {
        return sendError(res, 404, "NOT_FOUND", "Milestone not found");
      }

      if (req.user!.role !== "freelancer") {
        return sendError(
          res,
          403,
          "FORBIDDEN",
          "Only the assigned freelancer can approve criteria"
        );
      }

      if (project.freelancerId?.toString() !== userId) {
        return sendError(res, 404, "NOT_FOUND", "Milestone not found");
      }

      if (milestone.status !== "draft") {
        return sendError(
          res,
          409,
          "INVALID_STATE",
          "Only draft milestones can have criteria approved"
        );
      }

      milestone.status = "criteria_approved";
      await milestone.save();

      return res.status(200).json({
        message: "Milestone criteria approved successfully",
        milestone,
      });
    } catch {
      return sendError(
        res,
        500,
        "INTERNAL_ERROR",
        "Could not approve milestone criteria"
      );
    }
  }
);

// GET /api/milestones/:id - Get milestone details
router.get(
  "/:id",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!mongoose.isValidObjectId(id)) {
        return sendError(res, 400, "INVALID_ID", "Invalid milestone ID");
      }

      const milestone = await Milestone.findById(id);

      if (!milestone) {
        return sendError(res, 404, "NOT_FOUND", "Milestone not found");
      }

      const project = await Project.findById(milestone.projectId);

      if (!project) {
        return sendError(res, 404, "NOT_FOUND", "Milestone not found");
      }

      const userId = req.user!._id.toString();

      const isParticipant =
        project.clientId.toString() === userId ||
        project.freelancerId?.toString() === userId;

      if (!isParticipant) {
        return sendError(res, 404, "NOT_FOUND", "Milestone not found");
      }

      return res.status(200).json({ milestone });
    } catch {
      return sendError(
        res,
        500,
        "INTERNAL_ERROR",
        "Could not retrieve milestone"
      );
    }
  }
);

export default router;
