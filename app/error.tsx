"use client";

export default function GlobalError({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <html lang="en">
      <body className="bg-[var(--canvas)] text-[var(--ink)]">
        <main className="mx-auto grid min-h-screen max-w-xl content-center gap-4 p-6">
          <h1>Something went wrong</h1>
          <p>Your saved work is retained. Try the workspace again, or reload it if local browser files are out of date.</p>
          <div className="flex flex-wrap gap-3">
            <button className="rounded-lg bg-[var(--accent)] px-3 py-2 font-semibold text-white" type="button" onClick={reset}>Try again</button>
            <button className="rounded-lg border border-[var(--accent)] px-3 py-2 font-semibold text-[var(--accent)]" type="button" onClick={() => window.location.reload()}>Reload workspace</button>
          </div>
        </main>
      </body>
    </html>
  );
}
