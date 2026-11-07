import { redirect } from "next/navigation";
import { Layers3, FlaskConical, ShieldCheck } from "lucide-react";
import { currentUser, demoAuthEnabled } from "@/lib/auth";
import { demoUsers } from "@/lib/database";
import { DemoLogin } from "@/components/demo-login";

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  return <main className="login-page"><div className="login-brand brand"><span className="brand-symbol"><Layers3 size={23} /></span>foundry<span className="brand-dot">.</span></div><div className="login-card"><span className="eyebrow">YOUR INTERNAL TOOLS START HERE</span><h1>One foundation.<br />A better way to build.</h1><p className="login-description">A shared workspace for your team’s everyday tools.<br />Choose a demo identity to take a look around.</p><div className="login-section-label">CONTINUE AS</div>{demoAuthEnabled() ? <DemoLogin users={demoUsers} /> : <div className="empty-state"><ShieldCheck size={28} /><h2>Demo login is disabled</h2><p>Production requires a real identity provider. For a private evaluation only, set ENABLE_DEMO_AUTH=true.</p></div>}<div className="demo-notice"><FlaskConical size={17} /><p><strong>A sandbox, not a sign-in system.</strong> These are fictional users. No password is needed, and you can switch roles at any time. Do not use real customer data.</p></div></div><footer className="login-footer">NEXT.JS + TYPESCRIPT<span />SQLITE<span />BUILT TO BUILD ON</footer></main>;
}
