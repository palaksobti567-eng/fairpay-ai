
import { Router } from "express";
import mongoose from "mongoose";

import Milestone from "../models/Milestone";
import Project from "../models/Project";
import { requireAuth } from "../middleware/auth.middleware";
import { sendError } from "../utils/errors";

import {
  updateMilestoneSchema,
  submitMilestoneSchema,
} from "../validators/milestone.validator";

const router = Router();

router.use(requireAuth);

// Helper: validate MongoDB ID
function isValidId(id: string): boolean {
  return mongoose.isValidObjectId(id);
}

// PATCH /api/milestones/:id
// Client updates a draft milestone
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
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
      return sendError(res, 404, "PROJECT_NOT_FOUND", "Project not found");
    }

    if (project.clientId.toString() !== req.user._id.toString()) {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "Only the project owner can update this milestone"
      );
    }

    if (milestone.status !== "draft") {
      return sendError(
        res,
        409,
        "INVALID_STATUS",
        "Only draft milestones can be updated"
      );
    }

    Object.assign(milestone, parsed.data);

    // Project currency is authoritative.
    milestone.currency = project.currency;

    await milestone.save();

    return res.status(200).json({ milestone });
  } catch (error) {
    console.error("Update milestone error:", error);
    return sendError(res, 500, "SERVER_ERROR", "Unable to update milestone");
  }
});

// POST /api/milestones/:id/approve-criteria
// Assigned freelancer approves the milestone criteria
router.post("/:id/approve-criteria", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return sendError(res, 400, "INVALID_ID", "Invalid milestone ID");
    }

    const milestone = await Milestone.findById(id);

    if (!milestone) {
      return sendError(res, 404, "NOT_FOUND", "Milestone not found");
    }

    const project = await Project.findById(milestone.projectId);

    if (!project) {
      return sendError(res, 404, "PROJECT_NOT_FOUND", "Project not found");
    }

    if (
      !project.freelancerId ||
      project.freelancerId.toString() !== req.user._id.toString()
    ) {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "Only the assigned freelancer can approve criteria"
      );
    }

    const updated = await Milestone.findOneAndUpdate(
      { _id: id, status: "draft" },
      { $set: { status: "criteria_approved" } },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return sendError(
        res,
        409,
        "INVALID_STATUS",
        "Milestone criteria can only be approved while the milestone is in draft"
      );
    }

    return res.status(200).json({ milestone: updated });
  } catch (error) {
    console.error("Approve criteria error:", error);
    return sendError(res, 500, "SERVER_ERROR", "Unable to approve criteria");
  }
});

// POST /api/milestones/:id/start
// Assigned freelancer starts the milestone
router.post("/:id/start", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return sendError(res, 400, "INVALID_ID", "Invalid milestone ID");
    }

    const milestone = await Milestone.findById(id);

    if (!milestone) {
      return sendError(res, 404, "NOT_FOUND", "Milestone not found");
    }

    const project = await Project.findById(milestone.projectId);

    if (!project) {
      return sendError(res, 404, "PROJECT_NOT_FOUND", "Project not found");
    }

    if (
      !project.freelancerId ||
      project.freelancerId.toString() !== req.user._id.toString()
    ) {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "Only the assigned freelancer can start this milestone"
      );
    }

    const updated = await Milestone.findOneAndUpdate(
      { _id: id, status: "criteria_approved" },
      { $set: { status: "in_progress" } },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return sendError(
        res,
        409,
        "INVALID_STATUS",
        "Milestone must have approved criteria before work can start"
      );
    }

    return res.status(200).json({ milestone: updated });
  } catch (error) {
    console.error("Start milestone error:", error);
    return sendError(res, 500, "SERVER_ERROR", "Unable to start milestone");
  }
});

