import assert from "node:assert/strict";
import { test } from "node:test";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "@hive-freelance/db";
import { AppError } from "../lib/errors.js";
import { acceptProposal, listProposalsForJob, submitProposal } from "./proposals.js";
import { submitProposalBodySchema } from "../routes/proposals.js";

// Real Postgres, same pattern as scripts/deadlock-race-test.ts — these tests
// exercise the actual Prisma queries/transactions/constraints, not mocks.
const rootDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
loadEnv({ path: resolve(rootDir, ".env") });

let seq = 0;
function uniqueSuffix() {
  seq += 1;
  return `${Date.now()}-${process.pid}-${seq}`;
}

async function createUser(role: "client" | "freelancer") {
  return prisma.user.create({
    data: { hiveUsername: `proptest-${role}-${uniqueSuffix()}`, role },
  });
}

async function createOpenJob(clientId: bigint) {
  return prisma.job.create({
    data: {
      clientId,
      title: "Proposals follow-up test job",
      description: "Seeded by services/proposals.test.ts",
      budget: 500,
      status: "open",
    },
  });
}

async function assertRejectsWith(
  promise: Promise<unknown>,
  status: number,
  code?: string,
) {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof AppError, `expected AppError, got ${String(err)}`);
    assert.equal(err.statusCode, status);
    if (code != null) assert.equal(err.code, code);
    return true;
  });
}

test("submitProposalBodySchema bounds cover_letter by UTF-8 byte length, not character count", () => {
  const base = {
    bid_amount: 100,
    milestones: [{ title: "M1", amount: 100, duration: "1 week" }],
  };

  // 50,000 single-byte chars = 50,000 bytes: right at the cap, still ok.
  const okAscii = submitProposalBodySchema.safeParse({ ...base, cover_letter: "x".repeat(50_000) });
  assert.equal(okAscii.success, true);

  const tooLongAscii = submitProposalBodySchema.safeParse({ ...base, cover_letter: "x".repeat(50_001) });
  assert.equal(tooLongAscii.success, false);

  // The bug this closes: a character-count cap doesn't see multi-byte
  // content coming. 15,000 CJK chars is 45,000 UTF-8 bytes — under the
  // byte cap despite being nowhere near the old 100,000-char one either
  // way, so this is really pinning the *byte* math, not just re-testing
  // the same boundary in a different alphabet.
  const okCjk = submitProposalBodySchema.safeParse({ ...base, cover_letter: "測".repeat(15_000) });
  assert.equal(okCjk.success, true);

  // 20,000 CJK chars = 60,000 UTF-8 bytes: over the 50,000-byte cap, but
  // only 20,000 *characters* — the old cap would have waved this through.
  const tooLongCjk = submitProposalBodySchema.safeParse({ ...base, cover_letter: "測".repeat(20_000) });
  assert.equal(tooLongCjk.success, false);
});

test("listProposalsForJob paginates like listJobs (page/limit, capped at 50, newest first)", async () => {
  const client = await createUser("client");
  const job = await createOpenJob(client.id);
  const freelancers = await Promise.all([
    createUser("freelancer"),
    createUser("freelancer"),
    createUser("freelancer"),
  ]);

  // Explicit, spaced-out createdAt so ordering is deterministic regardless
  // of how fast these inserts actually run.
  const base = Date.now();
  for (let i = 0; i < freelancers.length; i++) {
    await prisma.proposal.create({
      data: {
        jobId: job.id,
        freelancerId: freelancers[i].id,
        coverLetter: `proposal ${i}`,
        bidAmount: 100 + i,
        status: "pending",
        createdAt: new Date(base + i * 1000),
      },
    });
  }

  const pageOne = await listProposalsForJob(job.id.toString(), client.id.toString(), {
    page: 1,
    limit: 2,
  });
  assert.equal(pageOne.page, 1);
  assert.equal(pageOne.limit, 2);
  assert.equal(pageOne.items.length, 2);
  // Newest first: index 2 was created last.
  assert.equal(pageOne.items[0].cover_letter, "proposal 2");
  assert.equal(pageOne.items[1].cover_letter, "proposal 1");

  const pageTwo = await listProposalsForJob(job.id.toString(), client.id.toString(), {
    page: 2,
    limit: 2,
  });
  assert.equal(pageTwo.items.length, 1);
  assert.equal(pageTwo.items[0].cover_letter, "proposal 0");

  const overLimit = await listProposalsForJob(job.id.toString(), client.id.toString(), {
    limit: 999,
  });
  assert.equal(overLimit.limit, 50);
});

