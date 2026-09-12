import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import "./globals.css";

const nunito = localFont({ src: "../seeds/fonts/nunito/Nunito-Variable.ttf", display: "swap", variable: "--font-nunito" });

export const metadata: Metadata = {
  title: "Kids Booklet",
  description: "A local AI-assisted children’s picture storybook workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={nunito.variable} lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <header className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-4">
          <nav aria-label="Main navigation" className="mx-auto flex max-w-6xl items-center justify-between">
            <Link className="font-semibold no-underline" href="/">
              Kids Booklet
            </Link>
            <div className="flex gap-4"><Link className="text-sm text-[var(--muted-ink)]" href="/help">Help</Link><Link className="text-sm text-[var(--muted-ink)]" href="/admin/agents">Agents</Link><Link className="text-sm text-[var(--muted-ink)]" href="/mockups/specialty-management">Agent Studio</Link></div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl px-6 py-10" id="main-content">{children}</main>
      </body>
    </html>
  );
}
