import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../api";
import { requestKeychainBroadcast } from "../lib/keychain";

type Milestone = {
  id: string;
  title: string;
  amount: string;
  status: string;
  milestone_order: number;
};

type Payment = {
  id: string;
  milestone_id: string;
  amount: string;
  currency: string;
  status: string;
  escrow_id: number | null;
  hive_tx_id: string | null;
  agent_approve_tx_id?: string | null;
  freelancer_approve_tx_id?: string | null;
  release_tx_id?: string | null;
};

type ContractBundle = {
  id: string;
  status: string;
  client_id: string;
  freelancer_id: string;
  milestones: Milestone[];
  payments: Payment[];
  parties?: {
    client: { id: string; hive_username: string } | null;
    freelancer: { id: string; hive_username: string } | null;
  };
};

type Me = {
  id: string;
  username: string;
  role: string;
  authType?: string | null;
  custodial?: boolean;
};

async function signAndConfirm(opts: {
  me: Me;
  mode: "keychain" | "custodial";
  opName: "escrow_transfer" | "escrow_approve" | "escrow_release";
  payload: Record<string, unknown>;
  confirmPath: string;
}): Promise<string> {
  let hive_tx_id: string;

  if (opts.mode === "custodial" || opts.me.custodial) {
    const parts = opts.confirmPath.split("/").filter(Boolean);
    // api/v1/payments/:id/...
    const paymentId = parts[2];
    const signed = await apiFetch<{ hive_tx_id: string; dryRun: boolean }>(
      `/api/v1/payments/${paymentId}/custodial-sign`,
      {
        method: "POST",
        body: JSON.stringify({ op: opts.opName, payload: opts.payload }),
      },
    );
    hive_tx_id = signed.hive_tx_id;
  } else {
    hive_tx_id = await requestKeychainBroadcast(opts.me.username, [
      [opts.opName, opts.payload],
    ]);
  }

  await apiFetch(opts.confirmPath, {
    method: "PATCH",
    body: JSON.stringify({ hive_tx_id }),
  });
  return hive_tx_id;
}

