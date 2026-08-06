import { useState } from "react";
import { apiFetch } from "../api";
import { requestKeychainBroadcast } from "../lib/keychain";

type CustomJsonOp = {
  id: string;
  json: string;
  required_auths: string[];
  required_posting_auths: string[];
};

type AcceptResult = {
  contract: { id: string; status: string; total_amount: string };
  custom_json: CustomJsonOp;
};

type Me = { id: string; username: string; role: string };

/**
 * Dev-only smoke-test page for the accept-proposal → Keychain-sign → confirm
 * flow — same spirit as /keychain. Not wired into JobDetailPage yet (that's
 * shared ground with the M3 Proposals & bidding card, still in progress);
 * this lets the flow be verified against a real Keychain account on its own
 * before it's integrated into the real proposals list UI.
 */
export function AcceptProposalTestPage() {
  const [proposalId, setProposalId] = useState("");
  const [status, setStatus] = useState("Idle");
  const [detail, setDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function acceptAndConfirm() {
    if (!proposalId.trim()) {
      setStatus("Enter a proposal ID");
      return;
    }
    setBusy(true);
    setDetail(null);
    try {
      setStatus("Fetching current user…");
      const auth = await apiFetch<{ user: Me }>("/api/v1/auth/me");
      const me = auth.user;

      setStatus("Calling POST /proposals/:id/accept…");
      const result = await apiFetch<AcceptResult>(
        `/api/v1/proposals/${proposalId.trim()}/accept`,
        { method: "POST" },
      );

      setStatus("Requesting Keychain Posting broadcast…");
      const payload = {
        ...result.custom_json,
        required_posting_auths: [me.username],
      };
      const hive_tx_id = await requestKeychainBroadcast(
        me.username,
        [["custom_json", payload]],
        "Posting",
      );

      setStatus("Confirming with PATCH /proposals/:id/accept/confirm…");
      const contract = await apiFetch(
        `/api/v1/proposals/${proposalId.trim()}/accept/confirm`,
        {
          method: "PATCH",
          body: JSON.stringify({ hive_tx_id }),
        },
      );

      setStatus("Done — contract created and confirmed");
      setDetail(JSON.stringify({ hive_tx_id, contract }, null, 2));
    } catch (err) {
      setStatus("Failed");
      setDetail(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h1>Accept proposal — smoke test</h1>
      <p className="lede">
        Dev-only page to verify the accept → Keychain sign (Posting) → confirm
        flow against a real proposal, ahead of it being wired into the job
        detail page.
      </p>

      <div className="actions">
        <label>
          Proposal ID
          <input
            value={proposalId}
            onChange={(e) => setProposalId(e.target.value)}
            placeholder="1"
          />
        </label>
        <button type="button" disabled={busy} onClick={() => void acceptAndConfirm()}>
          Accept proposal
        </button>
      </div>

      <p>
        <strong>Status:</strong> {status}
      </p>
      {detail && <pre className="detail">{detail}</pre>}
    </section>
  );
}