import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";

type Contract = {
  id: string;
  status: string;
  client_id: string;
  freelancer_id: string;
  updated_at: string;
};

export function ContractsPage() {
  const [items, setItems] = useState<Contract[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<{ items: Contract[] }>(
          "/api/v1/contracts",
        );
        setItems(data.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  return (
    <section className="panel">
      <h1>Your contracts</h1>
      <p className="lede">Open a contract to fund, ratify, release, or refund.</p>
      {error && <p className="error">{error}</p>}
      <ul className="job-list">
        {items.map((c) => (
          <li key={c.id}>
            <Link to={`/contracts/${c.id}`}>
              <strong>Contract #{c.id}</strong>
            </Link>
            <span>{c.status}</span>
          </li>
        ))}
        {items.length === 0 && !error && (
          <li>No contracts yet — accept a proposal from a job first.</li>
        )}
      </ul>
    </section>
  );
}
