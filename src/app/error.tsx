"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <main className="empty-state"><h1>Something didn’t load.</h1><p>Please try again. Your saved workspace data is still in SQLite.</p><button className="button primary" onClick={reset}>Try again</button></main>;
}
