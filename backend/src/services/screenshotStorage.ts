
import mongoose from "mongoose";
import Screenshot from "../models/Screenshot";
import type { InspectionObservations } from "./inspector";

const MAX_IMAGE_SIZE = 3 * 1024 * 1024;

interface SaveScreenshotInput {
  submissionId: string;
  projectId: string;
  desktop: Buffer;
  mobile: Buffer;
  observations: InspectionObservations;
}

export async function saveInspectionScreenshots(
  input: SaveScreenshotInput
) {
  if (
    !mongoose.isValidObjectId(input.submissionId) ||
    !mongoose.isValidObjectId(input.projectId)
  ) {
    throw new Error("Invalid screenshot ownership reference");
  }

  for (const image of [input.desktop, input.mobile]) {
    if (
      !Buffer.isBuffer(image) ||
      image.length === 0 ||
      image.length > MAX_IMAGE_SIZE ||
      image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
    ) {
      throw new Error("Invalid screenshot image");
    }
  }

  return Screenshot.findOneAndUpdate(
    { submissionId: input.submissionId },
    {
      $set: {
        projectId: input.projectId,
        desktop: input.desktop,
        mobile: input.mobile,
        observations: input.observations,
      },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  ).select("_id submissionId projectId createdAt updatedAt");
}