// POST /api/milestones/:id/submit
// Assigned freelancer submits completed work
router.post("/:id/submit", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return sendError(res, 400, "INVALID_ID", "Invalid milestone ID");
    }

    const parsed = submitMilestoneSchema.safeParse(req.body);

    if (!parsed.success) {
      return sendError(
        res,
        400,
        "VALIDATION_ERROR",
        "Invalid submission data",
        parsed.error.issues
      );
    }

    const milestone = await Milestone.findById(id);

    if (!milestone) {
      return sendError(res, 404, "NOT_FOUND", "Milestone not found");
    }

    const project = await Project.findById(milestone.projectId);

    if (!project) {
      return sendError(res, 404, "PROJECT_NOT_FOUND", "Project not found");
    }

    if (
      !project.freelancerId ||
      project.freelancerId.toString() !== req.user._id.toString()
    ) {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "Only the assigned freelancer can submit this milestone"
      );
    }

    const updated = await Milestone.findOneAndUpdate(
      { _id: id, status: "in_progress" },
      {
        $set: {
          status: "submitted",
          submissionDescription: parsed.data.description,
          evidenceLinks: parsed.data.evidenceLinks,
        },
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return sendError(
        res,
        409,
        "INVALID_STATUS",
        "Only milestones in progress can be submitted"
      );
    }

    return res.status(200).json({ milestone: updated });
  } catch (error) {
    console.error("Submit milestone error:", error);
    return sendError(res, 500, "SERVER_ERROR", "Unable to submit milestone");
  }
});

// POST /api/milestones/:id/start-verification
// Client moves a submitted milestone into verification
router.post("/:id/start-verification", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return sendError(res, 400, "INVALID_ID", "Invalid milestone ID");
    }

    const milestone = await Milestone.findById(id);

    if (!milestone) {
      return sendError(res, 404, "NOT_FOUND", "Milestone not found");
    }

    const project = await Project.findById(milestone.projectId);

    if (!project) {
      return sendError(res, 404, "PROJECT_NOT_FOUND", "Project not found");
    }

    if (project.clientId.toString() !== req.user._id.toString()) {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "Only the project owner can start verification"
      );
    }

    const updated = await Milestone.findOneAndUpdate(
      { _id: id, status: "submitted" },
      { $set: { status: "verifying" } },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return sendError(
        res,
        409,
        "INVALID_STATUS",
        "Only submitted milestones can enter verification"
      );
    }

    return res.status(200).json({ milestone: updated });
  } catch (error) {
    console.error("Start verification error:", error);
    return sendError(res, 500, "SERVER_ERROR", "Unable to start verification");
  }
});

// POST /api/milestones/:id/complete-verification
// Client marks verification as complete
router.post("/:id/complete-verification", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return sendError(res, 400, "INVALID_ID", "Invalid milestone ID");
    }

    const milestone = await Milestone.findById(id);

    if (!milestone) {
      return sendError(res, 404, "NOT_FOUND", "Milestone not found");
    }

    const project = await Project.findById(milestone.projectId);

    if (!project) {
      return sendError(res, 404, "PROJECT_NOT_FOUND", "Project not found");
    }

    if (project.clientId.toString() !== req.user._id.toString()) {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "Only the project owner can complete verification"
      );
    }

    const updated = await Milestone.findOneAndUpdate(
      { _id: id, status: "verifying" },
      { $set: { status: "verified" } },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return sendError(
        res,
        409,
        "INVALID_STATUS",
        "Milestone must be under verification first"
      );
    }

    return res.status(200).json({ milestone: updated });
  } catch (error) {
    console.error("Complete verification error:", error);
    return sendError(
      res,
      500,
      "SERVER_ERROR",
      "Unable to complete verification"
    );
  }
});

// GET /api/milestones/:id
// Client or assigned freelancer can view the milestone
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return sendError(res, 400, "INVALID_ID", "Invalid milestone ID");
    }

    const milestone = await Milestone.findById(id);

    if (!milestone) {
      return sendError(res, 404, "NOT_FOUND", "Milestone not found");
    }

    const project = await Project.findById(milestone.projectId);

    if (!project) {
      return sendError(res, 404, "PROJECT_NOT_FOUND", "Project not found");
    }

    const isClient =
      project.clientId.toString() === req.user._id.toString();

    const isFreelancer =
      project.freelancerId?.toString() === req.user._id.toString();

    if (!isClient && !isFreelancer) {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "You are not allowed to view this milestone"
      );
    }

    return res.status(200).json({ milestone });
  } catch (error) {
    console.error("Get milestone error:", error);
    return sendError(res, 500, "SERVER_ERROR", "Unable to fetch milestone");
  }
});

export default router;
