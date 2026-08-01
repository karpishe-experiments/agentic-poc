import Link from "next/link";

export default function NotFound() {
  return (
    <section>
      <h1>Page not found</h1>
      <p>The requested booklet or page does not exist.</p>
      <Link href="/">Return Home</Link>
    </section>
  );
}
