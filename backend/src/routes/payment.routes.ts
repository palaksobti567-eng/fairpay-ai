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
  verifyPayPalWebhookSignature,
} from "../services/paypal";
import { recordAudit } from "../utils/audit";

const router = Router();

router.use(requireAuth);

// A capture attempt older than this is treated as interrupted.
// It may then be retried, but only with the SAME PayPal idempotency key.
const CAPTURE_LOCK_TIMEOUT_MS = 2 * 60 * 1000;

// Capture statuses that mean PayPal definitively refused the money.
// (PayPal documents DECLINED for captures; DENIED is accepted as well.)
const DEFINITIVE_FAILURE_STATUSES = ["DENIED", "DECLINED"];

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

    // 5. Milestone must be approved, or payment_failed for a retry.
    if (
      milestone.status !== "approved" &&
      milestone.status !== "payment_failed"
    ) {
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

    recordAudit({
      actorId: req.user!._id,
      projectId: project._id,
      milestoneId: milestone._id,
      eventType: "payment.order_created",
      eventData: { orderId: order.id },
    });

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

// ---------------------------------------------------------------------------
// Helpers for capture-order
// ---------------------------------------------------------------------------

// Convert a money value to whole cents WITHOUT floating-point equality.
// Strings come from PayPal ("19.99"); numbers come from MongoDB (19.99).
// Returns null for anything that is not a valid amount with at most 2 decimals.
function toCents(value: string | number | null | undefined): number | null {
  if (typeof value === "string") {
    if (!/^\d+(\.\d{1,2})?$/.test(value)) {
      return null;
    }

    const [whole, fraction = ""] = value.split(".");
    return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }

    const cents = Math.round(value * 100);
    return Math.abs(value * 100 - cents) < 1e-6 ? cents : null;
  }

  return null;
}

function amountsMatch(
  actual: string | number | null | undefined,
  expected: string | number | null | undefined
): boolean {
  const actualCents = toCents(actual);
  const expectedCents = toCents(expected);

  return (
    actualCents !== null &&
    expectedCents !== null &&
    actualCents === expectedCents
  );
}

function sameCurrency(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  return !!a && !!b && a.toUpperCase() === b.toUpperCase();
}

type MoneyLike =
  | { currency_code?: string | null; value?: string | null }
  | null
  | undefined;

type CaptureLike =
  | {
      id?: string | null;
      status?: string | null;
      amount?: MoneyLike;
    }
  | null
  | undefined;

function moneyMatches(
  money: MoneyLike,
  expectedAmount: number,
  expectedCurrency: string
): boolean {
  return (
    !!money &&
    sameCurrency(money.currency_code, expectedCurrency) &&
    amountsMatch(money.value, expectedAmount)
  );
}

// Returns the capture ID only if the capture is COMPLETED, has an ID,
// and its amount and currency match the stored Payment.
function verifiedCaptureId(
  capture: CaptureLike,
  payment: { amount: number; currency: string }
): string | null {
  if (!capture || capture.status !== "COMPLETED" || !capture.id) {
    return null;
  }

  if (!moneyMatches(capture.amount, payment.amount, payment.currency)) {
    return null;
  }

  return capture.id;
}

// Atomically move a payment to completed. Only created/capturing payments
// can be completed, and a completed payment is never changed again.
// Returns the completed payment, or null if it could not be completed.
async function completePayment(
  paymentId: mongoose.Types.ObjectId,
  captureId: string
) {
  const updated = await Payment.findOneAndUpdate(
    { _id: paymentId, status: { $in: ["created", "capturing"] } },
    {
      $set: {
        status: "completed",
        captureId,
        paidAt: new Date(),
      },
    },
    { new: true, runValidators: true }
  );

  if (updated) {
    return updated;
  }

  // Another request may have completed it first. That is fine.
  const latest = await Payment.findById(paymentId);
  return latest?.status === "completed" ? latest : null;
}

type CompletedPayment = NonNullable<
  Awaited<ReturnType<typeof completePayment>>
>;

// Money has been captured, so the milestone must end up "paid".
// A failure here is logged and reported, never hidden. The Payment is already
// "completed", so a later capture-order call repairs the milestone without
// contacting PayPal.
async function markMilestonePaid(
  milestoneId: mongoose.Types.ObjectId
): Promise<boolean> {
  try {
    const result = await Milestone.updateOne(
      { _id: milestoneId },
      { $set: { status: "paid" } }
    );

    return result.acknowledged;
  } catch (error) {
    console.error(
      "Mark milestone paid error:",
      error instanceof Error ? error.name : "unknown error"
    );

    return false;
  }
}

