import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
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

test("isDeadlock matches PrismaClientUnknownRequestError with a deadlock message", () => {
  const err = new Prisma.PrismaClientUnknownRequestError(
    "Invalid `tx.proposal.updateMany()` invocation: deadlock detected",
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

test("errorHandler maps a PrismaClientUnknownRequestError deadlock to 409, not 500", () => {
  const err = new Prisma.PrismaClientUnknownRequestError(
    "Invalid `tx.proposal.updateMany()` invocation:\n" +
      "deadlock detected\nDETAIL: Process 123 waits for ShareLock on transaction 456.",
    { clientVersion: "6.0.0" },
  );
  const res = createMockResponse();

  errorHandler(err, {} as Request, res as unknown as Response, () => {});

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    error: "This action conflicted with another request in progress. Please try again.",
    code: "DEADLOCK",
  });
});
