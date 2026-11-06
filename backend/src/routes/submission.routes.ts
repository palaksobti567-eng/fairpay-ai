
import { Router, Request, Response } from "express";
import mongoose from "mongoose";

import Submission from "../models/Submission";
import Milestone from "../models/Milestone";
import Project from "../models/Project";
import VerificationReport from "../models/VerificationReport";

import { requireAuth } from "../middleware/auth.middleware";
import { sendError } from "../utils/errors";
import {
  verifySubmission,
  AiVerificationError,
} from "../services/verifier";

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

// POST /api/submissions/:id/verify
// Client starts AI verification of a submission
router.post(
  "/:id/verify",
  async (req: Request, res: Response) => {
    let reportId: mongoose.Types.ObjectId | undefined;
    let milestoneId: mongoose.Types.ObjectId | undefined;

    try {
      const { id } = req.params;

      if (!isValidId(id)) {
        return sendError(res, 400, "INVALID_ID", "Invalid submission ID");
      }

      const submission = await Submission.findById(id);

      if (!submission) {
        return sendError(res, 404, "NOT_FOUND", "Submission not found");
      }

      const milestone = await Milestone.findById(submission.milestoneId);

      if (!milestone) {
        return sendError(res, 404, "NOT_FOUND", "Submission not found");
      }

      const project = await Project.findById(milestone.projectId);

      if (!project) {
        return sendError(res, 404, "NOT_FOUND", "Submission not found");
      }

      const userId = req.user!._id.toString();

      if (!isProjectParticipant(project, userId)) {
        return sendError(res, 404, "NOT_FOUND", "Submission not found");
      }

      if (req.user!.role !== "client") {
        return sendError(
          res,
          403,
          "FORBIDDEN",
          "Only the client can start verification"
        );
      }

      if (project.clientId.toString() !== userId) {
        return sendError(res, 404, "NOT_FOUND", "Submission not found");
      }

      // A running report must never be started twice.
      const existingReport = await VerificationReport.findOne({
        submissionId: submission._id,
      });

      if (existingReport?.status === "running") {
        return sendError(
          res,
          409,
          "VERIFICATION_RUNNING",
          "Verification is already running"
        );
      }

      if (milestone.status !== "submitted") {
        return sendError(
          res,
          409,
          "INVALID_STATUS",
          "Only submitted milestones can be verified"
        );
      }

      // Reserve the report. Reuse a previous failed/completed report.
      const reportData = {
        submissionId: submission._id,
        milestoneId: milestone._id,
        projectId: project._id,
        freelancerId: submission.freelancerId,
        source: submission.source,
        criteriaSnapshot: milestone.criteria.map((criterion) => ({
          id: criterion.id,
          text: criterion.text,
        })),
        criteriaResults: [],
        summary: "Verification is in progress.",
        status: "running" as const,
      };

      let report;

      if (existingReport) {
        report = await VerificationReport.findOneAndUpdate(
          {
            _id: existingReport._id,
            status: { $ne: "running" },
          },
          { $set: reportData },
          { new: true, runValidators: true }
        );

        if (!report) {
          return sendError(
            res,
            409,
            "VERIFICATION_RUNNING",
            "Verification is already running"
          );
        }
      } else {
        try {
          report = await VerificationReport.create(reportData);
        } catch (error) {
          // Another request may have reserved this submission first.
          if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === 11000
          ) {
            return sendError(
              res,
              409,
              "VERIFICATION_RUNNING",
              "Verification is already running"
            );
          }

          throw error;
        }
      }

      reportId = report._id;
      milestoneId = milestone._id;

      // Atomically move submitted -> verifying.
      const updatedMilestone = await Milestone.findOneAndUpdate(
        {
          _id: milestone._id,
          status: "submitted",
        },
        { $set: { status: "verifying" } },
        { new: true }
      );

      if (!updatedMilestone) {
        await VerificationReport.updateOne(
          { _id: report._id },
          {
            $set: {
              status: "failed",
              summary: "Milestone status changed before verification started.",
            },
          }
        );

        reportId = undefined;

        return sendError(
          res,
          409,
          "INVALID_STATUS",
          "Milestone status changed. Please try again."
        );
      }

      // Run the text-only verifier.
      const result = await verifySubmission({
        criteria: milestone.criteria.map((criterion) => ({
          id: criterion.id,
          text: criterion.text,
        })),
        description: submission.description,
      });

      report.criteriaResults = result.criteriaResults;
      report.summary = result.summary;
      report.status = "completed";

      await report.save();

      // Text-only evidence cannot promote a milestone to verified.
     const restoredMilestone = await Milestone.updateOne(
  { _id: milestone._id, status: "verifying" },
  { $set: { status: "submitted" } }
);

if (restoredMilestone.modifiedCount !== 1) {
  throw new Error(
    "Milestone state changed before verification could finish"
  );
}

reportId = undefined;
milestoneId = undefined;

      return res.status(200).json({
        message: "Verification completed successfully",
        report,
      });
    } catch (error) {
      // Restore the milestone so verification can be retried.
      if (milestoneId) {
        await Milestone.updateOne(
          { _id: milestoneId, status: "verifying" },
          { $set: { status: "submitted" } }
        ).catch(() => null);
      }

      if (reportId) {
        await VerificationReport.updateOne(
          { _id: reportId },
          {
            $set: {
              status: "failed",
              summary: "Verification failed. Please try again.",
            },
          }
        ).catch(() => null);
      }

      if (error instanceof AiVerificationError) {
        return sendError(
          res,
          502,
          error.code,
          error.message
        );
      }

      console.error(
        "Submission verification error:",
        error instanceof Error ? error.name : "unknown error"
      );

      return sendError(
        res,
        500,
        "INTERNAL_ERROR",
        "Could not verify submission"
      );
    }
  }
);

// GET /api/submissions/:id/report
// Client and assigned freelancer can view the report
router.get(
  "/:id/report",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!isValidId(id)) {
        return sendError(res, 400, "INVALID_ID", "Invalid submission ID");
      }

      const submission = await Submission.findById(id);

      if (!submission) {
        return sendError(res, 404, "NOT_FOUND", "Submission not found");
      }

      const milestone = await Milestone.findById(submission.milestoneId);

      if (!milestone) {
        return sendError(res, 404, "NOT_FOUND", "Submission not found");
      }

      const project = await Project.findById(milestone.projectId);

      if (!project) {
        return sendError(res, 404, "NOT_FOUND", "Submission not found");
      }

      const userId = req.user!._id.toString();

      if (!isProjectParticipant(project, userId)) {
        return sendError(res, 404, "NOT_FOUND", "Submission not found");
      }

      const report = await VerificationReport.findOne({
        submissionId: submission._id,
      });

      if (!report) {
        return sendError(
          res,
          404,
          "REPORT_NOT_FOUND",
          "Verification report not found"
        );
      }

      return res.status(200).json({ report });
    } catch (error) {
      console.error(
        "Get verification report error:",
        error instanceof Error ? error.name : "unknown error"
      );

      return sendError(
        res,
        500,
        "INTERNAL_ERROR",
        "Could not retrieve verification report"
      );
    }
  }
);

export default router;
