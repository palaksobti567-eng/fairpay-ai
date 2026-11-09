
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
  updateProjectSchema,
} from "../validators/project.validator";
import Payment from "../models/Payment";
import { recordAudit } from "../utils/audit";
import {
  createMilestoneSchema,
  bulkCreateMilestonesSchema,
} from "../validators/milestone.validator";

const router = Router();

async function projectWithMilestones(project: mongoose.Document) {
  const milestones = await Milestone.find({ projectId: project._id }).sort({
    createdAt: 1,
  });

  return {
    ...project.toObject(),
    milestones: milestones.map((milestone) => milestone.toObject()),
  };
}

async function projectsWithMilestones(projects: mongoose.Document[]) {
  const milestones = await Milestone.find({
    projectId: { $in: projects.map((project) => project._id) },
  }).sort({ createdAt: 1 });

  const byProject = new Map<string, mongoose.Document[]>();

  for (const milestone of milestones) {
    const key = milestone.projectId.toString();
    const current = byProject.get(key) ?? [];
    current.push(milestone);
    byProject.set(key, current);
  }

  return projects.map((project) => ({
    ...project.toObject(),
    milestones: (byProject.get(project._id.toString()) ?? []).map(
      (milestone) => milestone.toObject()
    ),
  }));
}

// POST /api/projects - Create project
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

      recordAudit({
        actorId: req.user!._id,
        projectId: project._id,
        eventType: "project.created",
        eventData: { title: project.title },
      });

      return res.status(201).json({
        project: { ...project.toObject(), milestones: [] },
      });
    } catch {
      return sendError(
        res, 500, "INTERNAL_ERROR", "Could not create project"
      );
    }
  }
);

// GET /api/projects - List user's projects
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
      const serialized = await projectsWithMilestones(projects);

      return res.status(200).json({ projects: serialized });
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

      return res.status(200).json({
        project: await projectWithMilestones(project),
      });
    } catch {
      return sendError(
        res, 500, "INTERNAL_ERROR", "Could not retrieve project"
      );
    }
  }
);

// PATCH /api/projects/:id - Client updates project details
router.patch(
  "/:id",
  requireAuth,
  requireRole("client"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!mongoose.isValidObjectId(id)) {
        return sendError(res, 400, "INVALID_ID", "Invalid project ID");
      }

      const parsed = updateProjectSchema.safeParse(req.body);

      if (!parsed.success) {
        return sendError(
          res, 400, "VALIDATION_ERROR",
          "Invalid project data", parsed.error.issues
        );
      }

      const project = await Project.findOne({
        _id: id,
        clientId: req.user!._id,
      });

      if (!project) {
        return sendError(res, 404, "NOT_FOUND", "Project not found");
      }

      if (parsed.data.totalBudget !== undefined) {
        const milestones = await Milestone.find({ projectId: project._id }).select("amount");
        const allocatedCents = milestones.reduce(
          (sum, milestone) => sum + Math.round(milestone.amount * 100),
          0
        );
        if (Math.round(parsed.data.totalBudget * 100) < allocatedCents) {
          return sendError(
            res, 409, "INVALID_STATE",
            "Budget cannot be lower than the allocated milestone amounts"
          );
        }
        project.totalBudget = parsed.data.totalBudget;
      }

      if (parsed.data.title !== undefined) project.title = parsed.data.title;
      if (parsed.data.description !== undefined) project.description = parsed.data.description;

      await project.save();

      recordAudit({
        actorId: req.user!._id,
        projectId: project._id,
        eventType: "project.updated",
        eventData: { fields: Object.keys(parsed.data) },
      });

      return res.status(200).json({
        project: await projectWithMilestones(project),
      });
    } catch {
      return sendError(res, 500, "INTERNAL_ERROR", "Could not update project");
    }
  }
);

