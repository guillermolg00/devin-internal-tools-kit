"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, RefreshCw, ShieldCheck, Undo2, X } from "lucide-react";
import { formatUSD, type Refund } from "@/lib/refund-types";

export function RefundDashboard({ refunds, userId, canCreate, canReview, canSignOff }: {
  refunds: Refund[]; userId: string; canCreate: boolean; canReview: boolean; canSignOff: boolean;
}) {
  const [filter, setFilter] = useState("pending");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();
  const visible = refunds.filter((refund) => filter === "all" || refund.status === filter);

  async function submit(path: string, body: unknown) {
    setPending(true); setError(""); setMessage("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      router.refresh();
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save. Try again.");
      router.refresh();
      return false;
    } finally { setPending(false); }
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (await submit("/api/refunds", { customer: data.get("customer"), amount: data.get("amount"), reason: data.get("reason") })) {
      form.reset(); setFilter("pending"); setMessage("Refund request submitted. Its details are now fixed.");
    }
  }

  async function decide(refund: Refund, decision: "approve" | "reject") {
    if (await submit(`/api/refunds/${refund.id}/decisions`, { decision })) setMessage(`${decision === "approve" ? "Approval" : "Rejection"} recorded for ${refund.customer}.`);
  }

  async function signOff(refund: Refund, decision: "approve" | "reject") {
    if (await submit(`/api/refunds/${refund.id}/signoff`, { decision })) setMessage(`Compliance ${decision === "approve" ? "sign-off" : "decline"} recorded for ${refund.customer}.`);
  }

  return <>
    <div className="page-heading"><div><div className="eyebrow">SUPPORT OPERATIONS</div><h1>Refunds dashboard</h1><p>A clear decision. A complete record.</p></div><button className="button secondary" onClick={() => router.refresh()} disabled={pending}><RefreshCw size={14} />Refresh</button></div>
    <div className="refund-policy"><ShieldCheck size={20} /><div><strong>Two sets of eyes above $500, plus compliance above $5,000</strong><p>One approval for $500 or less. Two different reviewers above $500. Above $5,000, a compliance sign-off is also required. No self-review or changes after a final decision.</p></div></div>
    {error && <p role="alert" className="error-text refund-feedback">{error}</p>}{message && <p role="status" className="success-text refund-feedback"><Check size={14} />{message}</p>}
    {canCreate ? <section className="panel refund-create"><div className="panel-heading"><div><Plus size={18} /><h2>New refund request</h2></div><span className="subtle-badge">USD ONLY</span></div><p className="panel-description">Submission details are fixed. This records a request; it does not send money.</p><form onSubmit={create}>
      <div className="refund-fields"><label>Customer<input name="customer" maxLength={200} placeholder="Customer name or reference" required disabled={pending} /></label><label>Amount (USD)<input name="amount" inputMode="decimal" placeholder="0.00" pattern="[0-9]+(\.[0-9]{1,2})?" maxLength={20} required disabled={pending} /></label><label className="refund-reason">Reason<textarea name="reason" maxLength={1000} placeholder="Why is this refund needed?" required disabled={pending} rows={2} /></label></div>
      <div className="refund-submit"><span>Every submission and decision is audited.</span><button className="button primary" disabled={pending}><Plus size={14} />{pending ? "Saving…" : "Submit request"}</button></div>
    </form></section> : <p className="refund-role-note">{canReview ? "You can review other people's pending requests. Each reviewer can decide once." : canSignOff ? "Compliance sign-off only: you can sign off or decline refunds above $5,000. Reviewer approvals are still required." : "Read-only for admins. Review permissions do not include an admin override."}</p>}
    <section className="panel refund-queue"><div className="section-heading"><div><h2>Request queue</h2><p>{refunds.length} requests · decisions are final when review completes</p></div><Undo2 size={20} /></div>
      <div className="refund-filters" aria-label="Filter refunds">{["pending", "approved", "rejected", "all"].map((status) => <button key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}>{status === "all" ? "All requests" : status}<span>{refunds.filter((refund) => status === "all" || refund.status === status).length}</span></button>)}</div>
      {!visible.length ? <div className="empty-state"><Undo2 size={28} /><h3>No {filter === "all" ? "" : `${filter} `}refund requests</h3><p>{canCreate ? "Submit a request above to get started." : "Requests submitted by support agents will appear here."}</p></div> : <div className="table-scroll"><table className="refund-table"><caption className="sr-only">Refund requests and approval progress</caption><thead><tr><th>Customer & reason</th><th>Amount</th><th>Requested by</th><th>Review progress</th><th>Decision</th></tr></thead><tbody>{visible.map((refund) => {
        const reviewed = refund.decisions.some((decision) => decision.reviewerId === userId);
        const own = refund.requestedBy === userId;
        const signedOff = refund.decisions.some((decision) => decision.capacity === "signoff");
        const open = !own && !reviewed && refund.status === "pending";
        const eligible = canReview && open && refund.approvalCount < refund.requiredApprovals;
        const signoffEligible = canSignOff && open && refund.signoffRequired && !signedOff;
        const note = refund.status !== "pending" ? "Final · locked" : own ? "Your request" : reviewed ? "Decision recorded"
          : canReview && refund.signoffRequired && !signedOff ? "Awaiting compliance" : canSignOff ? (refund.signoffRequired ? "Signed off" : "No sign-off needed") : "Reviewers only";
        return <tr key={refund.id}><td><strong>{refund.customer}</strong><p className="refund-reason-text">{refund.reason}</p><small title={refund.id}>REF · {refund.id.slice(0, 8)}</small></td><td><strong>{formatUSD(refund.amountCents)}</strong><small>USD</small></td><td>{refund.requesterName}<small><time dateTime={refund.createdAt}>{refund.createdAt.slice(0, 16).replace("T", " ")} UTC</time></small></td><td><span className={`refund-status ${refund.status}`}>{refund.status}</span><small>{refund.approvalCount} of {refund.requiredApprovals} approvals</small>{refund.signoffRequired && <small>Compliance sign-off · {signedOff ? "complete" : "required"}</small>}<details><summary>Decision history ({refund.decisions.length})</summary>{refund.decisions.length ? <ul>{refund.decisions.map((decision) => <li key={decision.reviewerId}><strong>{decision.reviewerName}</strong> · {decision.capacity === "signoff" ? (decision.decision === "approve" ? "Compliance signed off" : "Compliance declined") : decision.decision === "approve" ? "Approved" : "Rejected"}<small>{decision.decidedAt.replace("T", " ")}</small></li>)}</ul> : <p>No decisions yet.</p>}</details></td><td>{eligible ? <div className="refund-actions"><button className="button primary small" disabled={pending} aria-label={`Approve refund for ${refund.customer}`} onClick={() => decide(refund, "approve")}><Check size={13} />Approve</button><button className="button secondary small" disabled={pending} aria-label={`Reject refund for ${refund.customer}`} onClick={() => decide(refund, "reject")}><X size={13} />Reject</button></div> : signoffEligible ? <div className="refund-actions"><button className="button primary small" disabled={pending} aria-label={`Compliance sign-off for ${refund.customer}`} onClick={() => signOff(refund, "approve")}><ShieldCheck size={13} />Sign off</button><button className="button secondary small" disabled={pending} aria-label={`Decline compliance sign-off for ${refund.customer}`} onClick={() => signOff(refund, "reject")}><X size={13} />Decline</button></div> : <span className="refund-action-note">{note}</span>}</td></tr>;
      })}</tbody></table></div>}
    </section>
  </>;
}
