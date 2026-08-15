"use client";
export default function AgentsError({ reset }: { error: Error; reset: () => void }) { return <section><h1>Agents could not load</h1><p>The local agent configuration is unchanged.</p><button onClick={reset}>Retry</button></section>; }
