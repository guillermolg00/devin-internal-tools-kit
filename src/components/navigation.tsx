"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, ShieldCheck, Users, History, LockKeyhole, ScanLine, Undo2, ToggleLeft, Layers3, ArrowUpRight } from "lucide-react";

export function Navigation({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  return <aside className="sidebar">
    <Link href="/" className="brand"><span className="brand-symbol"><Layers3 size={22} /></span>foundry<span className="brand-dot">.</span></Link>
    <div className="workspace-label"><span className="workspace-icon">W</span><div>Workspace<small>Internal tools kit</small></div><span className="tiny-label">DEV</span></div>
    <div className="nav-label">WORKSPACE</div>
    <nav aria-label="Workspace navigation">
      {[{ href: "/", label: "Overview", Icon: LayoutGrid }, { href: "/access", label: "Roles & permissions", Icon: ShieldCheck }, { href: "/team", label: "Team directory", Icon: Users }, { href: "/audit", label: "Audit log", Icon: History }].map(({ href, label, Icon }) => <Link key={href} href={href} className={`nav-link ${path === href ? "active" : ""}`} aria-current={path === href ? "page" : undefined}><Icon size={18} />{label}{["/team", "/audit"].includes(href) && !isAdmin && <LockKeyhole size={13} className="nav-lock" />}</Link>)}
    </nav>
    <div className="nav-label future-label">BUILD ON THIS</div>
    <div className="future-link"><ScanLine size={17} />KYC review queue<span>SOON</span></div>
    <div className="future-link"><Undo2 size={17} />Refunds dashboard<span>SOON</span></div>
    <div className="future-link"><ToggleLeft size={17} />Feature flags<span>SOON</span></div>
    <div className="sidebar-bottom"><span className="status-dot" />Local development<div>Small foundation. More possibilities.<ArrowUpRight size={14} /></div></div>
  </aside>;
}
