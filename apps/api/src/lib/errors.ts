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
//
// This must match on structured fields, not free text: PrismaClientUnknownRequestError's
// `message` embeds Postgres' DETAIL line, which includes the user's own submitted
// field values (e.g. a profile bio) — a free-text/regex search over the whole message
// lets a user spoof a 409 by putting the trigger phrase in their own data. The driver's
// `PostgresError { code: "40P01"` prefix precedes any user-supplied data in the message,
// so anchoring on it is safe.
export function isDeadlock(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return (
      err.code === "P2034" ||
      (err.code === "P2010" &&
        (err.meta as { code?: string } | undefined)?.code === "40P01")
    );
  }
  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    return /PostgresError \{ code: "40P01"/.test(err.message);
  }
  return false;
}

export function errorHandler(
  err: unknown,
  req: Request,
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

  // body-parser payload-too-large (raw-body's PayloadTooLargeError, thrown
  // by express.json() whenever the raw request body exceeds its 100KB
  // default before any route or Zod schema ever sees it — e.g. a
  // multi-byte cover_letter that's under a character-count cap but well
  // over the byte one). Same shape as entity.parse.failed above, just a
  // 413 instead of a 400. Not field-specific — this is a whole-request
  // limit, so it's caught here rather than in any one route, and this
  // failure mode isn't unique to proposals; any oversized body anywhere
  // in the app would otherwise fall through to the raw 500 below.
  if (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    (err as { type?: string }).type === "entity.too.large"
  ) {
    res.status(413).json({ error: "Request body is too large", code: "PAYLOAD_TOO_LARGE" });
    return;
  }

  if (isDeadlock(err)) {
    console.warn(
      `[deadlock] ${req.method} ${req.originalUrl} params=${JSON.stringify(req.params)}`,
    );
    res.status(409).json({
      error: "This action conflicted with another request in progress. Please try again.",
      code: "DEADLOCK",
    });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
