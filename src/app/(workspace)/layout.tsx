import { FlaskConical, ChevronRight } from "lucide-react";
import { pageUser } from "@/lib/auth";
import { demoUsers } from "@/lib/database";
import { can } from "@/lib/permissions";
import { Navigation } from "@/components/navigation";
import { UserSwitcher } from "@/components/user-switcher";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await pageUser();
  return <div className="app-shell"><a href="#main-content" className="skip-link">Skip to content</a><Navigation isAdmin={can(user, "users:read")} /><div className="main-shell"><header className="topbar"><div className="breadcrumb">Workspace<ChevronRight size={13} /><strong>Internal tools</strong></div><div className="topbar-right"><span className="demo-pill"><FlaskConical size={13} />Demo mode</span><UserSwitcher user={user} users={demoUsers} /></div></header><main id="main-content" className="page-content">{children}</main><footer className="app-footer"><span>Foundry / Internal tools kit</span><span><span className="status-dot" />SQLite · Local & persistent</span></footer></div></div>;
}
