/**
 * Reproduces the concurrent-accept deadlock scenario from the deadlock bug
 * card: 40 rounds of 6 concurrent "accept proposal" calls on the same job
 * (240 calls total), bucketed by outcome. Exercises acceptProposal() and
 * errorHandler()/isDeadlock() directly against the local Postgres instance
 * — the same transaction and error-classification code the HTTP endpoint
 * (POST /api/v1/proposals/:id/accept) runs, just without the Express/auth
 * wrapper, so the underlying thrown error class (PrismaClientKnownRequestError
 * vs PrismaClientUnknownRequestError vs AppError) stays visible for the
 * breakdown below instead of being collapsed into a single JSON body.
 *
 * Usage: npm run test:deadlock-race -w @hive-freelance/api
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextFunction, Request, Response } from "express";
import { Prisma, prisma } from "@hive-freelance/db";
import { AppError, errorHandler } from "../src/lib/errors.js";
import { acceptProposal } from "../src/services/proposals.js";

const rootDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
loadEnv({ path: resolve(rootDir, ".env") });

const ROUNDS = 40;
const CONCURRENCY = 6;

function classifyThrown(err: unknown): {
  status: number;
  code?: string;
  errClass: string;
} {
  const errClass =
    err instanceof Prisma.PrismaClientKnownRequestError
      ? `PrismaClientKnownRequestError (${err.code})`
      : err instanceof Prisma.PrismaClientUnknownRequestError
        ? "PrismaClientUnknownRequestError"
        : err instanceof AppError
          ? "AppError"
          : err instanceof Error
            ? err.constructor.name
            : "unknown";

  let capturedStatus = 0;
  let capturedBody: { code?: string } | undefined;
  const mockRes = {
    status(code: number) {
      capturedStatus = code;
      return mockRes;
    },
    json(body: { code?: string }) {
      capturedBody = body;
      return mockRes;
    },
  };
  errorHandler(
    err,
    {} as Request,
    mockRes as unknown as Response,
    (() => {}) as NextFunction,
  );
  return { status: capturedStatus, code: capturedBody?.code, errClass };
}

async function seedUsers() {
  const client = await prisma.user.upsert({
    where: { hiveUsername: "racetest-client" },
    update: {},
    create: { hiveUsername: "racetest-client", role: "client" },
  });
  const freelancers = [];
  for (let i = 1; i <= CONCURRENCY; i++) {
    freelancers.push(
      await prisma.user.upsert({
        where: { hiveUsername: `racetest-freelancer-${i}` },
        update: {},
        create: { hiveUsername: `racetest-freelancer-${i}`, role: "freelancer" },
      }),
    );
  }
  return { client, freelancers };
}

async function seedRound(clientId: bigint, freelancers: { id: bigint }[]) {
  const job = await prisma.job.create({
    data: {
      clientId,
      title: "Deadlock race test job",
      description: "Seeded by scripts/deadlock-race-test.ts",
      budget: 100,
      status: "open",
    },
  });
  const proposals = await Promise.all(
    freelancers.map((f) =>
      prisma.proposal.create({
        data: {
          jobId: job.id,
          freelancerId: f.id,
          coverLetter: "race test",
          bidAmount: 100,
          status: "pending",
        },
      }),
    ),
  );
  return { job, proposals };
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

async function main() {
  console.log("Seeding race-test users...");
  const { client, freelancers } = await seedUsers();

  const httpBuckets = new Map<string, number>();
  const errClassBuckets = new Map<string, number>();
  const jobIds: bigint[] = [];
  let total = 0;

  for (let round = 1; round <= ROUNDS; round++) {
    const { job, proposals } = await seedRound(client.id, freelancers);
    jobIds.push(job.id);

    const results = await Promise.allSettled(
      proposals.map((p) => acceptProposal(p.id.toString(), client.id.toString())),
    );

    for (const r of results) {
      total++;
      if (r.status === "fulfilled") {
        bump(httpBuckets, "200 OK");
        bump(errClassBuckets, "OK");
        continue;
      }
      const { status, code, errClass } = classifyThrown(r.reason);
      const bucketKey =
        status === 409 && code === "DEADLOCK"
          ? "409 DEADLOCK"
          : status === 409
            ? "409 (other AppError)"
            : status === 500
              ? "500 INTERNAL (should be zero)"
              : `${status} (other)`;
      bump(httpBuckets, bucketKey);
      bump(errClassBuckets, errClass);
    }

    if (round % 10 === 0) console.log(`  round ${round}/${ROUNDS} done`);
  }

  console.log(`\nCleaning up ${jobIds.length} seeded jobs...`);
  await prisma.job.deleteMany({ where: { id: { in: jobIds } } });

  console.log(
    `\n=== Deadlock race test: ${ROUNDS} rounds x ${CONCURRENCY} concurrent accepts = ${total} calls ===\n`,
  );
  console.log("By HTTP outcome (status errorHandler would send the client):");
  for (const [k, v] of [...httpBuckets.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(32)} ${v}`);
  }
  console.log("\nBy thrown error class (server-side):");
  for (const [k, v] of [...errClassBuckets.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(38)} ${v}`);
  }

  const internal500 = httpBuckets.get("500 INTERNAL (should be zero)") ?? 0;
  console.log(
    `\nZero 500s: ${internal500 === 0 ? "YES" : `NO (${internal500} found)`}`,
  );

  await prisma.$disconnect();
  if (internal500 > 0) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exitCode = 1;
});