test("submitProposal and acceptProposal both reject self-dealing via the shared assertNotSelfContract helper (same code)", async () => {
  const client = await createUser("client");
  const job = await createOpenJob(client.id);

  // submitProposal's own path: client tries to propose on their own job.
  await assertRejectsWith(
    submitProposal(job.id.toString(), client.id.toString(), {
      cover_letter: "self bid",
      bid_amount: 100,
      milestones: [{ title: "M1", amount: 100, duration: "1 week" }],
    }),
    403,
    "SELF_CONTRACT",
  );

  // acceptProposal's path: a proposal that (however it got there) has the
  // same user as both the job's client and the proposal's freelancer.
  // submitProposal already blocks this from ever happening through the
  // API, so this proposal is seeded directly to exercise acceptProposal's
  // own guard, not to claim this state is reachable normally.
  const selfProposal = await prisma.proposal.create({
    data: {
      jobId: job.id,
      freelancerId: client.id,
      coverLetter: "seeded self-deal",
      bidAmount: 100,
      status: "pending",
    },
  });
  await assertRejectsWith(
    acceptProposal(selfProposal.id.toString(), client.id.toString()),
    403,
    "SELF_CONTRACT",
  );
});

test("acceptProposal checks ownership before job status (non-owner gets 403, not 409, on a non-open job)", async () => {
  const client = await createUser("client");
  const otherClient = await createUser("client");
  const freelancer = await createUser("freelancer");
  const job = await createOpenJob(client.id);
  const proposal = await prisma.proposal.create({
    data: {
      jobId: job.id,
      freelancerId: freelancer.id,
      coverLetter: "ordering test",
      bidAmount: 100,
      status: "pending",
    },
  });

  // Flip the job to a non-open status directly (no cancel-with-pending-
  // proposals flow exists to exercise this through the API).
  await prisma.job.update({ where: { id: job.id }, data: { status: "cancelled" } });

  // A non-owner calling accept on this now-cancelled job must get 403
  // (ownership) rather than 409 (status) — the same probe-ordering fix
  // already applied to getAcceptCustomJson.
  await assertRejectsWith(
    acceptProposal(proposal.id.toString(), otherClient.id.toString()),
    403,
  );
});

test("proposal_milestones rejects amount <= 0 at the database level (CHECK constraint)", async () => {
  const client = await createUser("client");
  const freelancer = await createUser("freelancer");
  const job = await createOpenJob(client.id);
  const proposal = await prisma.proposal.create({
    data: {
      jobId: job.id,
      freelancerId: freelancer.id,
      coverLetter: "check constraint test",
      bidAmount: 100,
      status: "pending",
    },
  });

  // Raw insert, bypassing app-level zod validation entirely — this proves
  // the database itself refuses the row, not just the API layer.
  await assert.rejects(
    prisma.$executeRaw`INSERT INTO proposal_milestones (proposal_id, title, amount, duration, milestone_order)
      VALUES (${proposal.id}, 'Bad milestone', 0, '1 week', 0)`,
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      assert.match(message, /proposal_milestones_amount_check|check constraint|23514/i);
      return true;
    },
  );

  await assert.rejects(
    prisma.$executeRaw`INSERT INTO proposal_milestones (proposal_id, title, amount, duration, milestone_order)
      VALUES (${proposal.id}, 'Negative milestone', -5, '1 week', 0)`,
  );
});
