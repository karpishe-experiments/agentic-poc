"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function DifyExperimentLink() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/experiments/dify/setup", { signal: controller.signal })
      .then((response) => setAvailable(response.ok))
      .catch(() => setAvailable(false));
    return () => controller.abort();
  }, []);

  return available ? <Link className="text-sm text-[var(--muted-ink)]" href="/experiments/dify">Dify experiment</Link> : null;
}
