"use client";

import { useState } from "react";
import { ArrowRight, Terminal } from "lucide-react";

export function PermissionProbe() {
  const [result, setResult] = useState("");
  const [pending, setPending] = useState(false);
  async function probe() {
    setPending(true);
    try {
      const response = await fetch("/api/users");
      const body = await response.json();
      setResult(response.ok ? `${response.status} OK — access granted to the team directory.` : `${response.status} — ${body.error}`);
    } catch { setResult("Could not reach the server. Please try again."); }
    finally { setPending(false); }
  }
  return <div className="probe"><div><Terminal size={20} /><div><h3>Not just a hidden button.</h3><p>Call the admin-only endpoint directly. The server makes the decision.</p></div></div><code>GET /api/users</code><button className="button secondary" disabled={pending} onClick={probe}>{pending ? "Checking…" : "Try protected request"}<ArrowRight size={15} /></button>{result && <p role="status" className="probe-result">{result}</p>}</div>;
}
