
import mongoose, { Document, Schema } from "mongoose";

export type PaymentStatus =
  | "created"
  | "capturing"
  | "completed"
  | "failed";

export interface IPayment extends Document {
  milestoneId: mongoose.Types.ObjectId;
  orderId?: string;
  captureId?: string;
  requestId: string;
  captureRequestId?: string;
  captureStartedAt?: Date;
  webhookEventIds?: string[];
  status: PaymentStatus;
  amount: number;
  currency: string;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    milestoneId: {
      type: Schema.Types.ObjectId,
      ref: "Milestone",
      required: true,
    },
    orderId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    captureId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    requestId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    captureRequestId: {
      type: String,
      trim: true,
   },
   captureStartedAt: {
      type: Date,
},
    webhookEventIds: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["created", "capturing", "completed", "failed"],
      default: "created",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 3,
    },
    paidAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

paymentSchema.index(
  { milestoneId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["created", "capturing", "completed"] },
    },
  }
);

export default mongoose.model<IPayment>("Payment", paymentSchema);