async function respondPaymentCompleted(
  res: Response,
  payment: CompletedPayment,
  milestoneId: mongoose.Types.ObjectId,
  message: string
) {
  recordAudit({
    milestoneId,
    eventType: "payment.captured",
    eventData: { orderId: payment.orderId, captureId: payment.captureId },
  });
  const milestoneUpdated = await markMilestonePaid(milestoneId);

  const paymentBody = {
    id: payment._id,
    orderId: payment.orderId,
    captureId: payment.captureId,
    status: payment.status,
    amount: payment.amount,
    currency: payment.currency,
    paidAt: payment.paidAt,
  };

  if (!milestoneUpdated) {
    return res.status(202).json({
      message:
        "Payment was captured, but the milestone update is still pending. Retry this request to finish it.",
      payment: paymentBody,
      milestoneStatus: "update_pending",
    });
  }

  return res.status(200).json({
    message,
    payment: paymentBody,
    milestoneStatus: "paid",
  });
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

    // The order ID only locates the Payment. All amounts come from the database.
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
      return sendError(res, 404, "NOT_FOUND", "Milestone not found");
    }

    const project = await Project.findById(milestone.projectId);

    if (!project) {
      return sendError(res, 404, "NOT_FOUND", "Project not found");
    }

    if (project.clientId.toString() !== req.user!._id.toString()) {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "Only the project owner can capture this payment"
      );
    }

    // A completed payment is never captured again and never downgraded.
    // Repair the milestone first if an earlier database update failed.
    if (payment.status === "completed") {
      if (milestone.status !== "paid") {
        await markMilestonePaid(milestone._id);
      }

      return sendError(
        res,
        409,
        "ALREADY_PAID",
        "This milestone has already been paid"
      );
    }

    if (
      milestone.status !== "approved" &&
      milestone.status !== "payment_failed" &&
      milestone.status !== "paid"
    ) {
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
        "This payment previously failed and cannot be captured"
      );
    }

    if (!payment.orderId) {
      return sendError(
        res,
        409,
        "ORDER_ID_MISSING",
        "Payment does not have a PayPal order ID"
      );
    }

    // Ask PayPal for the real order state before capturing or reconciling.
    const paypalOrder = await getPayPalOrder(payment.orderId);

    if (paypalOrder.id !== payment.orderId) {
      return sendError(
        res,
        409,
        "ORDER_MISMATCH",
        "PayPal returned a different order"
      );
    }

    // Payment must still match the milestone, and PayPal must match the Payment.
    const paymentMatchesMilestone =
      amountsMatch(payment.amount, milestone.amount) &&
      sameCurrency(payment.currency, milestone.currency);

    const orderAmount = paypalOrder.purchase_units?.[0]?.amount;

    if (
      !paymentMatchesMilestone ||
      !moneyMatches(orderAmount, payment.amount, payment.currency)
    ) {
      return sendError(
        res,
        409,
        "AMOUNT_MISMATCH",
        "PayPal order amount or currency does not match the milestone"
      );
    }

    // If PayPal already completed the order, reconcile locally.
    // Never issue another capture request.
    if (paypalOrder.status === "COMPLETED") {
      const existingCapture =
        paypalOrder.purchase_units?.[0]?.payments?.captures?.[0];

      if (existingCapture?.status === "PENDING") {
        return res.status(202).json({
          message: "PayPal is still processing this payment",
          payment: {
            id: payment._id,
            orderId: payment.orderId,
            status: payment.status,
          },
        });
      }

      const existingCaptureId = verifiedCaptureId(existingCapture, payment);

      if (!existingCaptureId) {
        return sendError(
          res,
          409,
          "CAPTURE_VERIFICATION_FAILED",
          "PayPal completion could not be verified"
        );
      }

      const reconciled = await completePayment(
        payment._id,
        existingCaptureId
      );

      if (!reconciled) {
        return sendError(
          res,
          503,
          "PAYMENT_STATUS_UNCONFIRMED",
          "Payment status is not yet confirmed. Retry using the same order ID."
        );
      }

      return respondPaymentCompleted(
        res,
        reconciled,
        milestone._id,
        "Payment successfully reconciled"
      );
    }

    if (paypalOrder.status !== "APPROVED") {
      return sendError(
        res,
        409,
        "ORDER_NOT_APPROVED",
        "The PayPal order has not been approved by the payer"
      );
    }

    // ATOMIC CLAIM
    // Exactly one request can win each claim. Only the winner calls PayPal.
    const now = new Date();
    const staleBefore = new Date(now.getTime() - CAPTURE_LOCK_TIMEOUT_MS);

    // A lock is stale if it started long ago, or has no start time (old data).
    const lockIsStale = {
      $or: [
        { captureStartedAt: { $lte: staleBefore } },
        { captureStartedAt: { $exists: false } },
        { captureStartedAt: null },
      ],
    };

    let claimedPayment: typeof payment | null = null;

    if (payment.status === "created") {
      // First attempt: created -> capturing, and create the idempotency key.
      claimedPayment = await Payment.findOneAndUpdate(
        { _id: payment._id, status: "created" },
        {
          $set: {
            status: "capturing",
            captureRequestId: payment.captureRequestId ?? randomUUID(),
            captureStartedAt: now,
          },
        },
        { new: true, runValidators: true }
      );
    } else if (payment.status === "capturing") {
      if (payment.captureRequestId) {
        // Interrupted attempt: take over the lock only if it is stale.
        // The idempotency key is NOT changed.
        claimedPayment = await Payment.findOneAndUpdate(
          {
            _id: payment._id,
            status: "capturing",
            captureRequestId: payment.captureRequestId,
            ...lockIsStale,
          },
          { $set: { captureStartedAt: now } },
          { new: true }
        );
      } else {
        // Legacy record that never stored a key. The order was just confirmed
        // as APPROVED (not captured), so a first key is created here.
        claimedPayment = await Payment.findOneAndUpdate(
          {
            _id: payment._id,
            status: "capturing",
            $and: [
              lockIsStale,
              {
                $or: [
                  { captureRequestId: { $exists: false } },
                  { captureRequestId: null },
                ],
              },
            ],
          },
          {
            $set: {
              captureStartedAt: now,
              captureRequestId: randomUUID(),
            },
          },
          { new: true, runValidators: true }
        );
      }
    }

    // null means another request owns the lock, or the state just changed.
    if (!claimedPayment) {
      const latestPayment = await Payment.findById(payment._id);

      if (latestPayment?.status === "completed") {
        await markMilestonePaid(milestone._id);

        return sendError(
          res,
          409,
          "ALREADY_PAID",
          "This milestone has already been paid"
        );
      }

      return sendError(
        res,
        409,
        "PAYMENT_IN_PROGRESS",
        "Another request is processing this payment. Please retry later."
      );
    }

    if (!claimedPayment.orderId || !claimedPayment.captureRequestId) {
      return sendError(
        res,
        409,
        "PAYMENT_DATA_INVALID",
        "Payment capture information is incomplete"
      );
    }

    // Only the request that won the atomic claim reaches this line.
    const captureResult = await capturePayPalOrder(
      claimedPayment.orderId,
      claimedPayment.captureRequestId
    );

    if (captureResult.id !== claimedPayment.orderId) {
      // Ambiguous: leave the payment in "capturing" for later reconciliation.
      return sendError(
        res,
        409,
        "ORDER_MISMATCH",
        "PayPal returned a different order"
      );
    }

    const capture =
      captureResult.purchase_units?.[0]?.payments?.captures?.[0];

    if (captureResult.status === "COMPLETED") {
      if (capture?.status === "PENDING") {
        return res.status(202).json({
          message: "PayPal is still processing this payment",
          payment: {
            id: claimedPayment._id,
            orderId: claimedPayment.orderId,
            status: claimedPayment.status,
          },
        });
      }

      const captureId = verifiedCaptureId(capture, claimedPayment);

      if (!captureId) {
        // Not marked paid and not marked failed. Stays "capturing".
        return sendError(
          res,
          409,
          "CAPTURE_VERIFICATION_FAILED",
          "PayPal completed the order, but capture details could not be verified"
        );
      }

      const completed = await completePayment(
        claimedPayment._id,
        captureId
      );

      if (!completed) {
        // Stays "capturing"; stale-lock recovery will reconcile with PayPal.
        return sendError(
          res,
          503,
          "PAYMENT_STATUS_UNCONFIRMED",
          "Payment status is not yet confirmed. Retry using the same order ID."
        );
      }

      return respondPaymentCompleted(
        res,
        completed,
        milestone._id,
        "Payment captured successfully"
      );
    }

    if (
      capture?.status === "PENDING" ||
      captureResult.status === "PENDING"
    ) {
      return res.status(202).json({
        message: "PayPal is still processing this payment",
        payment: {
          id: claimedPayment._id,
          orderId: claimedPayment.orderId,
          status: claimedPayment.status,
        },
      });
    }

    if (DEFINITIVE_FAILURE_STATUSES.includes(String(capture?.status))) {
      // Only a payment still in "capturing" can be marked failed.
      const failedPayment = await Payment.findOneAndUpdate(
        { _id: claimedPayment._id, status: "capturing" },
        { $set: { status: "failed" } },
        { new: true }
      );

      if (failedPayment) {
        await Milestone.updateOne(
          { _id: milestone._id, status: { $in: ["approved", "payment_failed"] } },
          { $set: { status: "payment_failed" } }
        );
      }

      return sendError(
        res,
        402,
        "PAYMENT_DECLINED",
        "PayPal declined the payment"
      );
    }

    // Unknown response: keep "capturing". A later retry reconciles with PayPal first.
    return sendError(
      res,
      503,
      "PAYMENT_STATUS_UNCONFIRMED",
      "Payment status is not yet confirmed. Retry using the same order ID."
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

// GET /api/payments/:id
// Project participants can read a single payment record.
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return sendError(res, 400, "INVALID_ID", "Invalid payment ID");
    }

    const payment = await Payment.findById(id);

    if (!payment) {
      return sendError(res, 404, "NOT_FOUND", "Payment not found");
    }

    const milestone = await Milestone.findById(payment.milestoneId);
    const project = milestone ? await Project.findById(milestone.projectId) : null;

    if (!project) {
      return sendError(res, 404, "NOT_FOUND", "Payment not found");
    }

    const userId = req.user!._id.toString();
    const isParticipant =
      project.clientId.toString() === userId ||
      project.freelancerId?.toString() === userId;

    if (!isParticipant) {
      return sendError(res, 404, "NOT_FOUND", "Payment not found");
    }

    return res.status(200).json({
      payment: {
        id: payment._id,
        milestoneId: payment.milestoneId,
        orderId: payment.orderId ?? null,
        captureId: payment.captureId ?? null,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        paidAt: payment.paidAt ?? null,
        createdAt: payment.createdAt,
      },
    });
  } catch (error) {
    console.error(
      "Get payment error:",
      error instanceof Error ? error.name : "unknown error"
    );
    return sendError(res, 500, "PAYMENT_STATUS_ERROR", "Unable to retrieve payment");
  }
});

