import { inspectWebsite } from "../services/inspector";
import { saveInspectionScreenshots } from "../services/screenshotStorage";
import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import VerificationReport from "../models/VerificationReport";

import Milestone from "../models/Milestone";
import Project from "../models/Project";
import Submission from "../models/Submission";

import { requireAuth } from "../middleware/auth.middleware";
import { sendError } from "../utils/errors";

import { updateMilestoneSchema } from "../validators/milestone.validator";
import { createSubmissionSchema } from "../validators/submission.validator";

const router = Router();

router.use(requireAuth);

function isValidId(id: unknown): id is string {
  return typeof id === "string" && mongoose.isValidObjectId(id);
}

function isProjectParticipant(
  project: {
    clientId: mongoose.Types.ObjectId;
    freelancerId?: mongoose.Types.ObjectId | null;
  },
  userId: string
): boolean {
  return (
    project.clientId.toString() === userId ||
    project.freelancerId?.toString() === userId
  );
}


// PATCH /api/milestones/:id
// Client updates a draft milestone
router.patch(
  "/:id",
  async (req: Request, res: Response) => {
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
        return sendError(res, 404, "NOT_FOUND", "Milestone not found");
      }

      const userId = req.user!._id.toString();

      if (!isProjectParticipant(project, userId)) {
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
    } catch (error) {
      console.error("Update milestone error:", error);

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
      project.freelancerId.toString() !== req.user!._id.toString()
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
      project.freelancerId.toString() !== req.user!._id.toString()
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

// POST /api/milestones/:id/submissions
// Assigned freelancer submits work
router.post(
  "/:id/submissions",
  async (req: Request, res: Response) => {
    let submissionId: mongoose.Types.ObjectId | undefined;

    try {
      const { id } = req.params;

      // 1. Validate milestone ID
      if (!isValidId(id)) {
        return sendError(res, 400, "INVALID_ID", "Invalid milestone ID");
      }

      // 2. Validate submission data
      const parsed = createSubmissionSchema.safeParse(req.body);

      if (!parsed.success) {
        return sendError(
          res,
          400,
          "VALIDATION_ERROR",
          "Invalid submission data",
          parsed.error.issues
        );
      }

      // 3. Load milestone
      const milestone = await Milestone.findById(id);

      if (!milestone) {
        return sendError(res, 404, "NOT_FOUND", "Milestone not found");
      }

      // 4. Load associated project
      const project = await Project.findById(milestone.projectId);

      if (!project) {
        return sendError(res, 404, "NOT_FOUND", "Milestone not found");
      }

      const userId = req.user!._id.toString();

      // 5. Non-participants receive 404
      if (!isProjectParticipant(project, userId)) {
        return sendError(res, 404, "NOT_FOUND", "Milestone not found");
      }

      // 6. Wrong role receives 403
      if (req.user!.role !== "freelancer") {
        return sendError(
          res,
          403,
          "FORBIDDEN",
          "Only freelancers can submit work"
        );
      }

      // 7. Confirm this is the assigned freelancer
      if (project.freelancerId?.toString() !== userId) {
        return sendError(res, 404, "NOT_FOUND", "Milestone not found");
      }

      // 8. Check allowed milestone statuses
      const allowedStatuses = [
        "criteria_approved",
        "in_progress",
        "rejected",
      ];

      if (!allowedStatuses.includes(milestone.status)) {
        return sendError(
          res,
          409,
          "INVALID_STATUS",
          "Milestone cannot be submitted in its current status"
        );
      }

      // 9. Create submission
      const submission = await Submission.create({
        milestoneId: milestone._id,
        projectId: project._id,
        freelancerId: req.user!._id,
        description: parsed.data.description,
        previewUrl: parsed.data.previewUrl,
        source: "freelancer_claim",
      });

      submissionId = submission._id;

      // 10. Atomically change status only if it is still allowed.
      // Use the native collection method to avoid the Mongoose
      // findOneAndUpdate overload issue encountered earlier.
      const updateResult = await Milestone.collection.updateOne(
        {
          _id: milestone._id,
          status: {
            $in: ["criteria_approved", "in_progress", "rejected"],
          },
        },
        {
          $set: { status: "submitted" },
        }
      );

      if (updateResult.modifiedCount !== 1) {
        await Submission.findByIdAndDelete(submission._id);
        submissionId = undefined;

        return sendError(
          res,
          409,
          "INVALID_STATUS",
          "Milestone status changed. Please try again."
        );
      }

      submissionId = undefined;
      milestone.status = "submitted";

      // Inspect the preview website if supplied.
      let inspectionStatus: "not_requested" | "success" | "failed" =
        parsed.data.previewUrl ? "failed" : "not_requested";

      let screenshotId: string | null = null;

      if (parsed.data.previewUrl) {
        try {
          const inspection = await inspectWebsite(parsed.data.previewUrl);

          if (
            inspection.status === "success" &&
            inspection.observations &&
            inspection.screenshots.desktop &&
            inspection.screenshots.mobile
          ) {
            const savedScreenshot = await saveInspectionScreenshots({
              submissionId: submission._id.toString(),
              projectId: project._id.toString(),
              desktop: inspection.screenshots.desktop,
              mobile: inspection.screenshots.mobile,
              observations: inspection.observations,
            });

            screenshotId = savedScreenshot._id.toString();
            inspectionStatus = "success";
          }
        } catch (error) {
          console.error(
            "Submission inspection error:",
            error instanceof Error ? error.name : "unknown error"
          );
        }
      }
      // 11. Return response
      return res.status(201).json({
        message: "Submission created successfully",
        submission,
        milestone,
        inspectionStatus,
        screenshotId,
      });
    } catch (error) {
      // Clean up submission if the operation failed
      if (submissionId) {
        await Submission.findByIdAndDelete(submissionId).catch(() => null);
      }

      console.error("Create submission error:", error);

      return sendError(
        res,
        500,
        "SERVER_ERROR",
        "Unable to create submission"
      );
    }
  }
);


// POST /api/milestones/:id/approve
// Client approves a milestone after successful verification
router.post("/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return sendError(res, 400, "INVALID_ID", "Invalid milestone ID");
    }

    const schema = z.object({
      reportId: z.string().refine(
        (value) => mongoose.isValidObjectId(value),
        "Invalid report ID"
      ),
    }).strict();

    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      return sendError(res, 400, "VALIDATION_ERROR", "Invalid approval data");
    }

    if (req.user!.role !== "client") {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "Only the client can approve a milestone"
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

    if (project.clientId.toString() !== req.user!._id.toString()) {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "Only the project owner can approve this milestone"
      );
    }

    if (milestone.status !== "verified") {
      return sendError(
        res,
        409,
        "INVALID_STATUS",
        "Only verified milestones can be approved"
      );
    }

    const report = await VerificationReport.findOne({
      _id: parsed.data.reportId,
      milestoneId: milestone._id,
      status: "completed",
    });

    if (!report) {
      return sendError(
        res,
        404,
        "REPORT_NOT_FOUND",
        "Completed verification report not found"
      );
    }

    const updateResult = await Milestone.collection.updateOne(
      {
        _id: milestone._id,
        status: "verified",
      },
      {
        $set: { status: "approved" },
      }
    );

    if (updateResult.modifiedCount !== 1) {
      return sendError(
        res,
        409,
        "STATUS_CONFLICT",
        "Milestone status changed. Refresh and try again."
      );
    }

    const updatedMilestone = await Milestone.findById(id);

    return res.status(200).json({
      message: "Milestone approved successfully",
      milestone: updatedMilestone,
    });
  } catch (error) {
    console.error("Approve milestone error:", error);
    return sendError(
      res,
      500,
      "SERVER_ERROR",
      "Unable to approve milestone"
    );
  }
});
// GET /api/milestones/:id/submissions
// Client and assigned freelancer can view submissions
router.get(
  "/:id/submissions",
  async (req: Request, res: Response) => {
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
        return sendError(res, 404, "NOT_FOUND", "Milestone not found");
      }

      const userId = req.user!._id.toString();

      if (!isProjectParticipant(project, userId)) {
        return sendError(res, 404, "NOT_FOUND", "Milestone not found");
      }

      const submissions = await Submission.find({
        milestoneId: milestone._id,
      }).sort({ createdAt: -1 });

      return res.status(200).json({
        submissions,
      });
    } catch (error) {
      console.error("Get submissions error:", error);

      return sendError(
        res,
        500,
        "SERVER_ERROR",
        "Unable to fetch submissions"
      );
    }
  }
);

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

    if (project.clientId.toString() !== req.user!._id.toString()) {
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

    if (project.clientId.toString() !== req.user!._id.toString()) {
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


// POST /api/milestones/:id/approve
// Client approves a milestone after successful verification
router.post("/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return sendError(res, 400, "INVALID_ID", "Invalid milestone ID");
    }

    const schema = z.object({
      reportId: z.string().refine(
        (value) => mongoose.isValidObjectId(value),
        "Invalid report ID"
      ),
    }).strict();

    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      return sendError(res, 400, "VALIDATION_ERROR", "Invalid approval data");
    }

    if (req.user!.role !== "client") {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "Only the client can approve a milestone"
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

    if (project.clientId.toString() !== req.user!._id.toString()) {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "Only the project owner can approve this milestone"
      );
    }

    if (milestone.status !== "verified") {
      return sendError(
        res,
        409,
        "INVALID_STATUS",
        "Only verified milestones can be approved"
      );
    }

    const report = await VerificationReport.findOne({
      _id: parsed.data.reportId,
      milestoneId: milestone._id,
      status: "completed",
    });

    if (!report) {
      return sendError(
        res,
        404,
        "REPORT_NOT_FOUND",
        "Completed verification report not found"
      );
    }

    const updateResult = await Milestone.collection.updateOne(
      {
        _id: milestone._id,
        status: "verified",
      },
      {
        $set: { status: "approved" },
      }
    );

    if (updateResult.modifiedCount !== 1) {
      return sendError(
        res,
        409,
        "STATUS_CONFLICT",
        "Milestone status changed. Refresh and try again."
      );
    }

    const updatedMilestone = await Milestone.findById(id);

    return res.status(200).json({
      message: "Milestone approved successfully",
      milestone: updatedMilestone,
    });
  } catch (error) {
    console.error("Approve milestone error:", error);
    return sendError(
      res,
      500,
      "SERVER_ERROR",
      "Unable to approve milestone"
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
      project.clientId.toString() === req.user!._id.toString();

    const isFreelancer =
      project.freelancerId?.toString() === req.user!._id.toString();

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

