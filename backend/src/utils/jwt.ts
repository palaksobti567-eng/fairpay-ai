
import jwt from "jsonwebtoken";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is missing from environment variables.");
  }

  return secret;
}

// Generate a token valid for 7 days
export function generateToken(userId: string): string {
  return jwt.sign(
    { userId },
    getJwtSecret(),
    { expiresIn: "7d" }
  );
}

// Verify the token and extract the user ID
export function verifyToken(token: string): { userId: string } {
  const decoded = jwt.verify(token, getJwtSecret());

  if (
    typeof decoded === "string" ||
    typeof decoded.userId !== "string"
  ) {
    throw new Error("Invalid token payload.");
  }

  return { userId: decoded.userId };
}
