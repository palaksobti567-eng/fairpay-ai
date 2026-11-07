
import "dotenv/config";
import mongoose from "mongoose";

import { connectDB } from "../src/config/db";
import User from "../src/models/User";
import { hashPassword } from "../src/utils/password";

async function main() {
  const name = process.env.TEST_FREELANCER_NAME;
  const email = process.env.TEST_FREELANCER_EMAIL;
  const password = process.env.TEST_FREELANCER_PASSWORD;

  if (!name || !email || !password) {
    throw new Error("Test freelancer environment variables are missing.");
  }

  if (password.length < 8) {
    throw new Error("Test password must contain at least 8 characters.");
  }

  await connectDB();

  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await User.findOne({
    email: normalizedEmail,
  });

  if (existingUser) {
    if (existingUser.role !== "freelancer") {
      throw new Error(
        "This email already belongs to a non-freelancer account."
      );
    }

    console.log("Freelancer account already exists.");
    console.log("User ID:", existingUser._id.toString());
    return;
  }

  const passwordHash = await hashPassword(password);

  const freelancer = await User.create({
    name,
    email: normalizedEmail,
    passwordHash,
    role: "freelancer",
  });

  console.log("Test freelancer created successfully.");
  console.log("User ID:", freelancer._id.toString());
  console.log("Role:", freelancer.role);
}

main()
  .catch((error) => {
    console.error(
      "Test freelancer creation failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
