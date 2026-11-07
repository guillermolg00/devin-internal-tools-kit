import { Layers3, LockKeyhole } from "lucide-react";
import { safeNext } from "@/lib/gate";

export const metadata = { title: "Demo access" };

export default async function GatePage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return <main className="login-page"><div className="login-brand brand"><span className="brand-symbol"><Layers3 size={23} /></span>foundry<span className="brand-dot">.</span></div><div className="login-card"><span className="eyebrow">PRIVATE DEMO</span><h1>Enter the demo password.</h1><p className="login-description">This prototype is shared for evaluation. After this step you&apos;ll pick a fictional demo identity.</p><form method="post" action="/api/gate" className="gate-form"><input type="hidden" name="next" value={safeNext(next)} /><label htmlFor="password" className="login-section-label">PASSWORD</label><input id="password" name="password" type="password" autoComplete="current-password" required autoFocus className="gate-input" />{error && <p className="gate-error" role="alert">That password didn&apos;t match. Try again.</p>}<button type="submit" className="button primary gate-submit"><LockKeyhole size={14} />Continue</button></form></div></main>;
}
