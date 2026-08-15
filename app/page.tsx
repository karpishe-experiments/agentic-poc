import { getBookletService } from "@/lib/application/booklet-service";
import { BookletList } from "@/components/home/booklet-list";
import { CreateBookletForm } from "@/components/home/create-booklet-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const booklets = await getBookletService().list();

  return (
    <section className="max-w-3xl space-y-8">
      <p className="text-sm font-medium uppercase tracking-[0.16em] text-[var(--accent)]">Local proof of concept</p>
      <h1 className="text-4xl font-semibold tracking-tight">Make a children’s picture storybook with a guided creative partner.</h1>
      <p className="max-w-xl text-lg leading-8 text-[var(--muted-ink)]">
        The workspace will turn an idea into an illustrated, reviewable booklet and a downloadable PDF.
      </p>
      <CreateBookletForm />
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Your booklets</h2>
        <BookletList booklets={booklets} />
      </section>
    </section>
  );
}
