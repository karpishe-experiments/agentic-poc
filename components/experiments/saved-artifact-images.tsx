"use client";

import Image from "next/image";
import { useState } from "react";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function assetId(value: unknown): string | null {
  return typeof value === "string" && uuid.test(value) ? value : null;
}

function savedImages(taskId: string, content: unknown): Array<{ id: string; label: string }> {
  const saved = record(content);
  if (!saved) return [];
  if (taskId === "J08") {
    if (!Array.isArray(saved.samples)) return [];
    return saved.samples.flatMap((entry) => {
      const sample = record(entry);
      const key = sample?.sampleKey;
      if (key !== "sample_1" && key !== "sample_2") return [];
      const id = assetId(record(sample?.build)?.assetId);
      return id ? [{ id, label: key === "sample_1" ? "Style sample 1" : "Style sample 2" }] : [];
    });
  }
  if (taskId === "J09" || taskId === "J10") {
    const id = assetId(record(saved.build)?.assetId);
    if (!id) return [];
    const title = typeof saved.title === "string" && saved.title.trim() ? saved.title.trim() : taskId === "J09" ? "Character reference sheet" : "Location reference sheet";
    return [{ id, label: `${title} image` }];
  }
  if (taskId === "J13") {
    const id = assetId(saved.assetId);
    const index = saved.pageIndex;
    if (!id || typeof index !== "number" || !Number.isInteger(index) || index < 0) return [];
    return [{ id, label: index === 0 ? "Cover image" : `Page ${index} image` }];
  }
  return [];
}

function SavedImage({ id, label, simulated }: { id: string; label: string; simulated: boolean }) {
  const [dimensions, setDimensions] = useState({ width: 640, height: 640 });
  const [failed, setFailed] = useState(false);
  const url = `/api/assets/${id}`;
  return <figure className="space-y-2">
    <figcaption className="text-sm font-medium">{label}{simulated ? " · Simulated fixture" : ""}</figcaption>
    {failed ? <p role="alert" className="text-sm text-red-700">{label} could not be loaded. The saved image may be missing or corrupt.</p> : <Image src={url} alt={label} unoptimized width={dimensions.width} height={dimensions.height} sizes="(max-width: 768px) 100vw, 640px" className="h-auto max-w-full" onLoad={(event) => {
      const { naturalWidth, naturalHeight } = event.currentTarget;
      if (naturalWidth > 0 && naturalHeight > 0) setDimensions({ width: naturalWidth, height: naturalHeight });
      else setFailed(true);
    }} onError={() => setFailed(true)} />}
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm underline">Open original {label.toLowerCase()}</a>
  </figure>;
}

export function SavedArtifactImages({ taskId, content, simulated }: { taskId: string; content: unknown; simulated: boolean }) {
  const images = savedImages(taskId, content);
  return images.length ? <div className="grid gap-4 sm:grid-cols-2">{images.map(({ id, label }) => <SavedImage key={`${label}:${id}`} id={id} label={label} simulated={simulated} />)}</div> : null;
}
