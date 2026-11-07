import Link from "next/link";

export default function NotFound() {
  return <main className="empty-state"><div className="eyebrow">404 · NOT FOUND</div><h1>No tool here. Yet.</h1><p>This page doesn’t exist in the workspace.</p><Link href="/" className="button primary">Back to overview</Link></main>;
}
