"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Headset, ClipboardCheck, Shield, LoaderCircle } from "lucide-react";
import type { User } from "@/lib/permissions";

const icons = { agent: Headset, reviewer: ClipboardCheck, admin: Shield };
const descriptions = { agent: "Submit refund requests and follow their progress.", reviewer: "Approve or reject refunds and edit shared notes.", admin: "Inspect refunds, audit history, and the team directory." };

export function DemoLogin({ users }: { users: User[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function login(userId: string) {
    setPending(userId);
    setError("");
    try {
      const response = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
      if (!response.ok) throw new Error((await response.json()).error);
      router.replace("/");
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to sign in."); setPending(null); }
  }
  return <><div className="login-users">{users.map((user) => { const Icon = icons[user.role]; return <button className="login-user" key={user.id} onClick={() => login(user.id)} disabled={!!pending}>
    <span className={`login-role-icon ${user.role}`}><Icon size={23} /></span><span><strong>{user.name}<span className={`role-badge ${user.role}`}>{user.role}</span></strong><small>{descriptions[user.role]}</small></span>{pending === user.id ? <LoaderCircle size={19} className="spin" /> : <ArrowRight size={19} />}
  </button>; })}</div>{error && <p role="alert" className="error-text">{error}</p>}</>;
}
