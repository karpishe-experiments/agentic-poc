"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import type { AgentManagementService } from "@/lib/application/agent-management-service";
import type { AgentVersion } from "@/lib/contracts/agents";
import { activateAgent, confirmAgent, createAgent, deleteAgentDraft, forkAgent, retireAgent, saveAgentDraft, type AgentActionState } from "@/app/admin/agents/actions";

type Snapshot = Awaited<ReturnType<AgentManagementService["getAdminSnapshot"]>>;
const models = ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"];
const initialAgentActionState: AgentActionState = { kind: "idle", message: "" };

function ActionMessage({ state }: { state: AgentActionState }) {
  return state.kind === "idle" ? null : <p className={state.kind === "success" ? "text-green-700" : "text-red-700"} aria-live="polite" role={state.kind === "success" ? "status" : "alert"}>{state.message}</p>;
}

function FieldErrors({ state }: { state: AgentActionState }) {
  const entries = Object.entries(state.fieldErrors ?? {});
  const firstField = entries[0]?.[0];
  useEffect(() => {
    if (!firstField) return;
    document.querySelector<HTMLElement>(`[name="${firstField}"]:not([type="hidden"])`)?.focus();
  }, [firstField]);
  if (!entries.length) return null;
  return <ul className="grid gap-1 text-sm text-red-700" aria-live="polite">{entries.map(([field, message]) => <li key={field}><strong>{field}:</strong> {message}</li>)}</ul>;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="rounded-lg bg-[var(--accent)] px-3 py-2 font-semibold text-white hover:brightness-95 disabled:cursor-wait disabled:opacity-70" type="submit" disabled={pending}>{pending ? "Saving…" : label}</button>;
}

function defaultSettings(role: string, skill: string) {
  const manager = role === "manager";
  return {
    modelId: manager ? "gpt-5.6-luna" : skill === "quality_review_targeted_repair@1" ? "gpt-5.6-sol" : "gpt-5.6-terra",
    reasoningEffort: manager ? "low" : "medium",
    maxTurns: manager ? "2" : "1",
  };
}

function useDirtyForm() {
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const beforeNavigation = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || new URL(anchor.href).origin !== window.location.origin) return;
      if (window.confirm("Discard unsaved agent changes?")) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeNavigation, true);
    };
  }, [dirty]);
  return { markDirty: () => setDirty(true), clearDirty: () => setDirty(false) };
}

function LifecycleForm({ version, action, label, observedSlotVersionId, observedLogicalActiveVersionId, destructive = false, confirmationDetail }: { version: AgentVersion; action: typeof forkAgent | typeof confirmAgent | typeof activateAgent | typeof retireAgent | typeof deleteAgentDraft; label: string; observedSlotVersionId?: string | null; observedLogicalActiveVersionId?: string | null; destructive?: boolean; confirmationDetail?: string }) {
  const [state, formAction] = useActionState(action as never, initialAgentActionState);
  return <form action={formAction} onSubmit={(event) => { if ((destructive || confirmationDetail) && !window.confirm(confirmationDetail ?? `${label} ${version.displayName}? This cannot be undone.`)) event.preventDefault(); }} className="inline-flex flex-col gap-1">
    <input type="hidden" name="id" value={version.id} />
    <input type="hidden" name="expectedRevision" value={version.revision} />
    {observedSlotVersionId !== undefined ? <input type="hidden" name="observedSlotVersionId" value={observedSlotVersionId ?? ""} /> : null}
    {observedLogicalActiveVersionId !== undefined ? <input type="hidden" name="observedLogicalActiveVersionId" value={observedLogicalActiveVersionId ?? ""} /> : null}
    <SubmitButton label={label} />
    <ActionMessage state={state as AgentActionState} />
  </form>;
}

