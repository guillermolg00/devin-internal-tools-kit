"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, RefreshCw, ScanLine, ShieldCheck } from "lucide-react";
import { documentTypes, type KycAction, type KycCase } from "@/lib/kyc-types";

export function KycQueue({ cases, userId, canCreate, canReview, canSeniorReview }: {
  cases: KycCase[]; userId: string; canCreate: boolean; canReview: boolean; canSeniorReview: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const visible = cases.filter((item) => filter === "all" || (filter === "escalated" ? item.escalated && item.status === "pending" : filter === "mine" ? item.assignedTo === userId : item.status === filter));
  const selected = cases.find((item) => item.id === selectedId);

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
    if (await submit("/api/kyc", { customer: data.get("customer"), country: data.get("country"), documentType: data.get("documentType"), riskScore: Number(data.get("riskScore")) })) {
      form.reset(); setFilter("pending"); setMessage("Verification added to the queue. Submission details are now fixed.");
    }
  }

  async function act(item: KycCase, action: KycAction) {
    if (await submit(`/api/kyc/${item.id}/actions`, { action, note: reason })) {
      setReason(""); setMessage(`${item.customer}: ${action} recorded.`);
    }
  }

  const own = selected?.requestedBy === userId;
  const reviewed = selected?.history.some((entry) => entry.actorId === userId && (entry.action === "approve" || entry.action === "reject"));
  const selfEscalated = selected?.history.some((entry) => entry.actorId === userId && entry.action === "escalate");
  const seniorRequired = selected && (selected.escalated || (selected.requiredApprovals > 1 && selected.approvalCount > 0));
  const blocked = !canReview ? "Read-only for admins; no review override." : own ? "You cannot review your own submission." : selfEscalated ? "You cannot approve a case you escalated. Another senior reviewer must pick it up." : reviewed ? "Your decision is already recorded. A different reviewer must continue." : seniorRequired && !canSeniorReview ? "Waiting for a senior reviewer (reviewer role)." : null;
  const assigned = selected?.assignedTo === userId;

  return <>
    <div className="page-heading"><div><div className="eyebrow">CUSTOMER OPERATIONS</div><h1>KYC review queue</h1><p>Know your customer. Keep every decision.</p></div><button className="button secondary" onClick={() => router.refresh()} disabled={pending}><RefreshCw size={14} />Refresh</button></div>
    <div className="refund-policy"><ShieldCheck size={20} /><div><strong>High risk. Two independent approvals.</strong><p>Scores of 70–100 need two different approvers; the second must be senior. Escalations go to senior reviewers. No approval of your own escalation.</p></div></div>
    <p className="refund-role-note">{canSeniorReview ? "Senior KYC reviewer · claim escalations or provide the second high-risk approval." : canReview ? "KYC analyst · claim a case, inspect its details, then record a reason for your decision." : "Audit view · all case details and history are read-only."} Refresh to see other reviewers’ changes.</p>
    {error && <p role="alert" className="error-text refund-feedback">{error}</p>}{message && <p role="status" className="success-text refund-feedback"><Check size={14} />{message}</p>}
    {canCreate && <details className="panel refund-create kyc-intake"><summary><Plus size={16} />Add signup verification</summary><p className="panel-description">Local intake adapter for vendor results. Use fictional customers only; no document images or numbers.</p><form onSubmit={create}>
      <div className="refund-fields kyc-fields"><label>Customer name<input name="customer" maxLength={200} required disabled={pending} placeholder="Customer name" /></label><label>Country code<input name="country" minLength={2} maxLength={2} pattern="[A-Za-z]{2}" placeholder="ES" required disabled={pending} /></label><label>Document type<select name="documentType" required disabled={pending}>{Object.entries(documentTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Vendor risk score<input name="riskScore" type="number" min={0} max={100} step="any" placeholder="0–100" required disabled={pending} /></label></div>
      <div className="refund-submit"><span>Details and risk score are fixed after submission.</span><button className="button primary" disabled={pending}><Plus size={14} />{pending ? "Saving…" : "Add to queue"}</button></div>
    </form></details>}
    <section className="panel refund-queue"><div className="section-heading"><div><h2>Verification queue</h2><p>{cases.length} cases · claim before deciding · reasons and actor snapshots retained</p></div><ScanLine size={20} /></div>
      <div className="refund-filters" aria-label="Filter KYC cases">{["pending", "escalated", "mine", "approved", "rejected", "all"].map((status) => <button key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}>{status === "mine" ? "Assigned to me" : status}</button>)}</div>
      {!visible.length ? <div className="empty-state"><ScanLine size={28} /><h3>No {filter === "all" ? "" : `${filter} `}cases</h3><p>Signup verifications appear here for review.</p></div> : <div className="table-scroll"><table className="refund-table kyc-table"><caption className="sr-only">Customer verification cases</caption><thead><tr><th>Customer</th><th>Country / document</th><th>Vendor risk</th><th>Review progress</th><th>Assigned to</th><th>Details</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><strong>{item.customer}</strong><small>REF · {item.id.slice(0, 8)}</small></td><td>{item.country}<small>{documentTypes[item.documentType]}</small></td><td><strong>{item.riskScore} / 100</strong><small>{item.requiredApprovals > 1 ? "High risk · senior second approval" : "Standard risk"}</small></td><td><span className={`refund-status ${item.status}`}>{item.status}</span><small>{item.approvalCount} of {item.requiredApprovals} approvals{item.escalated && " · Escalated"}</small></td><td>{item.assigneeName ?? "Unassigned"}</td><td><button className="button secondary small" disabled={pending} aria-label={`Review case for ${item.customer}`} onClick={() => { setSelectedId(item.id); setReason(""); }}>View case</button></td></tr>)}</tbody></table></div>}
    </section>
    {selected && <section className="panel kyc-detail" aria-label={`Case details for ${selected.customer}`}>
      <div className="section-heading"><div><h2>{selected.customer}</h2><p>{selected.id}</p></div><button className="button secondary small" disabled={pending} onClick={() => setSelectedId(null)}>Close case</button></div>
      <dl className="kyc-facts"><div><dt>Country</dt><dd>{selected.country}</dd></div><div><dt>Document</dt><dd>{documentTypes[selected.documentType]}</dd></div><div><dt>Vendor risk score</dt><dd>{selected.riskScore} / 100</dd></div><div><dt>Submitted (UTC)</dt><dd>{selected.createdAt.replace("T", " ")}</dd></div><div><dt>Review</dt><dd>{selected.status} · {selected.approvalCount}/{selected.requiredApprovals} approvals{selected.escalated && " · Escalated"}</dd></div><div><dt>Assigned to</dt><dd>{selected.assigneeName ?? "Unassigned"}</dd></div></dl>
      {selected.status !== "pending" ? <p className="refund-role-note">Final decision · this case is locked.</p> : <>
        {blocked && <p className="refund-role-note">{blocked}</p>}
        {!blocked && !selected.assignedTo && <button className="button primary" disabled={pending} onClick={() => act(selected, "claim")}>Claim case</button>}
        {selected.assignedTo && !assigned && <p className="refund-role-note">Claimed by {selected.assigneeName}. They must decide or release it.</p>}
        {assigned && canReview && <div className="kyc-review"><label htmlFor="kyc-reason">Decision reason (required)</label><textarea id="kyc-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={3} disabled={pending} placeholder="Explain your decision for the next reviewer and auditors" /><div className="kyc-actions">
          <button className="button primary" disabled={pending || !!blocked || !reason.trim()} onClick={() => act(selected, "approve")}>Approve</button>
          <button className="button secondary" disabled={pending || !!blocked || !reason.trim()} onClick={() => act(selected, "reject")}>Reject</button>
          <button className="button secondary" disabled={pending || !!blocked || !reason.trim()} onClick={() => act(selected, "escalate")}>Escalate to senior</button>
          <button className="button secondary" disabled={pending} onClick={() => act(selected, "release")}>Release case</button>
        </div></div>}
      </>}
      <h3>Complete case history ({selected.history.length})</h3><ol className="kyc-history">{selected.history.map((entry) => <li key={entry.id}><strong>{entry.action}</strong> · {entry.actorName} ({entry.actorRole})<small><time dateTime={entry.occurredAt}>{entry.occurredAt.replace("T", " ")}</time></small>{entry.note && <p>{entry.note}</p>}</li>)}</ol>
    </section>}
  </>;
}
