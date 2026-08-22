"use client";

import { useSyncExternalStore } from "react";
import type { AgentActionState } from "@/app/admin/agents/actions";
import { DirectLifecycleAction, type DialogTarget, type MutationDescriptor } from "@/components/admin/agents/agent-action-dialog";
import { EditAgentForm, type FormMutationStart } from "@/components/admin/agents/agent-forms";
import { getVersionActionEligibility, SLOT_LABELS, slotKeyForVersion, type AgentAdminViewModel, type ResolvedAdminSelection } from "@/components/admin/agents/agent-admin-model";
import type { AgentVersion } from "@/lib/contracts/agents";

let localDateFormatter: Intl.DateTimeFormat | null = null;
const subscribeToNothing = () => () => undefined;

function LocalizedDate({ value }: { value: string }) {
  const hydrated = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  localDateFormatter ??= new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
  const label = hydrated ? localDateFormatter.format(new Date(value)) : value;
  return <time dateTime={value}>{label}</time>;
}

function statusLabel(version: AgentVersion) {
  return `${version.status[0]!.toUpperCase()}${version.status.slice(1)} · ${version.isActive ? "Active" : "Inactive"}`;
}

function ReadOnlyConfiguration({ version }: { version: AgentVersion }) {
  const roleFields: [string, string][] = version.role === "image"
    ? [["Profile", `${version.profileId ?? "—"} v${version.profileVersion ?? "—"}`], ["Quality", version.imageQuality ?? "Profile default"], ["Resolution", version.imageResolution ?? "Profile default"]]
    : [["Reasoning", version.reasoningEffort ? `${version.reasoningEffort[0]!.toUpperCase()}${version.reasoningEffort.slice(1)}` : "Application-owned"], ["Maximum Turns", version.maxTurns === null ? "Application-owned" : String(version.maxTurns)]];
  const values: [string, string][] = [
    ["Display Name", version.displayName],
    ["Purpose", version.purpose],
    ["Role", version.role === "manager" ? "Manager" : version.role === "image" ? "Image agent" : "Specialist"],
    ["Target", SLOT_LABELS[slotKeyForVersion(version)]],
    ["Provider", version.provider],
    ["Model", version.modelId],
    ...roleFields,
  ];  return <div className="grid gap-5">
    <dl className="grid gap-3 sm:grid-cols-2">
      {values.map(([label, value]) => <div key={label} className="min-w-0 rounded-lg bg-stone-50 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">{label}</dt><dd className="mt-1 break-words" translate={label === "Provider" || label === "Model" ? "no" : undefined}>{value}</dd></div>)}
    </dl>
    <section aria-labelledby="instructions-heading">
      <h4 id="instructions-heading" className="font-semibold">Complete Instructions</h4>
      <pre className="mt-2 min-w-0 max-w-full whitespace-pre-wrap break-all rounded-xl border border-[var(--border)] bg-stone-50 p-4 font-mono text-sm leading-6">{version.instructions}</pre>
    </section>
    <details className="rounded-xl border border-[var(--border)] p-4">
      <summary className="cursor-pointer font-semibold">Technical Details</summary>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2" translate="no">
        <div><dt className="font-semibold">Skill ID</dt><dd className="break-all">{version.skillId ?? "—"}</dd></div>
        <div><dt className="font-semibold">Definition ID</dt><dd className="break-all">{version.agentId}</dd></div>
        <div><dt className="font-semibold">Version ID</dt><dd className="break-all">{version.id}</dd></div>
        <div><dt className="font-semibold">Parent Version ID</dt><dd className="break-all">{version.parentVersionId ?? "—"}</dd></div>
        <div><dt className="font-semibold">Revision</dt><dd className="tabular-nums">{version.revision}</dd></div>
        <div><dt className="font-semibold">Created By</dt><dd>{version.createdBy}</dd></div>
        <div><dt className="font-semibold">Updated By</dt><dd>{version.updatedBy}</dd></div>
        <div><dt className="font-semibold">Created</dt><dd><LocalizedDate value={version.createdAt} /></dd></div>
        <div><dt className="font-semibold">Updated</dt><dd><LocalizedDate value={version.updatedAt} /></dd></div>
      </dl>
    </details>
  </div>;
}

