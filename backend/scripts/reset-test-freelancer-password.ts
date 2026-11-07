
import "dotenv/config";
import mongoose from "mongoose";

import { connectDB } from "../src/config/db";
import User from "../src/models/User";
import { hashPassword } from "../src/utils/password";

async function main() {
  const email = "freelancer.test@example.com";
  const password = process.env.TEST_FREELANCER_PASSWORD;

  if (!password || password.length < 8) {
    throw new Error("A valid test password is required.");
  }

  await connectDB();

  const freelancer = await User.findOne({
    email,
    role: "freelancer",
  });

  if (!freelancer) {
    throw new Error("Test freelancer account not found.");
  }

  freelancer.passwordHash = await hashPassword(password);
  await freelancer.save();

  console.log("Freelancer test password reset successfully.");
}

main()
  .catch((error) => {
    console.error("Password reset failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
