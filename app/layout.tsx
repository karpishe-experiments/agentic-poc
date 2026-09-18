import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import { DifyExperimentLink } from "@/components/dify-experiment/dify-experiment-link";
import "./globals.css";

const inter = localFont({
  src: "../seeds/fonts/inter/InterVariable.ttf",
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Kids Booklet",
  description: "A local AI-assisted children’s picture storybook workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={inter.variable} lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <header className="app-header">
          <nav aria-label="Main navigation" className="mx-auto flex max-w-6xl items-center justify-between">
            <Link className="font-semibold no-underline" href="/">
              Kids Booklet
            </Link>
            <div className="flex gap-4"><Link className="text-sm text-[var(--muted-ink)]" href="/help">Help</Link><Link className="text-sm text-[var(--muted-ink)]" href="/admin/agents">Agents</Link><Link className="text-sm text-[var(--muted-ink)]" href="/mockups/specialty-management?view=directory">Agent Studio</Link><DifyExperimentLink /></div>
          </nav>
        </header>
        <main className="app-main" id="main-content">{children}</main>
      </body>
    </html>
  );
}