export function AgentVersionWorkspace({ snapshot, selection, editing, onSelectVersion, onEdit, onNewAgent, onCancelEdit, onDirtyChange, onFormMutationStart, onMutationStart, onResult, onOpenDialog }: {
  snapshot: AgentAdminViewModel;
  selection: ResolvedAdminSelection;
  editing: boolean;
  onSelectVersion(versionId: string): void;
  onEdit(): void;
  onNewAgent(): void;
  onCancelEdit(): void;
  onDirtyChange(dirty: boolean): void;
  onFormMutationStart(input: FormMutationStart): void;
  onMutationStart(descriptor: MutationDescriptor): void;
  onResult(state: AgentActionState): void;
  onOpenDialog(target: Omit<DialogTarget, "trigger">, trigger: HTMLButtonElement): void;
}) {
  const { slot, agent, version } = selection;
  if (!agent || !version) return <section aria-labelledby="workspace-heading" className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
    <p className="text-sm font-semibold uppercase tracking-wide text-[var(--accent)]">{SLOT_LABELS[slot.key]}</p>
    <h2 id="workspace-heading" className="mt-1 text-2xl font-semibold">No Agent Candidates</h2>
    <p className="mt-3 text-[var(--muted-ink)]">{slot.violation ?? "This slot has no saved logical agents."} Create an inactive draft, then activate a valid version to restore coverage.</p>
    <button type="button" onClick={onNewAgent} className="mt-5 rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-white hover:brightness-95">New Agent</button>
  </section>;

  if (editing) return <section aria-labelledby="workspace-heading" className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
    <p className="text-sm font-semibold uppercase tracking-wide text-[var(--accent)]">{SLOT_LABELS[slot.key]}</p>
    <h2 id="workspace-heading" className="mt-1 text-2xl font-semibold">Edit {version.displayName}</h2>
    <p className="mb-5 mt-2 text-sm text-[var(--muted-ink)]">Version {version.versionNumber} · {statusLabel(version)}</p>
    <EditAgentForm key={version.id} version={version} skills={snapshot.skillChoices} onCancel={onCancelEdit} onDirtyChange={onDirtyChange} onMutationStart={onFormMutationStart} onResult={onResult} />
  </section>;

  const eligibility = getVersionActionEligibility(version);
  const versionSlot = snapshot.coverage.find((candidate) => candidate.key === slotKeyForVersion(version));
  const occupyingVersion = snapshot.versions.find((candidate) => candidate.id === versionSlot?.activeVersionId) ?? null;
  const logicalActive = agent.versions.find((candidate) => candidate.isActive) ?? null;
  const dialogBase = { version, occupyingVersion, observedSlotVersionId: versionSlot?.activeVersionId ?? null, observedLogicalActiveVersionId: logicalActive?.id ?? null };

  return <section aria-labelledby="workspace-heading" className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
    <header className="border-b border-[var(--border)] pb-5">
      <p className="text-sm font-semibold uppercase tracking-wide text-[var(--accent)]">{SLOT_LABELS[slot.key]}</p>
      <h2 id="workspace-heading" className="mt-1 text-2xl font-semibold">{version.displayName}</h2>
      <p className={`mt-2 text-sm ${slot.violation ? "text-red-700" : "text-green-700"}`}>{slot.violation ? `${slot.violation}. Review an inactive version and activate a valid replacement.` : "Coverage healthy"}</p>
    </header>


    <section aria-labelledby="versions-heading" className="mt-5">
      <h3 id="versions-heading" className="font-semibold">Versions</h3>
      <ul className="mt-2 flex flex-wrap gap-2">{agent.versions.map((candidate) => <li key={candidate.id}><button type="button" aria-current={candidate.id === version.id ? "true" : undefined} onClick={() => onSelectVersion(candidate.id)} className={`rounded-lg border px-3 py-2 text-left hover:border-[var(--accent)] hover:bg-orange-50 ${candidate.id === version.id ? "border-[var(--accent)] bg-orange-50" : "border-[var(--border)]"}`}><span className="font-semibold tabular-nums">Version {candidate.versionNumber}</span><span className="ml-2 text-sm text-[var(--muted-ink)]">{statusLabel(candidate)}</span><span className="mt-1 block text-xs text-[var(--muted-ink)]"><LocalizedDate value={candidate.updatedAt} /></span></button></li>)}</ul>
    </section>

    <div className="mt-6"><ReadOnlyConfiguration version={version} /></div>

    <section aria-labelledby="actions-heading" className="mt-6 border-t border-[var(--border)] pt-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="actions-heading" className="mr-auto font-semibold">Version Actions</h3>
        {version.status === "draft" ? <button type="button" onClick={onEdit} className="rounded-lg border border-[var(--accent)] px-4 py-2 font-semibold text-[var(--accent)] hover:bg-orange-50">Edit Draft</button> : null}
        <DirectLifecycleAction descriptor={{ kind: "fork", version }} visible={eligibility.fork} onMutationStart={onMutationStart} onResult={onResult} />
        <DirectLifecycleAction descriptor={{ kind: "confirm", version }} visible={eligibility.confirm} onMutationStart={onMutationStart} onResult={onResult} />
        {eligibility.activate ? <button type="button" onClick={(event) => onOpenDialog({ kind: "activate", ...dialogBase }, event.currentTarget)} className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-white hover:brightness-95">{version.role === "manager" ? "Activate Replacement" : "Activate Candidate"}</button> : null}
        {eligibility.deactivate ? <button type="button" onClick={(event) => onOpenDialog({ kind: "deactivate", ...dialogBase }, event.currentTarget)} className="rounded-lg border border-red-700 px-4 py-2 font-semibold text-red-800 hover:bg-red-50">Deactivate Candidate</button> : null}
      </div>
      {eligibility.retire || eligibility.deleteDraft ? <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
        <h4 className="font-semibold text-red-900">Danger Zone</h4>
        <div className="mt-3 flex flex-wrap gap-2">
          {eligibility.retire ? <button type="button" onClick={(event) => onOpenDialog({ kind: "retire", ...dialogBase }, event.currentTarget)} className="rounded-lg border border-red-700 px-4 py-2 font-semibold text-red-800 hover:bg-red-100">Retire</button> : null}
          {eligibility.deleteDraft ? <button type="button" onClick={(event) => onOpenDialog({ kind: "delete", ...dialogBase }, event.currentTarget)} className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-800">Delete Draft</button> : null}
        </div>
      </div> : null}
    </section>
  </section>;
}
