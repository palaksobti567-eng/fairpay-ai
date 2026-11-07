
import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import { randomUUID } from "crypto";
import { z } from "zod";

import Payment from "../models/Payment";
import Milestone from "../models/Milestone";
import Project from "../models/Project";

import { requireAuth } from "../middleware/auth.middleware";
import { sendError } from "../utils/errors";

import {
  createPayPalOrder,
  getPayPalOrder,
  capturePayPalOrder,
} from "../services/paypal";const router = Router();

router.use(requireAuth);

const createOrderSchema = z.object({
  milestoneId: z.string().refine(
    (value) => mongoose.isValidObjectId(value),
    "Invalid milestone ID"
  ),
}).strict();

router.post("/create-order", async (req: Request, res: Response) => {
  try {
    // 1. Validate request
    const parsed = createOrderSchema.safeParse(req.body);

    if (!parsed.success) {
      return sendError(
        res,
        400,
        "VALIDATION_ERROR",
        "Invalid payment request",
        parsed.error.issues
      );
    }

    // 2. Only clients can create orders
    if (req.user!.role !== "client") {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "Only the client can create a payment order"
      );
    }

    // 3. Load milestone and project
    const milestone = await Milestone.findById(
      parsed.data.milestoneId
    );

    if (!milestone) {
      return sendError(res, 404, "NOT_FOUND", "Milestone not found");
    }

    const project = await Project.findById(milestone.projectId);

    if (!project) {
      return sendError(res, 404, "NOT_FOUND", "Project not found");
    }

    // 4. Verify project ownership
    if (project.clientId.toString() !== req.user!._id.toString()) {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "Only the project owner can pay for this milestone"
      );
    }

    // 5. Milestone must be approved
    if (milestone.status !== "approved") {
      return sendError(
        res,
        409,
        "INVALID_STATUS",
        "Only approved milestones can be paid"
      );
    }

    // 6. Check existing active payment
    let payment = await Payment.findOne({
      milestoneId: milestone._id,
      status: { $in: ["created", "capturing", "completed"] },
    });

    if (payment?.status === "completed") {
      return sendError(
        res,
        409,
        "ALREADY_PAID",
        "This milestone has already been paid"
      );
    }

    if (payment?.status === "capturing") {
      return sendError(
        res,
        409,
        "PAYMENT_IN_PROGRESS",
        "Payment capture is already in progress"
      );
    }

    // 7. Reserve a payment record before calling PayPal.
    // Reuse its requestId if an earlier PayPal request needs retrying.
    if (!payment) {
      try {
        payment = await Payment.create({
          milestoneId: milestone._id,
          requestId: randomUUID(),
          amount: milestone.amount,
          currency: milestone.currency.toUpperCase(),
          status: "created",
        });
      } catch (error) {
        // Another concurrent request may have reserved the milestone.
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === 11000
        ) {
          payment = await Payment.findOne({
            milestoneId: milestone._id,
            status: { $in: ["created", "capturing", "completed"] },
          });
        } else {
          throw error;
        }
      }
    }

    if (!payment) {
      return sendError(
        res,
        409,
        "PAYMENT_CONFLICT",
        "Could not reserve payment. Please retry."
      );
    }

    // 8. Return an existing PayPal order if one was already created.
    if (payment.orderId) {
      const existingOrder = await getPayPalOrder(payment.orderId);

      const approvalLink = existingOrder.links?.find(
        (link) => link.rel === "approve" || link.rel === "payer-action"
      );

      return res.status(200).json({
        message: "Existing payment order returned",
        payment: {
          id: payment._id,
          orderId: payment.orderId,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
        },
        approvalUrl: approvalLink?.href ?? null,
        orderStatus: existingOrder.status,
      });
    }

    // 9. Create PayPal order using database amount and currency.
    // These URLs match the existing sandbox test script.
    const order = await createPayPalOrder({
      amount: milestone.amount,
      currency: milestone.currency,
      requestId: payment.requestId,
      returnUrl: "https://example.com/return",
      cancelUrl: "https://example.com/cancel",
    });

    if (!order.id) {
      return sendError(
        res,
        502,
        "PAYPAL_ORDER_ERROR",
        "PayPal did not return an order ID"
      );
    }

    // 10. Save the PayPal order ID.
    payment.orderId = order.id;
    await payment.save();

    const approvalLink = order.links?.find(
      (link) => link.rel === "approve" || link.rel === "payer-action"
    );

    if (!approvalLink) {
      return sendError(
        res,
        502,
        "PAYPAL_APPROVAL_LINK_MISSING",
        "PayPal order was created but no approval link was returned"
      );
    }

    return res.status(201).json({
      message: "PayPal order created successfully",
      payment: {
        id: payment._id,
        orderId: payment.orderId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
      },
      approvalUrl: approvalLink.href,
    });
  } catch (error) {
    console.error(
      "Create payment order error:",
      error instanceof Error ? error.name : "unknown error"
    );

    return sendError(
      res,
      500,
      "PAYMENT_ERROR",
      "Unable to create payment order. Retry using the same milestone."
    );
  }
});
function amountsMatch(
  actualValue: string | undefined,
  expectedAmount: number
): boolean {
  if (!actualValue || !/^\d+(\.\d{1,2})?$/.test(actualValue)) {
    return false;
  }

  return Math.round(Number(actualValue) * 100) ===
    Math.round(expectedAmount * 100);
}

