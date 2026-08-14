import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import createHttpError from "http-errors";
import { Prisma } from "@hive-freelance/db";
import { errorHandler, isDeadlock } from "./errors.js";

function createMockResponse() {
  const res = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

test("isDeadlock matches PrismaClientUnknownRequestError with a real Postgres 40P01 error", () => {
  const err = new Prisma.PrismaClientUnknownRequestError(
    'Invalid `tx.proposal.updateMany()` invocation:\n\n\n' +
      'Invalid query: PostgresError { code: "40P01", message: "deadlock detected", ' +
      'severity: "ERROR", detail: Some("Process 123 waits for ShareLock on transaction 456; blocked by process 789."), ' +
      'column: None, hint: None }',
    { clientVersion: "6.0.0" },
  );
  assert.equal(isDeadlock(err), true);
});

test("isDeadlock ignores an unrelated PrismaClientUnknownRequestError", () => {
  const err = new Prisma.PrismaClientUnknownRequestError("connection reset", {
    clientVersion: "6.0.0",
  });
  assert.equal(isDeadlock(err), false);
});

test("isDeadlock ignores user-controlled text that spoofs the old free-text pattern", () => {
  // Reproduces the false positive from review: a profile upsert whose bio
  // contains the trigger phrase, surfaced via Postgres' DETAIL line (which
  // embeds the row's own submitted values), with no PostgresError code
  // field at all — this is a check-constraint violation, not a deadlock.
  const err = new Prisma.PrismaClientUnknownRequestError(
    "Invalid `prisma.profile.upsert()` invocation:\n\n\n" +
      'Raw query failed. Code: `23514`. Message: `ERROR: new row for relation "profiles" ' +
      'violates check constraint "profiles_hourly_rate_check"\n' +
      "DETAIL: Failing row contains (1, 1, Ex-Postgres DBA. Ask me about deadlock detected errors., " +
      "..., 0.00, ...).`",
    { clientVersion: "6.0.0" },
  );
  assert.equal(isDeadlock(err), false);
});

test("isDeadlock matches PrismaClientKnownRequestError P2034 (Prisma's documented deadlock code)", () => {
  const err = new Prisma.PrismaClientKnownRequestError(
    "Transaction failed due to a write conflict or a deadlock. Please retry your transaction",
    { code: "P2034", clientVersion: "6.0.0" },
  );
  assert.equal(isDeadlock(err), true);
});

test("errorHandler maps a PrismaClientUnknownRequestError deadlock to 409, not 500", () => {
  const err = new Prisma.PrismaClientUnknownRequestError(
    'Invalid `tx.proposal.updateMany()` invocation:\n\n\n' +
      'Invalid query: PostgresError { code: "40P01", message: "deadlock detected", ' +
      'severity: "ERROR", detail: Some("Process 123 waits for ShareLock on transaction 456; blocked by process 789."), ' +
      'column: None, hint: None }',
    { clientVersion: "6.0.0" },
  );
  const res = createMockResponse();

  errorHandler(
    err,
    { method: "POST", originalUrl: "/api/v1/proposals/abc/accept", params: { id: "abc" } } as unknown as Request,
    res as unknown as Response,
    () => {},
  );

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    error: "This action conflicted with another request in progress. Please try again.",
    code: "DEADLOCK",
  });
});

test("errorHandler maps body-parser's PayloadTooLargeError to a clean 413, not 500", () => {
  // Same shape raw-body/body-parser actually throws when express.json()'s
  // body-size limit is exceeded (e.g. a multi-byte cover_letter well under
  // a character cap but over the 100KB byte one) — status/statusCode 413,
  // type "entity.too.large". Before this branch existed, this fell through
  // to the generic 500 handler — a wrong status (500 instead of 413) with
  // the generic { error: "Internal server error" } body, not a leak of the
  // real error message (the catch-all branch never echoes err.message).
  const err = createHttpError(413, "request entity too large", {
    length: 200_000,
    limit: 102_400,
    expected: 200_000,
    type: "entity.too.large",
  });
  const res = createMockResponse();

  errorHandler(
    err,
    { method: "POST", originalUrl: "/api/v1/jobs/1/proposals", params: {} } as unknown as Request,
    res as unknown as Response,
    () => {},
  );

  assert.equal(res.statusCode, 413);
  assert.deepEqual(res.body, {
    error: "Request body is too large",
    code: "PAYLOAD_TOO_LARGE",
  });
});
