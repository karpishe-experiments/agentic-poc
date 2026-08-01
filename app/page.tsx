export default function HomePage() {
  return (
    <section className="max-w-2xl space-y-5">
      <p className="text-sm font-medium uppercase tracking-[0.16em] text-[var(--accent)]">Local proof of concept</p>
      <h1 className="text-4xl font-semibold tracking-tight">Make a children’s picture storybook with a guided creative partner.</h1>
      <p className="max-w-xl text-lg leading-8 text-[var(--muted-ink)]">
        The workspace will turn an idea into an illustrated, reviewable booklet and a downloadable PDF.
      </p>
      <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-sm text-[var(--muted-ink)]">
        The persisted booklet workflow is being added in the next implementation slice.
      </p>
    </section>
  );
}
