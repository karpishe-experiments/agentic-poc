"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { activateAgent, confirmAgent, deleteAgentDraft, forkAgent, retireAgent, type AgentActionState } from "@/app/admin/agents/actions";
import type { AgentVersion } from "@/lib/contracts/agents";

const initialAgentActionState: AgentActionState = { kind: "idle", message: "" };

export type MutationKind = "fork" | "confirm" | "activate" | "retire" | "delete";
type DialogMutationKind = "activate" | "retire" | "delete";

export type MutationDescriptor = {
  kind: MutationKind;
  version: AgentVersion;
};

export type DialogTarget = Omit<MutationDescriptor, "kind"> & {
  kind: DialogMutationKind;
  occupyingVersion: AgentVersion | null;
  observedSlotVersionId: string | null;
  observedLogicalActiveVersionId: string | null;
  trigger: HTMLButtonElement;
};

const directActions = { fork: forkAgent, confirm: confirmAgent } as const;
const dialogActions = { activate: activateAgent, retire: retireAgent, delete: deleteAgentDraft } as const;
const directLabels = {
  fork: { idle: "Fork", pending: "Forking…" },
  confirm: { idle: "Confirm", pending: "Confirming…" },
} as const;

function ActionSubmit({ label, pendingLabel, danger = false }: { label: string; pendingLabel: string; danger?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={`rounded-lg px-4 py-2 font-semibold text-white disabled:cursor-wait disabled:opacity-70 ${danger ? "bg-red-700 hover:bg-red-800" : "bg-[var(--accent)] hover:brightness-95"}`}>{pending ? pendingLabel : label}</button>;
}

export function DirectLifecycleAction({ descriptor, visible = true, onMutationStart, onResult }: { descriptor: MutationDescriptor & { kind: "fork" | "confirm" }; visible?: boolean; onMutationStart(descriptor: MutationDescriptor): void; onResult(state: AgentActionState): void }) {
  const [state, formAction] = useActionState(directActions[descriptor.kind] as never, initialAgentActionState);
  const handled = useRef<AgentActionState | null>(null);
  useEffect(() => {
    if (state.kind === "idle" || handled.current === state) return;
    handled.current = state;
    onResult(state);
  }, [onResult, state]);
  const labels = directLabels[descriptor.kind];
  if (!visible) return null;
  return <form action={formAction} onSubmit={() => onMutationStart(descriptor)}>
    <input type="hidden" name="id" value={descriptor.version.id} />
    <input type="hidden" name="expectedRevision" value={descriptor.version.revision} />
    <ActionSubmit label={labels.idle} pendingLabel={labels.pending} />
  </form>;
}

function dialogCopy(target: DialogTarget) {
  const versionName = `${target.version.displayName} version ${target.version.versionNumber}`;
  if (target.kind === "activate") {
    const occupant = target.occupyingVersion && target.occupyingVersion.id !== target.version.id
      ? `${target.occupyingVersion.displayName} version ${target.occupyingVersion.versionNumber}`
      : "the currently empty slot";
    return {
      title: "Activate Replacement",
      description: `Activate ${versionName} and replace ${occupant}? This affects future calls only; past evidence keeps its original configuration.`,
      confirm: "Activate Replacement",
      pending: "Activating…",
      danger: false,
    };
  }
  if (target.kind === "retire") return {
    title: "Retire Version",
    description: `Retire ${versionName}? It becomes immutable and cannot be activated again.`,
    confirm: "Retire Version",
    pending: "Retiring…",
    danger: true,
  };
  return {
    title: "Delete Draft",
    description: `Delete ${versionName}? Deletion succeeds only for an unused, childless inactive draft and cannot be undone.`,
    confirm: "Delete Draft",
    pending: "Deleting…",
    danger: true,
  };
}

export function AgentActionDialog({ target, onClose, onMutationStart, onResult }: { target: DialogTarget; onClose(): void; onMutationStart(descriptor: MutationDescriptor): void; onResult(state: AgentActionState): void }) {
  const [state, formAction] = useActionState(dialogActions[target.kind] as never, initialAgentActionState);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const handled = useRef<AgentActionState | null>(null);
  const copy = dialogCopy(target);

  const close = () => {
    if (submitting) return;
    dialogRef.current?.close();
    target.trigger.focus();
    onClose();
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    cancelRef.current?.focus();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  useEffect(() => {
    if (state.kind === "idle" || handled.current === state) return;
    handled.current = state;
    setSubmitting(false);
    onResult(state);
    dialogRef.current?.close();
    target.trigger.focus();
    onClose();
  }, [onClose, onResult, state, target.trigger]);

  return <dialog ref={dialogRef} aria-labelledby="agent-action-title" aria-describedby="agent-action-description" onCancel={(event) => { if (submitting) event.preventDefault(); else { event.preventDefault(); close(); } }} className="m-auto max-h-[min(90vh,36rem)] w-[min(92vw,34rem)] overscroll-contain rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--ink)] shadow-2xl backdrop:bg-stone-950/45">
    <div className="grid gap-4 p-6">
      <div>
        <h2 id="agent-action-title" className="text-2xl font-semibold">{copy.title}</h2>
        <p id="agent-action-description" className="mt-2 text-pretty text-[var(--muted-ink)]">{copy.description}</p>
      </div>
      <form action={formAction} onSubmit={() => { setSubmitting(true); onMutationStart(target); }} className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-4">
        <input type="hidden" name="id" value={target.version.id} />
        <input type="hidden" name="expectedRevision" value={target.version.revision} />
        {target.kind === "activate" ? <>
          <input type="hidden" name="observedSlotVersionId" value={target.observedSlotVersionId ?? ""} />
          <input type="hidden" name="observedLogicalActiveVersionId" value={target.observedLogicalActiveVersionId ?? ""} />
        </> : null}
        <button ref={cancelRef} type="button" disabled={submitting} onClick={close} className="rounded-lg border border-[var(--border)] px-4 py-2 font-semibold hover:bg-stone-100 disabled:opacity-70">Cancel</button>
        <ActionSubmit label={copy.confirm} pendingLabel={copy.pending} danger={copy.danger} />
      </form>
    </div>
  </dialog>;
}
