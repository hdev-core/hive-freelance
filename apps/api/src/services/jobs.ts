import { prisma, toJobRow, type JobRow } from "@hive-freelance/db";
import { AppError } from "../lib/errors.js";

export async function listJobs(opts: {
  category?: string;
  skill?: string;
  status?: string;
  client_id?: string;
  budget_min?: number;
  budget_max?: number;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const offset = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  // Public browse (no client_id) keeps the original default: open jobs
  // only. A client_id filter means "my posted jobs" — show every status
  // unless one was explicitly requested, since a client wants to see their
  // in_progress/completed/cancelled jobs too, not just open ones.
  if (opts.client_id != null) {
    where.clientId = BigInt(opts.client_id);
    if (opts.status) where.status = opts.status;
  } else {
    where.status = opts.status ?? "open";
  }
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
    include: {
      _count: { select: { proposals: true } },
      client: { select: { hiveUsername: true, profile: { select: { displayName: true, location: true } } } },
    },
  });

  // One grouped aggregate for every client on this page, instead of one
  // rating query per job — same reasoning as getPublicProfile's aggregate,
  // just batched since a page can have up to 50 jobs/clients.
  const clientIds = [...new Set(jobs.map((j) => j.clientId))];
  const ratings = clientIds.length
    ? await prisma.review.groupBy({
        by: ["revieweeId"],
        where: { revieweeId: { in: clientIds } },
        _avg: { rating: true },
        _count: { rating: true },
      })
    : [];
  const ratingByClientId = new Map(
    ratings.map((r) => [r.revieweeId.toString(), { average: r._avg.rating, count: r._count.rating }]),
  );

  const items = jobs.map((j) => {
    const rating = ratingByClientId.get(j.clientId.toString()) ?? { average: null, count: 0 };
    return {
      ...toJobRow(j),
      proposalCount: j._count.proposals,
      client_username: j.client.hiveUsername,
      client_display_name: j.client.profile?.displayName ?? null,
      client_location: j.client.profile?.location ?? null,
      client_rating: {
        average: rating.average != null ? Math.round(rating.average * 100) / 100 : null,
        count: rating.count,
      },
    };
  });

  return { items, page, limit };
}

export async function getJob(id: string) {
  const job = await prisma.job.findUnique({
    where: { id: BigInt(id) },
    include: {
      _count: { select: { proposals: true } },
      // Only the username is selected — the detail page needs it to link
      // to the client's real Profile API record (GET /users/:username);
      // nothing else about the client is exposed via the Jobs API.
      client: { select: { hiveUsername: true } },
    },
  });
  if (!job) throw new AppError(404, "Job not found");

  return {
    ...toJobRow(job),
    proposalCount: job._count.proposals,
    client_username: job.client.hiveUsername,
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
  const job = await getJob(jobId);
  if (job.client_id !== clientId) {
    throw new AppError(403, "Not job owner");
  }
  if (job.status !== "open") {
    throw new AppError(400, "Only open jobs can be edited");
  }

  // Same COALESCE-on-update quirk as the original: a field is only written
  // if provided and non-null. Category/skills_required could never actually
  // be cleared to NULL in the original either — preserved as-is, not fixed.
  const updateData: Record<string, unknown> = {};
  if (data.title != null) updateData.title = data.title;
  if (data.description != null) updateData.description = data.description;
  if (data.budget != null) updateData.budget = data.budget;
  if (data.category != null) updateData.category = data.category;
  if (data.skills_required != null)
    updateData.skillsRequired = data.skills_required;

  const updated = await prisma.job.update({
    where: { id: BigInt(jobId) },
    data: updateData,
  });
  return toJobRow(updated);
}

export async function cancelJob(
  jobId: string,
  clientId: string,
): Promise<JobRow> {
  const job = await getJob(jobId);
  if (job.client_id !== clientId) {
    throw new AppError(403, "Not job owner");
  }
  if (job.status !== "open" && job.status !== "in_progress") {
    throw new AppError(
      400,
      "Only open or in-progress jobs can be cancelled",
    );
  }
  const updated = await prisma.job.update({
    where: { id: BigInt(jobId) },
    data: { status: "cancelled" },
  });
  return toJobRow(updated);
}

export async function deleteJob(
  jobId: string,
  clientId: string,
): Promise<void> {
  const job = await getJob(jobId);
  if (job.client_id !== clientId) {
    throw new AppError(403, "Not job owner");
  }
  if (job.status !== "open") {
    throw new AppError(400, "Only open jobs can be deleted");
  }
  await prisma.job.delete({ where: { id: BigInt(jobId) } });
}