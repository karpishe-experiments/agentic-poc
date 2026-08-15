"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createAgent, saveAgentDraft, type AgentActionState } from "@/app/admin/agents/actions";
import type { AgentVersion } from "@/lib/contracts/agents";
import type { SkillId } from "@/lib/contracts/skills";

const models = ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"] as const;
const initialAgentActionState: AgentActionState = { kind: "idle", message: "" };

export type FormMutationStart = {
  kind: "create" | "save";
  version?: AgentVersion;
  role?: string;
  skillId?: string;
};

type FormCallbacks = {
  onCancel(): void;
  onDirtyChange(dirty: boolean): void;
  onMutationStart(input: FormMutationStart): void;
  onResult(state: AgentActionState): void;
};

function defaultSettings(role: string, skill: string) {
  const manager = role === "manager";
  return {
    modelId: manager ? "gpt-5.6-luna" : skill === "quality_review_targeted_repair@1" ? "gpt-5.6-sol" : "gpt-5.6-terra",
    reasoningEffort: manager ? "low" : "medium",
    maxTurns: manager ? "2" : "1",
  };
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return <button className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-white hover:brightness-95 disabled:cursor-wait disabled:opacity-70" type="submit" disabled={pending}>{pending ? pendingLabel : label}</button>;
}

function FieldError({ field, state }: { field: string; state: AgentActionState }) {
  const message = state.fieldErrors?.[field];
  return message ? <span id={`${field}-error`} className="mt-1 block text-sm text-red-700">{message}</span> : null;
}

function controlProps(field: string, state: AgentActionState) {
  const invalid = Boolean(state.fieldErrors?.[field]);
  return { "aria-invalid": invalid || undefined, "aria-describedby": invalid ? `${field}-error` : undefined };
}

function AgentFields({ version, skills, state, isCreate = false }: { version?: AgentVersion; skills: SkillId[]; state: AgentActionState; isCreate?: boolean }) {
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

  return <fieldset className="grid gap-4">
    <legend className="sr-only">Agent configuration</legend>
    <label htmlFor="displayName" className="font-medium">Display Name
      <input id="displayName" name="displayName" autoComplete="off" required maxLength={120} defaultValue={version?.displayName} className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-white p-2.5" {...controlProps("displayName", state)} />
      <FieldError field="displayName" state={state} />
    </label>
    <label htmlFor="purpose" className="font-medium">Purpose
      <textarea id="purpose" name="purpose" autoComplete="off" required maxLength={1000} defaultValue={version?.purpose} className="mt-1 block min-h-20 w-full rounded-lg border border-[var(--border)] bg-white p-2.5" {...controlProps("purpose", state)} />
      <FieldError field="purpose" state={state} />
    </label>
    <div>
      <label htmlFor="role" className="font-medium">Role</label>
      <select id="role" name="role" required value={role} disabled={disabledIdentity} onChange={(event) => { const nextRole = event.target.value; const nextSkill = nextRole === "manager" ? "" : skill; setRole(nextRole); setSkill(nextSkill); refreshUntouchedDefaults(nextRole, nextSkill); }} className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-white p-2.5 text-[var(--ink)]" {...controlProps("role", state)}>
        <option value="">Choose a role</option><option value="manager">Manager</option><option value="specialist">Specialist</option>
      </select>
      {disabledIdentity ? <input type="hidden" name="role" value={role} /> : null}
      <FieldError field="role" state={state} />
    </div>
    <div>
      <label htmlFor="skillId" className="font-medium">Skill Binding</label>
      <select id="skillId" name="skillId" value={skill} disabled={disabledIdentity || !role || isManager} onChange={(event) => { const nextSkill = event.target.value; setSkill(nextSkill); refreshUntouchedDefaults(role, nextSkill); }} className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-white p-2.5 text-[var(--ink)]" translate="no" {...controlProps("skillId", state)}>
        <option value="">{isManager ? "Managers have no skill binding" : "Choose a registered skill"}</option>
        {skills.map((id) => <option key={id} value={id}>{id}</option>)}
      </select>
      {disabledIdentity ? <input type="hidden" name="skillId" value={skill} /> : null}
      <FieldError field="skillId" state={state} />
    </div>
    <label htmlFor="provider" className="font-medium">Provider
      <input id="provider" readOnly name="provider" value="openai" autoComplete="off" spellCheck={false} className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-stone-100 p-2.5" translate="no" />
    </label>
    <div>
      <label htmlFor="modelId" className="font-medium">Model</label>
      <select id="modelId" name="modelId" value={modelId} onChange={(event) => { setTouched((current) => ({ ...current, model: true })); setModelId(event.target.value as typeof modelId); }} className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-white p-2.5 text-[var(--ink)]" translate="no" {...controlProps("modelId", state)}>
        {models.map((model) => <option key={model} value={model}>{model}</option>)}
      </select>
      <FieldError field="modelId" state={state} />
    </div>
    <div>
      <label htmlFor="reasoningEffort" className="font-medium">Reasoning</label>
      <select id="reasoningEffort" name="reasoningEffort" value={reasoningEffort} onChange={(event) => { setTouched((current) => ({ ...current, reasoning: true })); setReasoningEffort(event.target.value); }} className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-white p-2.5 text-[var(--ink)]" {...controlProps("reasoningEffort", state)}>
        <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
      </select>
      <FieldError field="reasoningEffort" state={state} />
    </div>
    <div>
      <label htmlFor="maxTurns" className="font-medium">Maximum Turns</label>
      <input id="maxTurns" name="maxTurns" type="number" inputMode="numeric" min={1} max={isManager ? 2 : 1} value={maxTurns} onChange={(event) => { setTouched((current) => ({ ...current, maxTurns: true })); setMaxTurns(event.target.value); }} className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-white p-2.5" {...controlProps("maxTurns", state)} />
      <FieldError field="maxTurns" state={state} />
    </div>
    <label htmlFor="instructions" className="font-medium">Complete Instructions
      <textarea id="instructions" name="instructions" autoComplete="off" required maxLength={20000} defaultValue={version?.instructions} className="mt-1 block min-h-72 w-full rounded-lg border border-[var(--border)] bg-white p-3 font-mono text-sm" {...controlProps("instructions", state)} />
      <FieldError field="instructions" state={state} />
    </label>
    {isCreate ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Instructions are snapshotted in model-call evidence. Do not include secrets or private data.</p> : null}
  </fieldset>;
}

