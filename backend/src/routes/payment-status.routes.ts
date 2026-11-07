
import { Router, Request, Response } from "express";
import mongoose from "mongoose";

import Payment from "../models/Payment";
import Milestone from "../models/Milestone";
import Project from "../models/Project";

import { requireAuth } from "../middleware/auth.middleware";
import { sendError } from "../utils/errors";

const router = Router();

router.use(requireAuth);

// GET /api/milestones/:id/payment
router.get("/:id/payment", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return sendError(
        res,
        400,
        "INVALID_ID",
        "Invalid milestone ID"
      );
    }

    const milestone = await Milestone.findById(id);

    if (!milestone) {
      return sendError(
        res,
        404,
        "NOT_FOUND",
        "Milestone not found"
      );
    }

    const project = await Project.findById(milestone.projectId);

    if (!project) {
      return sendError(
        res,
        404,
        "NOT_FOUND",
        "Project not found"
      );
    }

    const userId = req.user!._id.toString();

    const isClient =
      project.clientId.toString() === userId;

    const isFreelancer =
      project.freelancerId?.toString() === userId;

    if (!isClient && !isFreelancer) {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "You are not a participant in this project"
      );
    }

    const payment = await Payment.findOne({
      milestoneId: milestone._id,
    }).sort({ createdAt: -1 });

    if (!payment) {
      return res.status(200).json({
        milestoneId: milestone._id,
        milestoneStatus: milestone.status,
        payment: null,
      });
    }

    return res.status(200).json({
      milestoneId: milestone._id,
      milestoneStatus: milestone.status,
      payment: {
        id: payment._id,
        orderId: payment.orderId ?? null,
        captureId: payment.captureId ?? null,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        paidAt: payment.paidAt ?? null,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      },
    });
  } catch (error) {
    console.error(
      "Get milestone payment error:",
      error instanceof Error ? error.name : "unknown error"
    );

    return sendError(
      res,
      500,
      "PAYMENT_STATUS_ERROR",
      "Unable to retrieve milestone payment status"
    );
  }
});

export default router;
