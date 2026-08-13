import type { Prisma } from "@hive-freelance/db";
import { AppError } from "./errors.js";

/**
 * Locks a job row for the duration of the caller's transaction and
 * returns its freshly-locked client_id/status. Must be called as the
 * FIRST statement inside the transaction — this establishes the
 * "job row locked first" ordering that acceptProposal, cancelJob,
 * deleteJob, updateJob, and cancelContract all rely on to avoid
 * deadlocking against each other.
 *
 * These five are not the complete set of paths that mutate job-scoped
 * state — completeContract, rejectProposal, withdrawProposal,
 * submitProposal, createMilestone, and fundMilestone all do too, and
 * none of them go through this helper (or any lock) yet. Don't treat
 * "locked via this helper" as "the only path that touches this data" —
 * that gap is exactly what let the withdraw/reject-vs-accept race
 * through (see the comment on withdrawProposal in proposals.ts).
 *
 * Deliberately doesn't check ownership or status itself — different
 * callers allow different statuses and want different error messages
 * (e.g. cancelJob allows open/in_progress, deleteJob only open), so
 * those checks stay with each caller. This just does the lock + the
 * one thing every caller needs identically: 404 if the job doesn't
 * exist.
 */
export async function lockJobForUpdate(
  tx: Prisma.TransactionClient,
  jobId: string,
): Promise<{ client_id: string; status: string }> {
  const locked = await tx.$queryRaw<
    { client_id: bigint; status: string }[]
  >`SELECT client_id, status FROM jobs WHERE id = ${BigInt(jobId)} FOR UPDATE`;

  const job = locked[0];
  if (!job) throw new AppError(404, "Job not found");
  return { client_id: job.client_id.toString(), status: job.status };
}