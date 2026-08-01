"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type CreateResponse = { data?: { id: string }; error?: { message?: string } };

export function CreateBookletForm() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/booklets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea }),
      });
      const body = (await response.json()) as CreateResponse;
      if (!response.ok || !body.data) {
        setError(body.error?.message ?? "We could not create that booklet. Please try again.");
        return;
      }
      router.push(`/booklets/${body.data.id}`);
    } catch {
      setError("We could not create that booklet. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm" onSubmit={onSubmit}>
      <label className="block text-base font-semibold" htmlFor="story-idea">Start with a story idea</label>
      <p className="mt-1 text-sm text-[var(--muted-ink)]">One sentence is enough. You can shape the details as you go.</p>
      <textarea
        id="story-idea"
        name="idea"
        value={idea}
        onChange={(event) => setIdea(event.target.value)}
        className="mt-3 min-h-28 w-full rounded-xl border border-[var(--border)] bg-white p-3 text-base outline-offset-2 focus:border-[var(--accent)]"
        placeholder="For example: A shy fox learns to ask for help while building a kite."
        required
        maxLength={5000}
        disabled={isSubmitting}
      />
      {error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}
      <button className="mt-3 rounded-xl bg-[var(--accent)] px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Creating booklet…" : "Create booklet"}
      </button>
    </form>
  );
}
