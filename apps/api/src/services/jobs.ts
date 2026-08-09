import { prisma, toJobRow, type JobRow } from "@hive-freelance/db";
import { BLOCKING_MILESTONE_STATUSES } from "@hive-freelance/shared";
import { AppError } from "../lib/errors.js";
import { lockJobForUpdate } from "../lib/locks.js";

export async function listJobs(opts: {
  category?: string;
  skill?: string;
  status?: string;
  budget_min?: number;
  budget_max?: number;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const offset = (page - 1) * limit;
  const status = opts.status ?? "open";

  const where: Record<string, unknown> = { status };
  if (opts.category) where.category = opts.category;
  if (opts.skill) where.skillsRequired = { has: opts.skill };
  if (opts.budget_min != null || opts.budget_max != null) {
    const budget: Record<string, number> = {};
    if (opts.budget_min != null) budget.gte = opts.budget_min;
    if (opts.budget_max != null) budget.lte = opts.budget_max;
    where.budget = budget;
  }

  const jobs = await prisma.job.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
  return { items: jobs.map(toJobRow), page, limit };
}

export async function getJob(id: string) {
  const job = await prisma.job.findUnique({
    where: { id: BigInt(id) },
    include: { _count: { select: { proposals: true } } },
  });
  if (!job) throw new AppError(404, "Job not found");

  return {
    ...toJobRow(job),
    proposalCount: job._count.proposals,
  };
}

export async function createJob(
  clientId: string,
  data: {
    title: string;
    description: string;
    budget: number;
    category?: string;
    skills_required?: string[];
  },
): Promise<JobRow> {
  const job = await prisma.job.create({
    data: {
      clientId: BigInt(clientId),
      title: data.title,
      description: data.description,
      budget: data.budget,
      category: data.category ?? null,
      skillsRequired: data.skills_required ?? [],
    },
  });
  return toJobRow(job);
}

export async function updateJob(
  jobId: string,
  clientId: string,
  data: Partial<{
    title: string;
    description: string;
    budget: number;
    category: string | null;
    skills_required: string[] | null;
  }>,
): Promise<JobRow> {
  // Same lock-first pattern as cancelJob/deleteJob, for consistency — a
  // stale read here can't cascade-destroy anything (the contract carries
  // the proposal's bid amount, not jobs.budget), but leaving this as the
  // one un-fixed stale read in the file is exactly how it gets
  // reintroduced by copy-paste later.
  const updated = await prisma.$transaction(async (tx) => {
    const job = await lockJobForUpdate(tx, jobId);
    if (job.client_id !== clientId) {
      throw new AppError(403, "Not job owner");
    }
    if (job.status !== "open") {
      throw new AppError(400, "Only open jobs can be edited");
    }

    // Same COALESCE-on-update quirk as the original: a field is only
    // written if provided and non-null. Category/skills_required could
    // never actually be cleared to NULL in the original either —
    // preserved as-is, not fixed.
    const updateData: Record<string, unknown> = {};
    if (data.title != null) updateData.title = data.title;
    if (data.description != null) updateData.description = data.description;
    if (data.budget != null) updateData.budget = data.budget;
    if (data.category != null) updateData.category = data.category;
    if (data.skills_required != null)
      updateData.skillsRequired = data.skills_required;

    return tx.job.update({
      where: { id: BigInt(jobId) },
      data: updateData,
    });
  });

  return toJobRow(updated);
}

export async function cancelJob(
  jobId: string,
  clientId: string,
): Promise<JobRow> {
  const updated = await prisma.$transaction(
    async (tx) => {
      // Lock the job row FIRST, as the very first statement in this
      // transaction — same order acceptProposal uses. Two things this
      // fixes at once:
      //  - deadlock ordering: acceptProposal locks job, then touches
      //    contracts; this now does the same, instead of the old
      //    contract-then-job order that could deadlock against it.
      //  - stale-status TOCTOU: reading status via a separate getJob()
      //    call *before* this transaction started meant a concurrent
      //    acceptProposal could flip open -> in_progress (and create a
      //    contract) in between that read and this transaction's writes,
      //    leaving a cancelled job with an active contract still attached.
      //    Reading status fresh, under the lock, closes that gap.
      const job = await lockJobForUpdate(tx, jobId);
      if (job.client_id !== clientId) {
        throw new AppError(403, "Not job owner");
      }
      if (job.status !== "open" && job.status !== "in_progress") {
        throw new AppError(
          400,
          "Only open or in-progress jobs can be cancelled",
        );
      }

      // Cancelling an open job has no attached contract to worry about —
      // a contract only ever gets created on proposal acceptance, which
      // is exactly what flips the job to in_progress. So this branch
      // only matters for the in_progress case.
      if (job.status === "in_progress") {
        const contract = await tx.contract.findFirst({
          where: { jobId: BigInt(jobId), status: "active" },
        });
        if (contract) {
          // Same rule as cancelContract: don't allow cancelling out from
          // under milestones that already have real money/escrow motion.
          const blockingMilestone = await tx.milestone.findFirst({
            where: {
              contractId: contract.id,
              status: { in: [...BLOCKING_MILESTONE_STATUSES] },
            },
          });
          if (blockingMilestone) {
            throw new AppError(
              400,
              "Cannot cancel — contract has funded milestones. Use cooperative refund or dispute instead.",
            );
          }
          await tx.contract.update({
            where: { id: contract.id },
            data: { status: "cancelled", endDate: new Date() },
          });
        }
      }

      return tx.job.update({
        where: { id: BigInt(jobId) },
        data: { status: "cancelled" },
      });
    },
    // Up to 5 round-trips here — same order of magnitude as
    // acceptProposal, which measured ~5.5s under real pooled-connection
    // latency and tripped the default 5000ms. Same fix, same reasoning
    // (see the comment on acceptProposal's $transaction call).
    { timeout: 15000 },
  );

  return toJobRow(updated);
}

export async function deleteJob(
  jobId: string,
  clientId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Same fix as cancelJob, same reason: getJob() before the transaction
    // reads a snapshot that a concurrent acceptProposal can invalidate
    // before this transaction's writes run. Here the stakes are worse —
    // Contract.job is onDelete: Cascade, so a stale "open" read racing
    // against acceptProposal wouldn't just leave a contract dangling
    // (cancelJob's original bug), it would silently destroy a
    // just-created contract and its proposals outright.
    const job = await lockJobForUpdate(tx, jobId);
    if (job.client_id !== clientId) {
      throw new AppError(403, "Not job owner");
    }
    if (job.status !== "open") {
      throw new AppError(400, "Only open jobs can be deleted");
    }

    await tx.job.delete({ where: { id: BigInt(jobId) } });
  });
}