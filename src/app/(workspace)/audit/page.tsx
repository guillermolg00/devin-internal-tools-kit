import Link from "next/link";
import { notFound } from "next/navigation";
import { History, LockKeyhole, ArrowLeft, ArrowRight } from "lucide-react";
import { pageUser } from "@/lib/auth";
import { AccessError, authorize } from "@/lib/permissions";
import { auditCursor, type AuditEntry } from "@/lib/audit";
import { getStore } from "@/lib/database";

export const metadata = { title: "Audit log" };

function Snapshot({ label, value }: { label: string; value: AuditEntry["before"] }) {
  return <div className="audit-snapshot"><h3>{label}</h3><pre>{value === null ? "No record" : JSON.stringify(value, null, 2)}</pre></div>;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ before?: string | string[] }> }) {
  const user = await pageUser();
  try { authorize(user, "audit:read"); }
  catch (error) {
    if (!(error instanceof AccessError)) throw error;
    return <section className="access-denied panel"><span className="denied-icon"><LockKeyhole size={30} /></span><div className="eyebrow">ADMIN ACCESS REQUIRED</div><h1>The audit log is restricted.</h1><p>Your {user.role} role cannot browse change history.<br />Switch to the admin demo user to inspect it.</p><Link href="/" className="button secondary"><ArrowLeft size={15} />Back to overview</Link><small>Access checked on the server before loading audit data.</small></section>;
  }
  const params = await searchParams;
  let before: number | undefined;
  try { before = typeof params.before === "object" ? notFound() : auditCursor(params.before); }
  catch { notFound(); }
  const { entries, nextCursor } = await getStore().auditEntries(before);

  return <><div className="page-heading"><div><div className="eyebrow">WORKSPACE HISTORY</div><h1>Every change has a story.</h1><p>Who changed a record, when it happened, and exactly what changed.</p></div><span className="role-badge admin">Admin only</span></div>
    <div className="audit-intro"><History size={19} /><p>Business changes and their audit entries commit together. History is append-only. Times are shown in UTC; snapshots contain the declared columns.</p></div>
    <section className="audit-list" aria-label="Audit entries">{entries.length === 0 ? <div className="panel empty-state"><h2>No older entries.</h2><p>There are no audit entries on this page.</p><Link href="/audit" className="button secondary">Back to latest</Link></div> : entries.map((entry) => <article key={entry.id} className="panel audit-entry"><div className="audit-entry-heading"><div><span className={`audit-operation ${entry.operation}`}>{entry.operation}</span><h2>{entry.action}</h2></div><span className="audit-entry-id">#{entry.id}</span></div><div className="audit-metadata"><strong>{entry.actor.name}</strong><span className={`role-badge ${entry.actor.role}`}>{entry.actor.role}</span><time dateTime={entry.occurredAt}>{entry.occurredAt.replace("T", " ").replace("Z", " UTC")}</time></div><p className="audit-target"><code>{entry.table}</code><span>Record {entry.recordId}</span></p>{entry.operation === "baseline" && <p className="audit-baseline">Existing data captured when auditing was enabled. Earlier changes and their actors are unknown.</p>}<details><summary>Inspect before & after</summary><div className="audit-snapshots"><Snapshot label="Before" value={entry.before} /><Snapshot label="After" value={entry.after} /></div><dl className="audit-details"><div><dt>Actor ID</dt><dd>{entry.actor.id}</dd></div><div><dt>Actor email</dt><dd>{entry.actor.email ?? "Not applicable"}</dd></div><div><dt>Mutation ID</dt><dd>{entry.mutationId}</dd></div></dl></details></article>)}</section>
    <nav className="audit-pagination" aria-label="Audit pagination">{before && <Link href="/audit" className="button secondary"><ArrowLeft size={14} />Latest entries</Link>}{nextCursor && <Link href={`/audit?before=${nextCursor}`} className="button secondary">Older entries<ArrowRight size={14} /></Link>}</nav>
    <div className="security-note"><LockKeyhole size={20} /><div><h3>Protected history, not immutable infrastructure</h3><p>SQLite rejects row updates, deletes, and replacements in this log. A database-file owner can still remove these protections or replace the file. Real fintech deployment also requires trusted authentication, access controls, backups, and external tamper-resistant retention.</p></div></div>
  </>;
}
