import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@hive-freelance/db";
import { AppError } from "../lib/errors.js";
import { JWT_COOKIE, verifyToken, type JwtPayload } from "../lib/jwt.js";

export type AuthUser = JwtPayload & { id: string };

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const token = extractToken(req);
    if (token) {
      const payload = verifyToken(token);
      req.user = { ...payload, id: payload.sub };
    }
  } catch {
    // ignore invalid token for optional auth
  }
  next();
}

export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const token = extractToken(req);
    if (!token) {
      throw new AppError(401, "Authentication required", "UNAUTHORIZED");
    }
    const payload = verifyToken(token);
    req.user = { ...payload, id: payload.sub };
    next();
  } catch (err) {
    if (err instanceof AppError) next(err);
    else next(new AppError(401, "Invalid or expired token", "UNAUTHORIZED"));
  }
}

function extractToken(req: Request): string | undefined {
  const cookie = req.cookies?.[JWT_COOKIE] as string | undefined;
  if (cookie) return cookie;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return undefined;
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, "Authentication required", "UNAUTHORIZED"));
      return;
    }
    const role = req.user.role;
    const ok =
      roles.includes(role) ||
      (role === "both" &&
        (roles.includes("client") || roles.includes("freelancer")));
    if (!ok) {
      next(new AppError(403, "Insufficient role", "FORBIDDEN"));
      return;
    }
    next();
  };
}

export function requireClient(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  requireRole("client", "both")(req, res, next);
}

export function requireFreelancer(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  requireRole("freelancer", "both")(req, res, next);
}

/** 403 if the same user would be both client and freelancer on one contract. */
export function assertNotSelfContract(
  clientId: string,
  freelancerId: string,
): void {
  if (clientId === freelancerId) {
    throw new AppError(
      403,
      "Cannot be both client and freelancer on the same contract",
      "SELF_CONTRACT",
    );
  }
}
