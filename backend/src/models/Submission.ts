
import mongoose, { Document, Schema } from "mongoose";

export type SubmissionSource = "freelancer_claim" | "browser" | "none";

export interface ISubmission extends Document {
  milestoneId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  freelancerId: mongoose.Types.ObjectId;
  description: string;
  previewUrl?: string;
  source: SubmissionSource;
  createdAt: Date;
}

const submissionSchema = new Schema<ISubmission>(
  {
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
      index: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },

    previewUrl: {
      type: String,
      trim: true,
      maxlength: 2000,
    },

    source: {
      type: String,
      enum: ["freelancer_claim", "browser", "none"],
      default: "freelancer_claim",
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export default mongoose.model<ISubmission>(
  "Submission",
  submissionSchema
);