function AgentFields({ version, skills, isCreate = false }: { version?: AgentVersion; skills: string[]; isCreate?: boolean }) {
  const [role, setRole] = useState(version?.role ?? "");
  const [skill, setSkill] = useState(version?.skillId ?? "");
  const seededDefaults = defaultSettings(version?.role ?? "", version?.skillId ?? "");
  const [modelId, setModelId] = useState(version?.modelId ?? seededDefaults.modelId);
  const [reasoningEffort, setReasoningEffort] = useState(version?.reasoningEffort ?? seededDefaults.reasoningEffort);
  const [maxTurns, setMaxTurns] = useState(String(version?.maxTurns ?? seededDefaults.maxTurns));
  const [touched, setTouched] = useState({ model: false, reasoning: false, maxTurns: false });
  const isManager = role === "manager";
  const disabledIdentity = Boolean(version?.isActive || (version && version.status !== "draft"));
  const refreshUntouchedDefaults = (nextRole: string, nextSkill: string) => {
    const defaults = defaultSettings(nextRole, nextSkill);
    setModelId((current) => touched.model ? current : defaults.modelId);
    setReasoningEffort((current) => touched.reasoning ? current : defaults.reasoningEffort);
    setMaxTurns((current) => touched.maxTurns ? current : defaults.maxTurns);
  };
  return <fieldset className="grid gap-3">
    <label>Display name<input name="displayName" autoComplete="off" required maxLength={120} defaultValue={version?.displayName} className="block w-full rounded border p-2" /></label>
    <label>Purpose<textarea name="purpose" autoComplete="off" required maxLength={1000} defaultValue={version?.purpose} className="block min-h-16 w-full rounded border p-2" /></label>
    <label>Role<select name="role" required value={role} disabled={disabledIdentity} onChange={(event) => { const nextRole = event.target.value; const nextSkill = nextRole === "manager" ? "" : skill; setRole(nextRole); setSkill(nextSkill); refreshUntouchedDefaults(nextRole, nextSkill); }} className="block w-full rounded border bg-white p-2"><option value="">Choose a role</option><option value="manager">Manager</option><option value="specialist">Specialist</option></select></label>
    {disabledIdentity ? <><input type="hidden" name="role" value={role} /><input type="hidden" name="skillId" value={skill} /></> : null}
    <label>Skill binding<select name="skillId" value={skill} disabled={disabledIdentity || !role || isManager} onChange={(event) => { const nextSkill = event.target.value; setSkill(nextSkill); refreshUntouchedDefaults(role, nextSkill); }} className="block w-full rounded border bg-white p-2"><option value="">{isManager ? "Managers have no skill binding" : "Choose a registered skill"}</option>{skills.map((id) => <option key={id} value={id}>{id}</option>)}</select></label>
    <label>Provider<input readOnly name="provider" value="openai" className="block w-full rounded border bg-slate-100 p-2" /></label>
    <label>Model<select name="modelId" value={modelId} onChange={(event) => { setTouched((current) => ({ ...current, model: true })); setModelId(event.target.value); }} className="block w-full rounded border bg-white p-2">{models.map((model) => <option key={model} value={model}>{model}</option>)}</select></label>
    <label>Reasoning<select name="reasoningEffort" value={reasoningEffort} onChange={(event) => { setTouched((current) => ({ ...current, reasoning: true })); setReasoningEffort(event.target.value); }} className="block w-full rounded border bg-white p-2"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
    <label>Maximum turns<input name="maxTurns" type="number" min={1} max={isManager ? 2 : 1} value={maxTurns} onChange={(event) => { setTouched((current) => ({ ...current, maxTurns: true })); setMaxTurns(event.target.value); }} className="block w-full rounded border p-2" /></label>
    <label>Complete instructions<textarea name="instructions" autoComplete="off" required maxLength={20000} defaultValue={version?.instructions} className="block min-h-48 w-full rounded border p-2 font-mono text-sm" /></label>
    {isCreate ? <p className="text-sm text-[var(--muted-ink)]">Instructions are snapshotted in model-call evidence. Do not include secrets or private data.</p> : null}
  </fieldset>;
}

function DraftEditor({ version, skills }: { version: AgentVersion; skills: string[] }) {
  const [state, formAction] = useActionState(saveAgentDraft, initialAgentActionState);
  const { markDirty, clearDirty } = useDirtyForm();
  useEffect(() => { if (state.kind === "success") clearDirty(); }, [state.kind, clearDirty]);
  return <form action={formAction} onChange={markDirty} className="mt-4 grid gap-3 border-t pt-4"><input type="hidden" name="id" value={version.id} /><input type="hidden" name="expectedRevision" value={version.revision} /><AgentFields version={version} skills={skills} /><SubmitButton label="Save Draft" /><FieldErrors state={state} /><ActionMessage state={state} /></form>;
}

