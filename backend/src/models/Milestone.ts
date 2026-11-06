

import mongoose, { Document, Schema } from "mongoose";

export type MilestoneStatus =
  | "draft"
  | "criteria_approved"
  | "in_progress"
  | "submitted"
  | "verifying"
  | "verified"
  | "approved"
  | "paid"
  | "rejected"
  | "payment_failed";

export interface IMilestone extends Document {
  projectId: mongoose.Types.ObjectId;
  title: string;
  amount: number;
  currency: string;
  paymentStatus: "not_started" | "simulated";
  paymentSimulatedAt?: Date;
  paymentReference?: string;
  status: MilestoneStatus;
  criteria: {
    id: string;
    text: string;
  }[];
  submissionDescription?: string;
  rejectionReason?: string;
  evidenceLinks: string[];
  createdAt: Date;
}

const milestoneSchema = new Schema<IMilestone>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    rejectionReason: {
  type: String,
  trim: true,
  maxlength: 1000,
},

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
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
    status: {
      type: String,
      enum: [
        "draft",
        "criteria_approved",
        "in_progress",
        "submitted",
        "verifying",
        "verified",
        "approved",
        "paid",
        "rejected",
        "payment_failed",
      ],
      default: "draft",
    },
    criteria: [
      {
        id: {
          type: String,
          required: true,
        },
        text: {
          type: String,
          required: true,
          trim: true,
          maxlength: 1000,
        },
      },
    ],
    paymentStatus: {
  type: String,
  enum: ["not_started", "simulated"],
  default: "not_started",
  required: true,
},

paymentSimulatedAt: {
  type: Date,
},

paymentReference: {
  type: String,
  trim: true,
},
    submissionDescription: {
      type: String,
      trim: true,
      maxlength: 3000,
    },
    evidenceLinks: {
      type: [String],
      default: [],
      validate: {
        validator: (links: string[]) => links.length <= 10,
        message: "Maximum 10 evidence links are allowed",
      },
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export default mongoose.model<IMilestone>(
  "Milestone",
  milestoneSchema
);
