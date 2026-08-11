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

// Postgres deadlock (SQLSTATE 40P01) from a raw query inside a transaction
// (e.g. two concurrent accepts lock-ordering against each other). Depending
// on which call inside the transaction is the deadlock victim, Prisma
// surfaces this two different ways:
//   - a raw query (e.g. $queryRaw) -> PrismaClientKnownRequestError P2010
//     "Raw query failed" with the raw db code in `meta.code`.
//   - a query-builder call (e.g. updateMany) -> PrismaClientUnknownRequestError
//     with no `code`/`meta`, just the Postgres error text in `message`.
// Both must be caught here, or the second case falls through to the generic
// 500 handler and leaks the raw Postgres error message to the client.
export function isDeadlock(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return (
      err.code === "P2010" &&
      (err.meta as { code?: string } | undefined)?.code === "40P01"
    );
  }
  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    return /40P01|deadlock detected/i.test(err.message);
  }
  return false;
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

  if (isDeadlock(err)) {
    res.status(409).json({
      error: "This action conflicted with another request in progress. Please try again.",
      code: "DEADLOCK",
    });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
