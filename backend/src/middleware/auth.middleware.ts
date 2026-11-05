
import { Request, Response, NextFunction } from "express";
import User, { UserRole, IUser } from "../models/User";
import { verifyToken } from "../utils/jwt";
import { sendError } from "../utils/errors";

declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return sendError(res, 401, "AUTH_REQUIRED", "Authentication required");
    }

    const token = authHeader.slice(7);
    const { userId } = verifyToken(token);

    const user = await User.findById(userId);

    if (!user) {
      return sendError(res, 401, "INVALID_TOKEN", "Invalid or expired token");
    }

    req.user = user;
    next();
  } catch {
    return sendError(res, 401, "INVALID_TOKEN", "Invalid or expired token");
  }
}

export function requireRole(role: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, 401, "AUTH_REQUIRED", "Authentication required");
    }

    if (req.user.role !== role) {
      return sendError(res, 403, "FORBIDDEN", "Access forbidden");
    }

    next();
  };
}