router.post("/capture-order", async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      orderId: z.string().trim().min(1),
    }).strict();

    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      return sendError(
        res,
        400,
        "VALIDATION_ERROR",
        "A valid PayPal order ID is required",
        parsed.error.issues
      );
    }

    if (req.user!.role !== "client") {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "Only the client can capture this payment"
      );
    }

    const payment = await Payment.findOne({
      orderId: parsed.data.orderId,
    });

    if (!payment) {
      return sendError(
        res,
        404,
        "PAYMENT_NOT_FOUND",
        "Payment not found for this PayPal order"
      );
    }

    const milestone = await Milestone.findById(payment.milestoneId);

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

    if (project.clientId.toString() !== req.user!._id.toString()) {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "Only the project owner can capture this payment"
      );
    }

    if (milestone.status !== "approved" && milestone.status !== "paid") {
      return sendError(
        res,
        409,
        "INVALID_STATUS",
        "The milestone must be approved before payment capture"
      );
    }

    if (payment.status === "failed") {
      return sendError(
        res,
        409,
        "PAYMENT_FAILED",
        "This payment failed. Create a new payment order to retry."
      );
    }

    // Fetch the actual order from PayPal before capturing or reconciling.
    if (!payment.orderId) {
  return sendError(
    res,
    409,
    "ORDER_ID_MISSING",
    "Payment does not have a PayPal order ID"
  );
}

const paypalOrder = await getPayPalOrder(payment.orderId);

    if (paypalOrder.id !== payment.orderId) {
      return sendError(
        res,
        409,
        "ORDER_MISMATCH",
        "PayPal returned a different order"
      );
    }

    const purchaseUnit = paypalOrder.purchase_units?.[0];
    const orderAmount = purchaseUnit?.amount;

    if (
      !orderAmount ||
      orderAmount.currency_code.toUpperCase() !== payment.currency.toUpperCase() ||
      !amountsMatch(orderAmount.value, payment.amount) ||
      payment.amount !== milestone.amount ||
      payment.currency.toUpperCase() !== milestone.currency.toUpperCase()
    ) {
      return sendError(
        res,
        409,
        "AMOUNT_MISMATCH",
        "PayPal order amount or currency does not match the milestone"
      );
    }

    let captureResult = paypalOrder;

    // If PayPal already completed the order, reconcile it locally.
    // Do not attempt another capture.
    if (paypalOrder.status !== "COMPLETED") {
      if (paypalOrder.status !== "APPROVED") {
        return sendError(
          res,
          409,
          "ORDER_NOT_APPROVED",
          "The PayPal order has not been approved by the payer"
        );
      }

            // Local and PayPal statuses disagree. Do not claim success
      // or attempt another capture until this is reconciled.
      if (payment.status === "completed") {
        return sendError(
          res,
          503,
          "PAYMENT_STATUS_MISMATCH",
          "Local payment is completed but PayPal does not confirm completion"
        );
      }

      // Save a stable capture idempotency key before contacting PayPal.
      if (!payment.captureRequestId) {
        payment.captureRequestId = randomUUID();
      }

      payment.status = "capturing";
      await payment.save();

      // Reuse the same key if this request needs to be retried.
      captureResult = await capturePayPalOrder(
        payment.orderId,
        payment.captureRequestId
      );
    }

    const capture = captureResult.purchase_units?.[0]?.payments?.captures?.[0];

    if (captureResult.status === "COMPLETED") {
      if (
        !capture ||
        capture.status !== "COMPLETED" ||
        !capture.id ||
        capture.amount.currency_code.toUpperCase() !== payment.currency.toUpperCase() ||
        !amountsMatch(capture.amount.value, payment.amount)
      ) {
        // Keep the payment in capturing state. Do not claim it is paid
        // until the capture can be reconciled correctly.
        return sendError(
          res,
          409,
          "CAPTURE_VERIFICATION_FAILED",
          "PayPal completed the order, but the capture details could not be verified"
        );
      }

      payment.captureId = capture.id;
      payment.status = "completed";
      payment.paidAt = new Date();
      await payment.save();

      await Milestone.updateOne(
        { _id: milestone._id },
        { $set: { status: "paid" } }
      );

      return res.status(200).json({
        message: "Payment captured successfully",
        payment: {
          id: payment._id,
          orderId: payment.orderId,
          captureId: payment.captureId,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          paidAt: payment.paidAt,
        },
        milestoneStatus: "paid",
      });
    }

    // A pending capture is not a successful payment.
    if (capture?.status === "PENDING" || captureResult.status === "PENDING") {
      return res.status(202).json({
        message: "PayPal is still processing this payment",
        payment: {
          id: payment._id,
          orderId: payment.orderId,
          status: payment.status,
        },
      });
    }

    // A definitive denial is recorded as a failure.
    if (capture?.status === "DENIED") {
      payment.status = "failed";
      await payment.save();

      await Milestone.updateOne(
        { _id: milestone._id },
        { $set: { status: "payment_failed" } }
      );

      return sendError(
        res,
        402,
        "PAYMENT_DECLINED",
        "PayPal declined the payment"
      );
    }

    // Unknown or incomplete response: leave it as capturing.
    // A later retry will check PayPal's order status first.
    return sendError(
      res,
      503,
      "PAYMENT_STATUS_UNCONFIRMED",
      "Payment status is not yet confirmed. Retry this same order to reconcile it."
    );
  } catch (error) {
    console.error(
      "Capture payment error:",
      error instanceof Error ? error.name : "unknown error"
    );

    // Do not mark the payment failed here. A network error can happen
    // after PayPal has already captured the money.
    return sendError(
      res,
      503,
      "PAYMENT_STATUS_UNCONFIRMED",
      "Unable to confirm payment status. Retry using the same order ID."
    );
  }
});

export default router;
