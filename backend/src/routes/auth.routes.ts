
import { Router } from "express";
import User from "../models/User";
import { hashPassword, comparePassword } from "../utils/password";
import { generateToken } from "../utils/jwt";
import { registerSchema, loginSchema } from "../validators/auth.validator";
import { requireAuth } from "../middleware/auth.middleware";
import { sendError } from "../utils/errors";

const router = Router();

// REGISTER
router.post("/register", async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      return sendError(
        res,
        400,
        "VALIDATION_ERROR",
        "Invalid registration data",
        parsed.error.issues
      );
    }

    const { name, email, password } = parsed.data;

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return sendError(
        res,
        409,
        "EMAIL_TAKEN",
        "Email already registered"
      );
    }

    const passwordHash = await hashPassword(password);

    const user = await User.create({
      name,
      email,
      passwordHash,
      role: "client",
    });

    const token = generateToken(user._id.toString());

    return res.status(201).json({
      message: "Registration successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      return sendError(
        res,
        409,
        "EMAIL_TAKEN",
        "Email already registered"
      );
    }

    return sendError(
      res,
      500,
      "INTERNAL_ERROR",
      "Internal server error"
    );
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return sendError(
        res,
        400,
        "VALIDATION_ERROR",
        "Invalid login data",
        parsed.error.issues
      );
    }

    const { email, password } = parsed.data;

    const user = await User.findOne({ email }).select("+passwordHash");

    if (!user || !(await comparePassword(password, user.passwordHash))) {
      return sendError(
        res,
        401,
        "INVALID_CREDENTIALS",
        "Invalid email or password"
      );
    }

    const token = generateToken(user._id.toString());

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return sendError(
      res,
      500,
      "INTERNAL_ERROR",
      "Internal server error"
    );
  }
});

// GET CURRENT USER
router.get("/me", requireAuth, (req, res) => {
  const user = req.user!;

  return res.status(200).json({
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
  });
});

export default router;
