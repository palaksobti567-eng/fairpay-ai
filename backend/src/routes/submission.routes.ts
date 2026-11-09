
import { Router, Request, Response } from "express";
import mongoose from "mongoose";

import Submission from "../models/Submission";
import Milestone from "../models/Milestone";
import Project from "../models/Project";
import Screenshot from "../models/Screenshot";
import VerificationReport from "../models/VerificationReport";

import { requireAuth } from "../middleware/auth.middleware";
import { sendError } from "../utils/errors";
import {
  inspectWebsite,
  type InspectionObservations,
} from "../services/inspector";
import { saveInspectionScreenshots } from "../services/screenshotStorage";
import { recordAudit } from "../utils/audit";
import {
  AiVerificationError,
  parseInspectionObservations,
  verifyBrowserEvidence,
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

function hasUsableScreenshotBuffer(value: unknown): boolean {
  return Buffer.isBuffer(value) && value.length > 0;
}

type BrowserEvidence = {
  observations: InspectionObservations;
  hasDesktopScreenshot: boolean;
  hasMobileScreenshot: boolean;
};

async function loadStoredBrowserEvidence(
  submissionId: mongoose.Types.ObjectId
): Promise<BrowserEvidence | null> {
  const screenshot = await Screenshot.findOne({
    submissionId,
  }).select("+desktop +mobile");

  if (!screenshot) {
    return null;
  }

  const observations = parseInspectionObservations(screenshot.observations);

  if (!observations) {
    return null;
  }

  const hasDesktopScreenshot = hasUsableScreenshotBuffer(screenshot.desktop);
  const hasMobileScreenshot = hasUsableScreenshotBuffer(screenshot.mobile);

  if (!hasDesktopScreenshot || !hasMobileScreenshot) {
    return null;
  }

  return {
    observations,
    hasDesktopScreenshot,
    hasMobileScreenshot,
  };
}

async function collectBrowserEvidenceFromPreview(
  submissionId: mongoose.Types.ObjectId,
  projectId: mongoose.Types.ObjectId,
  previewUrl: string
): Promise<{
  evidence: BrowserEvidence | null;
  unsafeUrl: boolean;
}> {
  const inspection = await inspectWebsite(previewUrl);

  if (inspection.errorCode === "UNSAFE_URL") {
    return { evidence: null, unsafeUrl: true };
  }

  if (
    inspection.status !== "success" ||
    !inspection.observations ||
    !inspection.screenshots.desktop ||
    !inspection.screenshots.mobile
  ) {
    return { evidence: null, unsafeUrl: false };
  }

  try {
    await saveInspectionScreenshots({
      submissionId: submissionId.toString(),
      projectId: projectId.toString(),
      desktop: inspection.screenshots.desktop,
      mobile: inspection.screenshots.mobile,
      observations: inspection.observations,
    });
  } catch (error) {
    console.error(
      "Verification screenshot save error:",
      error instanceof Error ? error.name : "unknown error"
    );
    return { evidence: null, unsafeUrl: false };
  }

  return {
    evidence: {
      observations: inspection.observations,
      hasDesktopScreenshot: true,
      hasMobileScreenshot: true,
    },
    unsafeUrl: false,
  };
}

// POST /api/submissions/:id/verify
// Client starts browser verification of a submission
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

      if (
       milestone.status !== "submitted" &&
       milestone.status !== "verifying"
     ) {
        return sendError(
          res,
          409,
          "INVALID_STATUS",
          "Only submitted milestones can be verified"
        );
      }

      let evidence = await loadStoredBrowserEvidence(submission._id);

      if (!evidence && submission.previewUrl) {
        const collected = await collectBrowserEvidenceFromPreview(
          submission._id,
          project._id,
          submission.previewUrl
        );

        if (collected.unsafeUrl) {
          return sendError(
            res,
            400,
            "UNSAFE_URL",
            "The preview URL could not be inspected safely"
          );
        }

        evidence = collected.evidence;
      }

      if (!evidence) {
        return sendError(
          res,
          409,
          "BROWSER_EVIDENCE_REQUIRED",
          "Independent browser evidence is required to verify this submission"
        );
      }

      const result = verifyBrowserEvidence({
        criteria: milestone.criteria.map((criterion) => ({
          id: criterion.id,
          text: criterion.text,
        })),
        observations: evidence.observations,
        hasDesktopScreenshot: evidence.hasDesktopScreenshot,
        hasMobileScreenshot: evidence.hasMobileScreenshot,
      });

      const reportData = {
        submissionId: submission._id,
        milestoneId: milestone._id,
        projectId: project._id,
        freelancerId: submission.freelancerId,
        source: "browser" as const,
        criteriaSnapshot: milestone.criteria.map((criterion) => ({
          id: criterion.id,
          text: criterion.text,
        })),
        criteriaResults: [] as {
          criterionId: string;
          status: "completed" | "missing" | "unverified";
          reason: string;
        }[],
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

      const updatedMilestone = await Milestone.findOneAndUpdate(
  {
    _id: milestone._id,
    status: { $in: ["submitted", "verifying"] },
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

      report.criteriaResults = result.criteriaResults;
      report.summary = result.summary;
      report.source = "browser";
      report.status = "completed";

      await report.save();

      recordAudit({
        actorId: req.user!._id,
        projectId: project._id,
        milestoneId: milestone._id,
        eventType: "verification.completed",
        eventData: { submissionId: submission._id, reportId: report._id },
      });

      reportId = undefined;
      milestoneId = undefined;

      return res.status(200).json({
        message: "Verification completed successfully",
        report,
      });
    } catch (error) {
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

      const screenshot = await Screenshot.findOne({
        submissionId: submission._id,
      }).select("_id");

      return res.status(200).json({
        report,
        screenshotId: screenshot?._id ?? null,
      });
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