// GET /api/projects/:id/payments - Transaction history for project participants
router.get(
  "/:id/payments",
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

      const milestones = await Milestone.find({ projectId: project._id }).select("_id");
      const payments = await Payment.find({
        milestoneId: { $in: milestones.map((m) => m._id) },
      }).sort({ createdAt: -1 });

      return res.status(200).json({
        payments: payments.map((payment) => ({
          id: payment._id,
          milestoneId: payment.milestoneId,
          orderId: payment.orderId ?? null,
          captureId: payment.captureId ?? null,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          paidAt: payment.paidAt ?? null,
          createdAt: payment.createdAt,
        })),
      });
    } catch {
      return sendError(res, 500, "INTERNAL_ERROR", "Could not retrieve payments");
    }
  }
);

// POST /api/projects/:id/invite - Assign freelancer
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
        return sendError(res, 404, "NOT_FOUND", "Freelancer not found");
      }

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

      recordAudit({
        actorId: req.user!._id,
        projectId: updatedProject._id,
        eventType: "project.freelancer_invited",
        eventData: { freelancerId: freelancer._id },
      });

      return res.status(200).json({
        message: "Freelancer assigned successfully",
        project: await projectWithMilestones(updatedProject),
      });
    } catch {
      return sendError(
        res, 500, "INTERNAL_ERROR", "Could not invite freelancer"
      );
    }
  }
);

// POST /api/projects/:id/milestones - Create one milestone
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

      if (
        !Number.isFinite(project.totalBudget) ||
        project.totalBudget <= 0
      ) {
        return sendError(
          res, 409, "INVALID_STATE",
          "Project budget is not configured"
        );
      }

      const existingMilestones = await Milestone.find({
        projectId: project._id,
      }).select("amount");

      const existingTotalCents = existingMilestones.reduce(
        (sum, milestone) =>
          sum + Math.round(milestone.amount * 100),
        0
      );

      const newAmountCents = Math.round(parsed.data.amount * 100);
      const budgetCents = Math.round(project.totalBudget * 100);

      if (existingTotalCents + newAmountCents > budgetCents) {
        return sendError(
          res, 409, "INVALID_STATE",
          "Milestone amount exceeds the remaining project budget"
        );
      }

      const milestone = await Milestone.create({
        projectId: project._id,
        title: parsed.data.title,
        amount: parsed.data.amount,
        currency: project.currency,
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

// POST /api/projects/:id/milestones/bulk - Save multiple milestones
router.post(
  "/:id/milestones/bulk",
  requireAuth,
  requireRole("client"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!mongoose.isValidObjectId(id)) {
        return sendError(res, 400, "INVALID_ID", "Invalid project ID");
      }

      const parsed = bulkCreateMilestonesSchema.safeParse(req.body);

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

      if (
        !Number.isFinite(project.totalBudget) ||
        project.totalBudget <= 0
      ) {
        return sendError(
          res, 409, "INVALID_STATE",
          "Project budget is not configured"
        );
      }

      const existingMilestones = await Milestone.find({
        projectId: project._id,
      }).select("amount");

      const existingTotalCents = existingMilestones.reduce(
        (sum, milestone) =>
          sum + Math.round(milestone.amount * 100),
        0
      );

      const newTotalCents = parsed.data.milestones.reduce(
        (sum, milestone) =>
          sum + Math.round(milestone.amount * 100),
        0
      );

      const budgetCents = Math.round(project.totalBudget * 100);

      if (existingTotalCents + newTotalCents > budgetCents) {
        return sendError(
          res, 409, "INVALID_STATE",
          "Milestone amounts exceed the remaining project budget"
        );
      }

      const milestones = await Milestone.insertMany(
        parsed.data.milestones.map((milestone) => ({
          projectId: project._id,
          title: milestone.title,
          amount: milestone.amount,
          currency: project.currency,
          criteria: milestone.criteria.map((criterion) => ({
            id: new mongoose.Types.ObjectId().toString(),
            text: criterion.text,
          })),
          status: "draft",
        }))
      );

      return res.status(201).json({ milestones });
    } catch {
      return sendError(
        res, 500, "INTERNAL_ERROR", "Could not save milestones"
      );
    }
  }
);

export default router;
