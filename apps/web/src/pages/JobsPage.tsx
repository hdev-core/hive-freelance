import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";

type Job = {
  id: string;
  title: string;
  description: string;
  budget: string;
  category: string | null;
  status: string;
};

export function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<{ items: Job[] }>("/api/v1/jobs");
        setJobs(data.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
      try {
        const auth = await apiFetch<{ user: { username: string } }>(
          "/api/v1/auth/me",
        );
        setMe(auth.user.username);
      } catch {
        setMe(null);
      }
    })();
  }, []);

  return (
    <section className="panel">
      <h1>Open jobs</h1>
      <p className="lede">
        {me ? (
          <>
            Signed in as <code>@{me}</code>
          </>
        ) : (
          <>
            Not signed in — <Link to="/login">login</Link>
          </>
        )}
      </p>
      {error && <p className="error">{error}</p>}
      <ul className="job-list">
        {jobs.map((job) => (
          <li key={job.id}>
            <strong>{job.title}</strong>
            <span>
              {job.budget} {job.category ? `· ${job.category}` : ""}
            </span>
            <p>{job.description.slice(0, 160)}</p>
          </li>
        ))}
        {jobs.length === 0 && !error && <li>No open jobs yet.</li>}
      </ul>
    </section>
  );
}