function CreateAgentForm({ skills }: { skills: string[] }) {
  const [state, createFormAction] = useActionState(createAgent, initialAgentActionState);
  const { markDirty, clearDirty } = useDirtyForm();
  useEffect(() => { if (state.kind === "success") clearDirty(); }, [state.kind, clearDirty]);
  return <form action={createFormAction} onChange={markDirty} className="mt-4 grid gap-3"><AgentFields skills={skills} isCreate /><SubmitButton label="Create Draft" /><FieldErrors state={state} /><ActionMessage state={state} /></form>;
}

export function AgentAdmin({ snapshot }: { snapshot: Snapshot }) {
  return <section className="mx-auto max-w-5xl space-y-8">
    <header><p className="text-sm font-medium uppercase tracking-wide text-[var(--accent)]">Trusted local backoffice</p><h1 className="text-4xl font-semibold">Runtime agents</h1><p className="mt-2 rounded-lg border border-amber-400 bg-amber-50 p-3 text-amber-950">No authentication: use only in trusted local development. Do not expose this page on an untrusted network.</p></header>
    <section aria-labelledby="coverage-heading"><h2 id="coverage-heading" className="text-2xl font-semibold">Active coverage</h2><ul className="mt-3 grid gap-3 md:grid-cols-2">{snapshot.coverage.map((slot) => <li key={slot.key} className="rounded-xl border bg-[var(--surface)] p-4"><strong>{slot.key}</strong><p>{slot.violation ?? `Active: ${slot.activeVersionId}`}</p></li>)}</ul></section>
    <section aria-labelledby="create-heading" className="rounded-xl border bg-[var(--surface)] p-5"><h2 id="create-heading" className="text-2xl font-semibold">Create inactive draft</h2><CreateAgentForm skills={snapshot.skillChoices} /></section>
    <section aria-labelledby="versions-heading"><h2 id="versions-heading" className="text-2xl font-semibold">Logical agents and version history</h2><div className="mt-3 space-y-3">{snapshot.definitions.map((definition) => { const versions = snapshot.versions.filter((version) => version.agentId === definition.id); return <article key={definition.id} className="rounded-xl border bg-[var(--surface)] p-4"><h3 className="font-semibold">{versions[0]?.displayName ?? definition.id}</h3>{versions.map((version) => { const slot = snapshot.coverage.find((entry) => entry.role === version.role && entry.skillId === version.skillId); const logicalActive = versions.find((candidate) => candidate.isActive); const occupyingVersion = snapshot.versions.find((candidate) => candidate.id === slot?.activeVersionId); return <details key={version.id} className="mt-3 rounded border p-3"><summary className="cursor-pointer font-medium">Version {version.versionNumber} · {version.status} · {version.isActive ? "active" : "inactive"}</summary><p className="mt-2 break-all text-sm">{version.role}{version.skillId ? ` · ${version.skillId}` : ""} · {version.modelId} · {version.reasoningEffort}</p>{version.status === "draft" ? <DraftEditor version={version} skills={snapshot.skillChoices} /> : <p className="mt-3 text-sm">Confirmed and retired versions are immutable. Fork to edit a new draft.</p>}<div className="mt-4 flex flex-wrap gap-2"><LifecycleForm version={version} action={forkAgent} label="Fork" />{version.status === "draft" ? <LifecycleForm version={version} action={confirmAgent} label="Confirm" /> : null}{version.status !== "retired" ? <LifecycleForm version={version} action={activateAgent} label="Activate Replacement" observedSlotVersionId={slot?.activeVersionId ?? null} observedLogicalActiveVersionId={logicalActive?.id ?? null} confirmationDetail={`Activate ${version.displayName} for future calls${occupyingVersion && occupyingVersion.id !== version.id ? ` and replace ${occupyingVersion.displayName}` : ""}?`} /> : null}{!version.isActive && version.status !== "retired" ? <LifecycleForm version={version} action={retireAgent} label="Retire" destructive /> : null}{!version.isActive && version.status === "draft" ? <LifecycleForm version={version} action={deleteAgentDraft} label="Delete Eligible Draft" destructive /> : null}</div></details>; })}</article>; })}</div></section>
  </section>;
}