export function ContractPage() {
  const { id } = useParams<{ id: string }>();
  const [bundle, setBundle] = useState<ContractBundle | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Idle");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    const data = await apiFetch<ContractBundle>(`/api/v1/contracts/${id}`);
    setBundle(data);
  }, [id]);

  useEffect(() => {
    void (async () => {
      try {
        const auth = await apiFetch<{ user: Me }>("/api/v1/auth/me");
        setMe(auth.user);
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [reload]);

  const isClient = me && bundle && me.id === String(bundle.client_id);
  const isFreelancer =
    me && bundle && me.id === String(bundle.freelancer_id);

  function paymentForMilestone(mid: string): Payment | undefined {
    return bundle?.payments.find(
      (p) =>
        String(p.milestone_id) === String(mid) &&
        !["refunded"].includes(p.status),
    );
  }

  async function fund(milestoneId: string) {
    if (!me || !id) return;
    setBusy(true);
    setError(null);
    try {
      setStatus("Building escrow_transfer…");
      const result = await apiFetch<{
        payment: Payment;
        escrow_transfer: Record<string, unknown>;
        mode: "keychain" | "custodial";
      }>(`/api/v1/contracts/${id}/milestones/${milestoneId}/fund`, {
        method: "POST",
        body: JSON.stringify({ currency: "HBD" }),
      });

      setStatus(
        result.mode === "custodial"
          ? "Custodial sign…"
          : "Keychain Active broadcast…",
      );
      await signAndConfirm({
        me,
        mode: result.mode,
        opName: "escrow_transfer",
        payload: result.escrow_transfer,
        confirmPath: `/api/v1/payments/${result.payment.id}/confirm`,
      });
      setStatus("Funded — awaiting ratification (agent auto-approve)");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("Failed");
    } finally {
      setBusy(false);
    }
  }

  async function ratify(paymentId: string) {
    if (!me) return;
    setBusy(true);
    setError(null);
    try {
      setStatus("Building escrow_approve…");
      const result = await apiFetch<{
        escrow_approve: Record<string, unknown>;
        mode: "keychain" | "custodial";
      }>(`/api/v1/payments/${paymentId}/ratify`, { method: "POST" });

      setStatus(
        result.mode === "custodial"
          ? "Custodial sign…"
          : "Keychain Active broadcast…",
      );
      await signAndConfirm({
        me,
        mode: result.mode,
        opName: "escrow_approve",
        payload: result.escrow_approve,
        confirmPath: `/api/v1/payments/${paymentId}/ratify/confirm`,
      });
      setStatus("Ratified — listener sets escrowed at LIB (or dry demo)");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("Failed");
    } finally {
      setBusy(false);
    }
  }

  async function release(paymentId: string) {
    if (!me) return;
    setBusy(true);
    setError(null);
    try {
      setStatus("Building escrow_release…");
      const result = await apiFetch<{
        escrow_release: Record<string, unknown>;
        mode: "keychain" | "custodial";
      }>(`/api/v1/payments/${paymentId}/release`, { method: "POST" });

      await signAndConfirm({
        me,
        mode: result.mode,
        opName: "escrow_release",
        payload: result.escrow_release,
        confirmPath: `/api/v1/payments/${paymentId}/release/confirm`,
      });
      setStatus("Release broadcast — terminal status at LIB by default");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("Failed");
    } finally {
      setBusy(false);
    }
  }

  async function refund(paymentId: string) {
    if (!me) return;
    setBusy(true);
    setError(null);
    try {
      setStatus("Building cooperative refund…");
      const result = await apiFetch<{
        escrow_release: Record<string, unknown>;
        mode: "keychain" | "custodial";
      }>(`/api/v1/payments/${paymentId}/refund`, { method: "POST" });

      await signAndConfirm({
        me,
        mode: result.mode,
        opName: "escrow_release",
        payload: result.escrow_release,
        confirmPath: `/api/v1/payments/${paymentId}/refund/confirm`,
      });
      setStatus("Refund broadcast — terminal status at LIB by default");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!bundle && !error) {
    return (
      <section className="panel">
        <p>Loading contract…</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h1>Contract #{id}</h1>
      <p className="lede">
        {me ? (
          <>
            Signed in as <code>@{me.username}</code>
            {isClient ? " (client)" : ""}
            {isFreelancer ? " (freelancer)" : ""}
          </>
        ) : (
          <>
            <Link to="/login">Login</Link> to fund or ratify.
          </>
        )}
      </p>
      {bundle && (
        <p>
          Status: <strong>{bundle.status}</strong>
          {bundle.parties?.client && (
            <>
              {" "}
              · client <code>@{bundle.parties.client.hive_username}</code>
            </>
          )}
          {bundle.parties?.freelancer && (
            <>
              {" "}
              · freelancer{" "}
              <code>@{bundle.parties.freelancer.hive_username}</code>
            </>
          )}
        </p>
      )}

      {error && <p className="error">{error}</p>}
      <p>
        <strong>Status:</strong> {status}
      </p>

      <ul className="job-list">
        {bundle?.milestones.map((m) => {
          const pay = paymentForMilestone(m.id);
          return (
            <li key={m.id}>
              <strong>
                #{m.milestone_order} {m.title}
              </strong>
              <span>
                {m.amount} HBD · milestone {m.status}
                {pay
                  ? ` · payment ${pay.status}${pay.escrow_id != null ? ` · escrow ${pay.escrow_id}` : ""}`
                  : ""}
              </span>
              <div className="actions" style={{ marginTop: "0.75rem" }}>
                {isClient && m.status === "pending" && !pay && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void fund(m.id)}
                  >
                    Fund escrow
                  </button>
                )}
                {isFreelancer &&
                  pay?.status === "awaiting_ratification" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void ratify(pay.id)}
                    >
                      Ratify
                    </button>
                  )}
                {isClient && pay?.status === "escrowed" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void release(pay.id)}
                  >
                    Release
                  </button>
                )}
                {isFreelancer && pay?.status === "escrowed" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void refund(pay.id)}
                  >
                    Cooperative refund
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p>
        <Link to="/contracts">All contracts</Link> ·{" "}
        <Link to="/jobs">Jobs</Link>
      </p>
    </section>
  );
}
