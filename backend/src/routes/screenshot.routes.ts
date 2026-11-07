
import { Router, Request, Response } from "express";
import mongoose from "mongoose";

import Screenshot from "../models/Screenshot";
import Submission from "../models/Submission";
import Project from "../models/Project";

import { requireAuth } from "../middleware/auth.middleware";
import { sendError } from "../utils/errors";

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

// GET /api/screenshots/:id?device=desktop
// GET /api/screenshots/:id?device=mobile
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const device = req.query.device;

    if (!isValidId(id)) {
      return sendError(
        res,
        400,
        "INVALID_ID",
        "Invalid screenshot ID"
      );
    }

    if (device !== "desktop" && device !== "mobile") {
      return sendError(
        res,
        400,
        "INVALID_DEVICE",
        "Device must be desktop or mobile"
      );
    }

    const screenshot = await Screenshot.findById(id)
      .select("+desktop +mobile");

    if (!screenshot) {
      return sendError(
        res,
        404,
        "NOT_FOUND",
        "Screenshot not found"
      );
    }

    const [submission, project] = await Promise.all([
      Submission.findOne({
        _id: screenshot.submissionId,
        projectId: screenshot.projectId,
      }).select("_id"),

      Project.findById(screenshot.projectId)
        .select("clientId freelancerId"),
    ]);

    if (!submission || !project) {
      return sendError(
        res,
        404,
        "NOT_FOUND",
        "Screenshot not found"
      );
    }

    const userId = req.user!._id.toString();

    if (!isProjectParticipant(project, userId)) {
      return sendError(
        res,
        404,
        "NOT_FOUND",
        "Screenshot not found"
      );
    }

    const image =
      device === "desktop"
        ? screenshot.desktop
        : screenshot.mobile;

    if (!Buffer.isBuffer(image) || image.length === 0) {
      return sendError(
        res,
        404,
        "NOT_FOUND",
        "Screenshot not found"
      );
    }

    return res
      .status(200)
      .set("Cache-Control", "private, no-store")
      .type("png")
      .send(image);

  } catch (error) {
    console.error(
      "Screenshot retrieval error:",
      error instanceof Error ? error.name : "unknown error"
    );

    return sendError(
      res,
      500,
      "INTERNAL_ERROR",
      "Could not retrieve screenshot"
    );
  }
});

export default router;
