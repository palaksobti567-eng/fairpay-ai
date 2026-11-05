import Milestone from "../models/Milestone";
import { createMilestoneSchema } from "../validators/milestone.validator";
import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import Project from "../models/Project";
import User from "../models/User";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import {
  createProjectSchema,
  inviteFreelancerSchema,
} from "../validators/project.validator";

const router = Router();

function sendError(
  res: Response,
  status: number,
  code: string,
  message: string
) {
  return res.status(status).json({
    error: {
      code,
      message,
      details: [],
    },
  });
}

// POST /api/projects - Create project (clients only)
router.post(
  "/",
  requireAuth,
  requireRole("client"),
  async (req: Request, res: Response) => {
    try {
      const parsed = createProjectSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid project data",
            details: parsed.error.issues,
          },
        });
      }

      const project = await Project.create({
        ...parsed.data,
        currency: parsed.data.currency.toUpperCase(),
        clientId: req.user!._id,
      });

      return res.status(201).json({ project });
    } catch {
      return sendError(
        res,
        500,
        "INTERNAL_SERVER_ERROR",
        "Could not create project"
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

      const projects = await Project.find({
        $or: [{ clientId: userId }, { freelancerId: userId }],
      }).sort({ createdAt: -1 });

      return res.status(200).json({ projects });
    } catch {
      return sendError(
        res,
        500,
        "INTERNAL_SERVER_ERROR",
        "Could not retrieve projects"
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
        return sendError(res, 404, "PROJECT_NOT_FOUND", "Project not found");
      }

      const userId = req.user!._id.toString();

      const isParticipant =
        project.clientId.toString() === userId ||
        project.freelancerId?.toString() === userId;

      if (!isParticipant) {
        return sendError(res, 404, "PROJECT_NOT_FOUND", "Project not found");
      }

      return res.status(200).json({ project });
    } catch {
      return sendError(
        res,
        500,
        "INTERNAL_SERVER_ERROR",
        "Could not retrieve project"
      );
    }
  }
);

// POST /api/projects/:id/invite - Invite a freelancer
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
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid invitation data",
            details: parsed.error.issues,
          },
        });
      }

      const project = await Project.findById(id);

      if (!project || project.clientId.toString() !== req.user!._id.toString()) {
        return sendError(res, 404, "PROJECT_NOT_FOUND", "Project not found");
      }

      if (project.freelancerId) {
        return sendError(
          res,
          409,
          "FREELANCER_ALREADY_ASSIGNED",
          "A freelancer is already assigned to this project"
        );
      }

      const freelancer = await User.findOne({
        email: parsed.data.freelancerEmail,
        role: "freelancer",
      });

      if (!freelancer) {
        return sendError(
          res,
          404,
          "FREELANCER_NOT_FOUND",
          "No freelancer found with this email"
        );
      }

      project.freelancerId = freelancer._id;
      await project.save();

      return res.status(200).json({
        message: "Freelancer invited successfully",
        project,
      });
    } catch {
      return sendError(
        res,
        500,
        "INTERNAL_SERVER_ERROR",
        "Could not invite freelancer"
      );
    }
  }
);

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
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid milestone data",
            details: parsed.error.issues,
          },
        });
      }

      const project = await Project.findById(id);

      if (
        !project ||
        project.clientId.toString() !== req.user!._id.toString()
      ) {
        return sendError(res, 404, "PROJECT_NOT_FOUND", "Project not found");
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
        res,
        500,
        "INTERNAL_SERVER_ERROR",
        "Could not create milestone"
      );
    }
  }
);

export default router;

