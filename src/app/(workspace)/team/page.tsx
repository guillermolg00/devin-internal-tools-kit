import Link from "next/link";
import { LockKeyhole, ArrowLeft, Users } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { getStore } from "@/lib/database";
import { AccessError, authorize } from "@/lib/permissions";
import { redirect } from "next/navigation";

export const metadata = { title: "Team directory" };

export default async function TeamPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  try { authorize(user, "users:read"); }
  catch (error) {
    if (!(error instanceof AccessError)) throw error;
    return <section className="access-denied panel"><span className="denied-icon"><LockKeyhole size={30} /></span><div className="eyebrow">ADMIN ACCESS REQUIRED</div><h1>This space has a boundary.</h1><p>Your {user.role} role cannot access the team directory.<br />Switch to the admin demo user to explore it.</p><Link href="/" className="button secondary"><ArrowLeft size={15} />Back to overview</Link><small>Access checked on the server before loading team data.</small></section>;
  }
  const users = await getStore().users();
  return <><div className="page-heading"><div><div className="eyebrow">TEAM DIRECTORY</div><h1>The people in your workspace.</h1><p>A protected view of the seeded users. Only admins can load this data.</p></div><span className="role-badge admin">Admin only</span></div><section className="panel"><div className="panel-heading"><div><Users size={19} /><h2>Workspace members</h2></div><span className="subtle-badge">{users.length} MEMBERS</span></div><div className="table-scroll"><table className="team-table"><thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th></tr></thead><tbody>{users.map((member) => <tr key={member.id}><td><span className={`avatar ${member.role}`}>{member.name.split(" ").map((part) => part[0]).join("")}</span>{member.name}{member.id === user.id && <small>You</small>}</td><td>{member.email}</td><td><span className={`role-badge ${member.role}`}>{member.role}</span></td></tr>)}</tbody></table></div></section><div className="security-note"><LockKeyhole size={20} /><div><h3>Protected at the source</h3><p>Both this page and GET /api/users independently require the users:read permission. The sidebar is a convenience, not the security boundary.</p></div></div></>;
}
