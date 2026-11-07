
import mongoose, { Document, Schema } from "mongoose";

export interface IScreenshot extends Document {
  submissionId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  desktop: Buffer;
  mobile: Buffer;
  observations: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const screenshotSchema = new Schema<IScreenshot>(
  {
    submissionId: {
      type: Schema.Types.ObjectId,
      ref: "Submission",
      required: true,
      unique: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    desktop: {
      type: Buffer,
      required: true,
      select: false,
    },
    mobile: {
      type: Buffer,
      required: true,
      select: false,
    },
    observations: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IScreenshot>(
  "Screenshot",
  screenshotSchema
);
