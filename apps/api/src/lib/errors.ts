import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@hive-freelance/db";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void fn(req, res, next).catch(next);
  };
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION",
      details: err.issues,
    });
    return;
  }

  // body-parser JSON syntax errors
  if (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status?: number }).status === 400 &&
    "type" in err &&
    (err as { type?: string }).type === "entity.parse.failed"
  ) {
    res.status(400).json({ error: "Invalid JSON body", code: "BAD_JSON" });
    return;
  }

  // Postgres deadlock (SQLSTATE 40P01) from a raw query inside a
  // transaction (e.g. two concurrent accepts lock-ordering against each
  // other) — Prisma wraps this as P2010 "Raw query failed" with the raw db
  // code in `meta`. Without this, it falls through to the generic 500
  // below and leaks the raw Postgres error message (including internal
  // process/transaction IDs) straight to the client.
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2010" &&
    (err.meta as { code?: string } | undefined)?.code === "40P01"
  ) {
    res.status(409).json({
      error: "This action conflicted with another request in progress. Please try again.",
      code: "DEADLOCK",
    });
    return;
  }

  console.error(err);
  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ error: message });
}