function useResult(state: AgentActionState, onResult: (state: AgentActionState) => void, onDirtyChange: (dirty: boolean) => void) {
  const handled = useRef<AgentActionState | null>(null);
  useEffect(() => {
    if (state.kind === "idle" || handled.current === state) return;
    handled.current = state;
    if (state.kind === "success") onDirtyChange(false);
    onResult(state);
  }, [onDirtyChange, onResult, state]);
}

export function CreateAgentForm({ skills, onCancel, onDirtyChange, onMutationStart, onResult }: { skills: SkillId[] } & FormCallbacks) {
  const [state, formAction] = useActionState(createAgent, initialAgentActionState);
  const formRef = useRef<HTMLFormElement>(null);
  useResult(state, onResult, onDirtyChange);
  useEffect(() => {
    const firstField = Object.keys(state.fieldErrors ?? {})[0];
    if (firstField) formRef.current?.querySelector<HTMLElement>(`[name="${firstField}"]:not([type="hidden"]):not(:disabled)`)?.focus();
  }, [state]);
  return <form ref={formRef} action={formAction} onChange={() => onDirtyChange(true)} onSubmit={(event) => { const data = new FormData(event.currentTarget); onMutationStart({ kind: "create", role: String(data.get("role") ?? ""), skillId: String(data.get("skillId") ?? "") }); }} className="grid gap-5">
    <AgentFields skills={skills} state={state} isCreate />
    {state.kind === "validation_error" ? <p className="text-sm text-red-700" aria-live="polite">{state.message}</p> : null}
    <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
      <SubmitButton label="Create Draft" pendingLabel="Creating…" />
      <button type="button" className="rounded-lg border border-[var(--border)] px-4 py-2 font-semibold hover:bg-stone-100" onClick={onCancel}>Cancel</button>
    </div>
  </form>;
}

export function EditAgentForm({ version, skills, onCancel, onDirtyChange, onMutationStart, onResult }: { version: AgentVersion; skills: SkillId[] } & FormCallbacks) {
  const [state, formAction] = useActionState(saveAgentDraft, initialAgentActionState);
  const formRef = useRef<HTMLFormElement>(null);
  useResult(state, onResult, onDirtyChange);
  useEffect(() => {
    const firstField = Object.keys(state.fieldErrors ?? {})[0];
    if (firstField) formRef.current?.querySelector<HTMLElement>(`[name="${firstField}"]:not([type="hidden"]):not(:disabled)`)?.focus();
  }, [state]);
  return <form ref={formRef} action={formAction} onChange={() => onDirtyChange(true)} onSubmit={() => onMutationStart({ kind: "save", version })} className="grid gap-5">
    <input type="hidden" name="id" value={version.id} />
    <input type="hidden" name="expectedRevision" value={version.revision} />
    <AgentFields version={version} skills={skills} state={state} />
    {state.kind === "validation_error" ? <p className="text-sm text-red-700" aria-live="polite">{state.message}</p> : null}
    <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
      <SubmitButton label="Save Draft" pendingLabel="Saving…" />
      <button type="button" className="rounded-lg border border-[var(--border)] px-4 py-2 font-semibold hover:bg-stone-100" onClick={onCancel}>Cancel</button>
    </div>
  </form>;
}
