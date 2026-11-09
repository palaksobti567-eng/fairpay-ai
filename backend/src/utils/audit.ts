import AuditEvent from "../models/AuditEvent";
import mongoose from "mongoose";

type AuditInput = {
  actorId?: string | mongoose.Types.ObjectId | null;
  projectId?: string | mongoose.Types.ObjectId | null;
  milestoneId?: string | mongoose.Types.ObjectId | null;
  eventType: string;
  eventData?: Record<string, unknown>;
};

// Fire-and-forget audit write. Never blocks or fails the request path.
export function recordAudit(input: AuditInput): void {
  AuditEvent.create({
    actorId: input.actorId ?? undefined,
    projectId: input.projectId ?? undefined,
    milestoneId: input.milestoneId ?? undefined,
    eventType: input.eventType,
    eventData: input.eventData,
  }).catch((error) => {
    console.error(
      "Audit write failed:",
      error instanceof Error ? error.name : "unknown error"
    );
  });
}
