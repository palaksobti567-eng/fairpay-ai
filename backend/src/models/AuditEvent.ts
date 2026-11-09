import mongoose, { Document, Schema } from "mongoose";

export interface IAuditEvent extends Document {
  actorId: mongoose.Types.ObjectId;
  projectId?: mongoose.Types.ObjectId;
  milestoneId?: mongoose.Types.ObjectId;
  eventType: string;
  eventData?: Record<string, unknown>;
  createdAt: Date;
}

const auditEventSchema = new Schema<IAuditEvent>(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      index: true,
    },
    milestoneId: {
      type: Schema.Types.ObjectId,
      ref: "Milestone",
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      index: true,
    },
    eventData: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export default mongoose.model<IAuditEvent>("AuditEvent", auditEventSchema);
