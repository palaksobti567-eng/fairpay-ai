
import mongoose, { Document, Schema } from "mongoose";

export type CriterionStatus =
  | "completed"
  | "missing"
  | "unverified";

export type VerificationStatus =
  | "running"
  | "completed"
  | "failed";

export interface IVerificationReport extends Document {
  submissionId: mongoose.Types.ObjectId;
  milestoneId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  freelancerId: mongoose.Types.ObjectId;

  source: "freelancer_claim" | "browser" | "none";

  criteriaSnapshot: {
    id: string;
    text: string;
  }[];

  criteriaResults: {
    criterionId: string;
    status: CriterionStatus;
    reason: string;
  }[];

  summary: string;
  status: VerificationStatus;

  createdAt: Date;
  updatedAt: Date;
}

const verificationReportSchema =
  new Schema<IVerificationReport>(
    {
      submissionId: {
        type: Schema.Types.ObjectId,
        ref: "Submission",
        required: true,
        unique: true,
      },

      milestoneId: {
        type: Schema.Types.ObjectId,
        ref: "Milestone",
        required: true,
        index: true,
      },

      projectId: {
        type: Schema.Types.ObjectId,
        ref: "Project",
        required: true,
        index: true,
      },

      freelancerId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },

      source: {
        type: String,
        enum: ["freelancer_claim", "browser", "none"],
        required: true,
      },

      criteriaSnapshot: [
        {
          id: { type: String, required: true },
          text: { type: String, required: true },
        },
      ],

      criteriaResults: [
        {
          criterionId: { type: String, required: true },
          status: {
            type: String,
            enum: ["completed", "missing", "unverified"],
            required: true,
          },
          reason: { type: String, required: true },
        },
      ],

      summary: {
        type: String,
        required: true,
        maxlength: 1000,
      },

      status: {
        type: String,
        enum: ["running", "completed", "failed"],
        required: true,
      },
    },
    {
      timestamps: true,
    }
  );

export default mongoose.model<IVerificationReport>(
  "VerificationReport",
  verificationReportSchema
);
