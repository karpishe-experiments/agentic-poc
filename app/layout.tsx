import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kids Booklet",
  description: "A local AI-assisted children’s picture storybook workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-4">
          <nav aria-label="Main navigation" className="mx-auto flex max-w-6xl items-center justify-between">
            <Link className="font-semibold no-underline" href="/">
              Kids Booklet
            </Link>
            <Link className="text-sm text-[var(--muted-ink)]" href="/help">
              Help
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
