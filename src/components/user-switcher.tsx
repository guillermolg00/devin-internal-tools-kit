"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, LogOut, LoaderCircle } from "lucide-react";
import type { User } from "@/lib/permissions";

export function UserSwitcher({ user, users }: { user: User; users: User[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function change(userId?: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/session", {
        method: userId ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        ...(userId ? { body: JSON.stringify({ userId }) } : {}),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      document.querySelector<HTMLDetailsElement>(".user-menu")?.removeAttribute("open");
      router.push(userId ? "/" : "/login");
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to switch users."); }
    finally { setBusy(false); }
  }

  return <div className="switcher-wrap"><details className="user-menu"><summary>
    <span className={`avatar ${user.role}`}>{user.name.split(" ").map((part) => part[0]).join("")}</span>
    <span className="user-name">{user.name}<small>{user.role}</small></span><ChevronDown size={15} />
  </summary><div className="user-dropdown"><div className="dropdown-label">SWITCH DEMO USER</div>{users.map((option) => <button key={option.id} disabled={busy} onClick={() => change(option.id)}>
    <span className={`avatar ${option.role}`}>{option.name.split(" ").map((part) => part[0]).join("")}</span><span>{option.name}<small>{option.role}</small></span>{option.id === user.id && <Check size={16} />}
  </button>)}<button className="signout" disabled={busy} onClick={() => change()}>{busy ? <LoaderCircle size={16} className="spin" /> : <LogOut size={16} />}Sign out</button></div></details>{error && <p role="alert" className="switcher-error">{error}</p>}</div>;
}