// POST /api/payments/webhook
// PayPal event notifications. Signature is verified before any state change,
// and each event id is applied at most once (idempotent).
router.post("/webhook", async (req: Request, res: Response) => {
  try {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : JSON.stringify(req.body ?? {});

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return sendError(res, 400, "INVALID_PAYLOAD", "Invalid webhook payload");
    }

    const headers = {
      authAlgo: String(req.headers["paypal-auth-algo"] ?? ""),
      certUrl: String(req.headers["paypal-cert-url"] ?? ""),
      transmissionId: String(req.headers["paypal-transmission-id"] ?? ""),
      transmissionSig: String(req.headers["paypal-transmission-sig"] ?? ""),
      transmissionTime: String(req.headers["paypal-transmission-time"] ?? ""),
    };

    if (Object.values(headers).some((value) => !value)) {
      return sendError(res, 400, "INVALID_HEADERS", "Missing PayPal webhook headers");
    }

    const verified = await verifyPayPalWebhookSignature({
      headers,
      webhookEvent: event,
    });

    if (!verified) {
      return sendError(res, 400, "INVALID_SIGNATURE", "Webhook signature verification failed");
    }

    const eventId = String(event.id ?? "");
    if (!eventId) {
      return sendError(res, 400, "INVALID_PAYLOAD", "Webhook event has no id");
    }

    recordAudit({
      eventType: "payment.webhook",
      eventData: { eventId, eventType: event.event_type },
    });

    // Only completed captures change state. Everything else is acknowledged.
    if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
      return res.status(200).json({ received: true });
    }

    const resource = event.resource ?? {};
    const captureId = String(resource.id ?? "");
    const orderId = String(
      resource.supplementary_data?.related_ids?.order_id ?? ""
    );

    if (!captureId || !orderId) {
      return res.status(200).json({ received: true });
    }

    const payment = await Payment.findOne({ orderId });

    if (!payment) {
      return res.status(200).json({ received: true });
    }

    // Idempotency: an event id is applied at most once per payment.
    if (payment.webhookEventIds?.includes(eventId)) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    const completed = await completePayment(payment._id, captureId);

    if (completed) {
      await Payment.updateOne(
        { _id: payment._id },
        { $addToSet: { webhookEventIds: eventId } }
      );
      await markMilestonePaid(payment.milestoneId);
      recordAudit({
        projectId: undefined,
        milestoneId: payment.milestoneId,
        eventType: "payment.completed",
        eventData: { source: "webhook", eventId, orderId, captureId },
      });
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error(
      "Payment webhook error:",
      error instanceof Error ? error.name : "unknown error"
    );
    return sendError(res, 500, "WEBHOOK_ERROR", "Unable to process webhook");
  }
});

export default router;