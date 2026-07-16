import { useEffect, useState } from "react";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

type Health = {
  ok: boolean;
  db?: string;
  service?: string;
};

type HiveHealth = {
  ok: boolean;
  headBlock?: number;
  lastIrreversibleBlock?: number;
  waxLoaded?: boolean;
};

export function HomePage() {
  const [api, setApi] = useState<Health | null>(null);
  const [hive, setHive] = useState<HiveHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [h, hv] = await Promise.all([
          fetch(`${apiBase}/health`).then((r) => r.json() as Promise<Health>),
          fetch(`${apiBase}/api/v1/health/hive`).then(
            (r) => r.json() as Promise<HiveHealth>,
          ),
        ]);
        setApi(h);
        setHive(hv);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reach API");
      }
    })();
  }, []);

  return (
    <section className="panel">
      <h1>Tech stack scaffold</h1>
      <p className="lede">
        React + Express + PostgreSQL +{" "}
        <code>@hiveio/wax</code> foundation for the Hive freelance marketplace.
      </p>

      {error && <p className="error">{error}</p>}

      <div className="grid">
        <article>
          <h2>API</h2>
          <p>{api ? (api.ok ? `OK · db ${api.db}` : "Degraded") : "Checking…"}</p>
        </article>
        <article>
          <h2>Hive</h2>
          <p>
            {hive
              ? `Head ${hive.headBlock ?? "?"} · LIB ${hive.lastIrreversibleBlock ?? "?"} · WAX ${hive.waxLoaded ? "loaded" : "RPC fallback"}`
              : "Checking…"}
          </p>
        </article>
      </div>
    </section>
  );
}
