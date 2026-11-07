"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, Save, Check, LoaderCircle } from "lucide-react";

export function NoteEditor({ initialContent, canEdit }: { initialContent: string; canEdit: boolean }) {
  const [content, setContent] = useState(initialContent);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/note", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setContent(result.content); setMessage("Saved to SQLite"); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save your note."); }
    finally { setPending(false); }
  }

  return <form onSubmit={save}>
    <label htmlFor="workspace-note" className="sr-only">Workspace note</label>
    <textarea id="workspace-note" value={content} onChange={(event) => { setContent(event.target.value); setMessage(""); }} readOnly={!canEdit} maxLength={1000} required aria-describedby="note-help" />
    <div className="note-footer"><span id="note-help">{canEdit ? "Shared with everyone in the workspace." : <><LockKeyhole size={13} />Read-only for agents. Switch to reviewer to edit.</>}</span>{canEdit && <button className="button primary small" disabled={pending || !content.trim()}>{pending ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />}Save note</button>}</div>
    {message && <p role="status" className="success-text"><Check size={14} />{message}</p>}{error && <p role="alert" className="error-text">{error}</p>}
  </form>;
}
