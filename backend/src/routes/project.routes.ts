
import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import Project from "../models/Project";
import User from "../models/User";
import Milestone from "../models/Milestone";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { sendError } from "../utils/errors";
import {
  createProjectSchema,
  inviteFreelancerSchema,
} from "../validators/project.validator";
import { createMilestoneSchema } from "../validators/milestone.validator";

const router = Router();

// POST /api/projects - Create project (clients only)
router.post(
  "/",
  requireAuth,
  requireRole("client"),
  async (req: Request, res: Response) => {
    try {
      const parsed = createProjectSchema.safeParse(req.body);

      if (!parsed.success) {
        return sendError(
          res, 400, "VALIDATION_ERROR",
          "Invalid project data", parsed.error.issues
        );
      }

      const project = await Project.create({
        ...parsed.data,
        currency: parsed.data.currency.toUpperCase(),
        clientId: req.user!._id,
      });

      return res.status(201).json({ project });
    } catch {
      return sendError(
        res, 500, "INTERNAL_ERROR", "Could not create project"
      );
    }
  }
);

// GET /api/projects - List projects belonging to the user
router.get(
  "/",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!._id;

      const filter =
        req.user!.role === "client"
          ? { clientId: userId }
          : { freelancerId: userId };

      const projects = await Project.find(filter).sort({ createdAt: -1 });

      return res.status(200).json({ projects });
    } catch {
      return sendError(
        res, 500, "INTERNAL_ERROR", "Could not retrieve projects"
      );
    }
  }
);

// GET /api/projects/:id - Get project details
router.get(
  "/:id",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!mongoose.isValidObjectId(id)) {
        return sendError(res, 400, "INVALID_ID", "Invalid project ID");
      }

      const project = await Project.findById(id);

      if (!project) {
        return sendError(res, 404, "NOT_FOUND", "Project not found");
      }

      const userId = req.user!._id.toString();

      const isParticipant =
        project.clientId.toString() === userId ||
        project.freelancerId?.toString() === userId;

      if (!isParticipant) {
        return sendError(res, 404, "NOT_FOUND", "Project not found");
      }

      return res.status(200).json({ project });
    } catch {
      return sendError(
        res, 500, "INTERNAL_ERROR", "Could not retrieve project"
      );
    }
  }
);

// POST /api/projects/:id/invite - Assign a freelancer
router.post(
  "/:id/invite",
  requireAuth,
  requireRole("client"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!mongoose.isValidObjectId(id)) {
        return sendError(res, 400, "INVALID_ID", "Invalid project ID");
      }

      const parsed = inviteFreelancerSchema.safeParse(req.body);

      if (!parsed.success) {
        return sendError(
          res, 400, "VALIDATION_ERROR",
          "Invalid invitation data", parsed.error.issues
        );
      }

      const project = await Project.findOne({
        _id: id,
        clientId: req.user!._id,
      });

      if (!project) {
        return sendError(res, 404, "NOT_FOUND", "Project not found");
      }

      const freelancer = await User.findOne({
        email: parsed.data.freelancerEmail,
        role: "freelancer",
      });

      if (!freelancer) {
        return sendError(
          res, 404, "NOT_FOUND", "Freelancer not found"
        );
      }

      // Assign only if no freelancer has already been assigned.
      const updatedProject = await Project.findOneAndUpdate(
        {
          _id: id,
          clientId: req.user!._id,
          freelancerId: null,
        },
        {
          $set: { freelancerId: freelancer._id },
        },
        { new: true, runValidators: true }
      );

      if (!updatedProject) {
        return sendError(
          res, 409, "INVALID_STATE",
          "A freelancer is already assigned to this project"
        );
      }

      return res.status(200).json({
        message: "Freelancer assigned successfully",
        project: updatedProject,
      });
    } catch {
      return sendError(
        res, 500, "INTERNAL_ERROR", "Could not invite freelancer"
      );
    }
  }
);

// POST /api/projects/:id/milestones - Create milestone
router.post(
  "/:id/milestones",
  requireAuth,
  requireRole("client"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!mongoose.isValidObjectId(id)) {
        return sendError(res, 400, "INVALID_ID", "Invalid project ID");
      }

      const parsed = createMilestoneSchema.safeParse(req.body);

      if (!parsed.success) {
        return sendError(
          res, 400, "VALIDATION_ERROR",
          "Invalid milestone data", parsed.error.issues
        );
      }

      const project = await Project.findOne({
        _id: id,
        clientId: req.user!._id,
      });

      if (!project) {
        return sendError(res, 404, "NOT_FOUND", "Project not found");
      }

      const milestone = await Milestone.create({
        projectId: project._id,
        title: parsed.data.title,
        amount: parsed.data.amount,
        currency: parsed.data.currency.toUpperCase(),
        criteria: parsed.data.criteria.map((criterion) => ({
          id: new mongoose.Types.ObjectId().toString(),
          text: criterion.text,
        })),
        status: "draft",
      });

      return res.status(201).json({ milestone });
    } catch {
      return sendError(
        res, 500, "INTERNAL_ERROR", "Could not create milestone"
      );
    }
  }
);

export default router;
