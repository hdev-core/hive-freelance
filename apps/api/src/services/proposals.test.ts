import assert from "node:assert/strict";
import { after, test } from "node:test";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "@hive-freelance/db";
import { AppError } from "../lib/errors.js";
import { acceptProposal, listProposalsForJob, rejectProposal, submitProposal } from "./proposals.js";
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

// Every user this file creates, so after() can clean the whole tree up in
// one shot. Job/Proposal/Contract/Milestone/etc. all cascade off User (see
// schema.prisma — Job.client, Proposal.freelancer, Contract.client/
// freelancer, ProposalMilestone.proposal are all onDelete: Cascade), so
// deleting the users this suite created is enough; nothing else needs its
// own tracking list. Without this, every run left ~10 users plus their
// jobs/proposals behind — which once directly caused a migration re-add to
// fail against leftover amount=0 rows from a mutated CHECK-constraint test.
const createdUserIds: bigint[] = [];

after(async () => {
  if (createdUserIds.length === 0) return;
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

async function createUser(role: "client" | "freelancer") {
  const user = await prisma.user.create({
    data: { hiveUsername: `proptest-${role}-${uniqueSuffix()}`, role },
  });
  createdUserIds.push(user.id);
  return user;
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
  // content coming. cover_letter was unbounded on develop (z.string().min(1))
  // — there was no character cap to compare against — so 15,000 CJK chars
  // (45,000 UTF-8 bytes, under this byte cap) and 20,000 CJK chars (60,000
  // bytes, over it) are here to pin the *byte* math itself, not to re-test
  // some prior boundary in a different alphabet.
  const okCjk = submitProposalBodySchema.safeParse({ ...base, cover_letter: "測".repeat(15_000) });
  assert.equal(okCjk.success, true);

  // 20,000 CJK chars = 60,000 UTF-8 bytes: over the 50,000-byte cap, but
  // only 20,000 *characters* — a naive character-count check would have
  // waved this through; the byte-based check correctly rejects it.
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

test("centsAmount rejects an amount that rounds to zero (1e-9), before the DB is ever touched", () => {
  const base = {
    cover_letter: "repro",
    milestones: [{ title: "Real work", amount: 100, duration: "1w" }],
  };

  // The exact review repro: 1e-9 passes .positive() (it's > 0) and the
  // epsilon-around-a-cent refine (it's well within 1e-6 of 0), then
  // .transform rounds it to exactly 0 — which used to reach the database
  // as a real row, relying on the CHECK constraint to be the first thing
  // to reject it.
  const badMilestone = submitProposalBodySchema.safeParse({
    ...base,
    bid_amount: 100,
    milestones: [...base.milestones, { title: "Free extra", amount: 1e-9, duration: "1w" }],
  });
  assert.equal(badMilestone.success, false);

  const badBidAmount = submitProposalBodySchema.safeParse({ ...base, bid_amount: 1e-9 });
  assert.equal(badBidAmount.success, false);

  // Legitimate float-drift sums (the original PR #19 fix) must still pass.
  const legit = submitProposalBodySchema.safeParse({ ...base, bid_amount: 5116.789999999999 });
  assert.equal(legit.success, true);
});

test("acceptProposal's sibling-rejection updateMany only touches pending siblings, not an already-rejected one", async () => {
  const client = await createUser("client");
  const [toAccept, alreadyRejected] = await Promise.all([
    createUser("freelancer"),
    createUser("freelancer"),
  ]);
  const job = await createOpenJob(client.id);

  const [acceptedProposal, rejectedProposal] = await Promise.all([
    prisma.proposal.create({
      data: { jobId: job.id, freelancerId: toAccept.id, coverLetter: "a", bidAmount: 100, status: "pending" },
    }),
    prisma.proposal.create({
      data: { jobId: job.id, freelancerId: alreadyRejected.id, coverLetter: "b", bidAmount: 100, status: "pending" },
    }),
  ]);

  // Reject one sibling explicitly, before the other is accepted — status
  // "rejected" with its own updatedAt, set by a real client action, not by
  // acceptProposal's blanket sibling cleanup. Re-fetched via Prisma
  // directly rather than trusting rejectProposal's return value, since
  // toProposalRow's updated_at is a raw Date at runtime despite being
  // typed as string.
  await rejectProposal(rejectedProposal.id.toString(), client.id.toString());
  const rejectedRowFirst = await prisma.proposal.findUniqueOrThrow({
    where: { id: rejectedProposal.id },
  });

  // A short real delay so a spurious re-touch (now() bumped by the
  // set_updated_at trigger on ANY UPDATE, even a no-op status write) is
  // unambiguously distinguishable from the original rejectProposal write.
  await new Promise((r) => setTimeout(r, 50));

  await acceptProposal(acceptedProposal.id.toString(), client.id.toString());

  const rejectedRowAfter = await prisma.proposal.findUniqueOrThrow({
    where: { id: rejectedProposal.id },
  });
  // Removing `status: "pending"` from the sibling updateMany's where clause
  // (services/proposals.ts) would re-match this already-rejected proposal
  // and bump its updatedAt even though its status doesn't change — that's
  // the TOCTOU guard #20 asked to preserve, pinned here.
  assert.equal(rejectedRowAfter.status, "rejected");
  assert.equal(rejectedRowAfter.updatedAt.toISOString(), rejectedRowFirst.updatedAt.toISOString());
});

test("acceptProposal rejects a non-pending proposal on a still-open job", async () => {
  const client = await createUser("client");
  const freelancer = await createUser("freelancer");
  const job = await createOpenJob(client.id);
  const proposal = await prisma.proposal.create({
    data: { jobId: job.id, freelancerId: freelancer.id, coverLetter: "x", bidAmount: 100, status: "pending" },
  });

  // Reject the proposal directly — job stays "open" (rejecting doesn't
  // touch job status), so this isolates the proposal.status !== "pending"
  // guard from the job.status guard tested elsewhere: without it, this
  // proposal would sail through to acceptance a second time.
  await rejectProposal(proposal.id.toString(), client.id.toString());

  await assertRejectsWith(acceptProposal(proposal.id.toString(), client.id.toString()), 400);
});

test("listProposalsForJob floors a non-positive page to 1, not just clamping limit", async () => {
  const client = await createUser("client");
  const job = await createOpenJob(client.id);

  const negative = await listProposalsForJob(job.id.toString(), client.id.toString(), { page: -5 });
  assert.equal(negative.page, 1);

  const zero = await listProposalsForJob(job.id.toString(), client.id.toString(), { page: 0 });
  assert.equal(zero.page, 1);
});
