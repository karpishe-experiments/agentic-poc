"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { SAMPLE_IMAGE_PATH } from "@/lib/mockups/specialty-management/mentions";

export function SampleResultDialog({ open, description, onDescriptionChange, onClose }: { open: boolean; description: string; onDescriptionChange(value: string): void; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; if (!node) return; if (open && !node.open) node.showModal(); if (!open && node.open) node.close(); }, [open]);
  return <dialog ref={dialog} className="sample-dialog" aria-labelledby="sample-result-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose}>
    <header><div><p>Sample result · not generated</p><h2 id="sample-result-title">Image specialty output</h2></div><button type="button" onClick={onClose}>Close</button></header>
    <Image src={SAMPLE_IMAGE_PATH} width={1120} height={630} alt="A paper-cut moon above hills and a small glowing house" />
    <label>Optional description<textarea name="sample-result-description" autoComplete="off" value={description} onChange={(event) => onDescriptionChange(event.target.value)} placeholder="Describe the image or record text metadata…" /></label>
    <details><summary>Metadata</summary><dl><div><dt>Alt text</dt><dd>A paper-cut moon above hills and a small glowing house.</dd></div><div><dt>Style</dt><dd>Layered paper cut</dd></div><div><dt>Dimensions</dt><dd>1120 × 630</dd></div></dl></details>
  </dialog>;
}
