import { getPool, type JobRow } from "@hive-freelance/db";
import { AppError } from "../lib/errors.js";

export async function listJobs(opts: {
  category?: string;
  skill?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const offset = (page - 1) * limit;
  const status = opts.status ?? "open";

  const clauses = ["status = $1"];
  const params: unknown[] = [status];

  if (opts.category) {
    params.push(opts.category);
    clauses.push(`category = $${params.length}`);
  }
  if (opts.skill) {
    params.push(opts.skill);
    clauses.push(`$${params.length} = ANY(skills_required)`);
  }

  params.push(limit, offset);
  const result = await getPool().query<JobRow>(
    `
    SELECT * FROM jobs
    WHERE ${clauses.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );
  return { items: result.rows, page, limit };
}

export async function getJob(id: string) {
  const pool = getPool();
  const job = await pool.query<JobRow>(`SELECT * FROM jobs WHERE id = $1`, [
    id,
  ]);
  if (!job.rows[0]) throw new AppError(404, "Job not found");

  const count = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM proposals WHERE job_id = $1`,
    [id],
  );

  return {
    ...job.rows[0],
    proposalCount: Number(count.rows[0]?.count ?? 0),
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
  const result = await getPool().query<JobRow>(
    `
    INSERT INTO jobs (client_id, title, description, budget, category, skills_required)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
    `,
    [
      clientId,
      data.title,
      data.description,
      data.budget,
      data.category ?? null,
      data.skills_required ?? null,
    ],
  );
  return result.rows[0]!;
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

  const result = await getPool().query<JobRow>(
    `
    UPDATE jobs SET
      title = COALESCE($3, title),
      description = COALESCE($4, description),
      budget = COALESCE($5, budget),
      category = COALESCE($6, category),
      skills_required = COALESCE($7, skills_required)
    WHERE id = $1 AND client_id = $2
    RETURNING *
    `,
    [
      jobId,
      clientId,
      data.title ?? null,
      data.description ?? null,
      data.budget ?? null,
      data.category === undefined ? null : data.category,
      data.skills_required === undefined ? null : data.skills_required,
    ],
  );
  return result.rows[0]!;
}

export async function deleteJob(jobId: string, clientId: string): Promise<void> {
  const job = await getJob(jobId);
  if (job.client_id !== clientId) {
    throw new AppError(403, "Not job owner");
  }
  if (job.status !== "open") {
    throw new AppError(400, "Only open jobs can be deleted");
  }
  await getPool().query(`DELETE FROM jobs WHERE id = $1`, [jobId]);
}
