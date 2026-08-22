"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createAgent, saveAgentDraft, type AgentActionState } from "@/app/admin/agents/actions";
import type { AgentVersion } from "@/lib/contracts/agents";
import type { SkillId } from "@/lib/contracts/skills";

const textModels = ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"] as const;
const imageProfiles = {
  "openai-image": { provider: "openai", models: ["gpt-image-2", "gpt-image-2-2026-04-21"], defaultModel: "gpt-image-2" },
  "gemini-image": { provider: "google", models: ["gemini-3.1-flash-image", "gemini-3-pro-image"], defaultModel: "gemini-3.1-flash-image" },
  "flux-image": { provider: "bfl", models: ["flux-2-pro", "flux-2-flex"], defaultModel: "flux-2-pro" },
} as const;
type ImageProfileId = keyof typeof imageProfiles;
const initialAgentActionState: AgentActionState = { kind: "idle", message: "" };

export type FormMutationStart = { kind: "create" | "save"; version?: AgentVersion; role?: string; skillId?: string; imageTarget?: "reference" | "page" };
type FormCallbacks = { onCancel(): void; onDirtyChange(dirty: boolean): void; onMutationStart(input: FormMutationStart): void; onResult(state: AgentActionState): void };

function textDefaults(role: string, skill: string) {
  const manager = role === "manager";
  return { modelId: manager ? "gpt-5.6-luna" : skill === "quality_review_targeted_repair@1" ? "gpt-5.6-sol" : "gpt-5.6-terra", reasoningEffort: manager ? "low" : "medium", maxTurns: manager ? "2" : "1" };
}
function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) { const { pending } = useFormStatus(); return <button className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-white hover:brightness-95 disabled:cursor-wait disabled:opacity-70" type="submit" disabled={pending}>{pending ? pendingLabel : label}</button>; }
function FieldError({ field, state }: { field: string; state: AgentActionState }) { const message = state.fieldErrors?.[field]; return message ? <span id={`${field}-error`} className="mt-1 block text-sm text-red-700">{message}</span> : null; }
function controlProps(field: string, state: AgentActionState) { const invalid = Boolean(state.fieldErrors?.[field]); return { "aria-invalid": invalid || undefined, "aria-describedby": invalid ? `${field}-error` : undefined }; }

function AgentFields({ version, skills, state, isCreate = false }: { version?: AgentVersion; skills: SkillId[]; state: AgentActionState; isCreate?: boolean }) {
  const [role, setRole] = useState(version?.role ?? "");
  const [skill, setSkill] = useState(version?.skillId ?? "");
  const [imageTarget, setImageTarget] = useState(version?.imageTarget ?? "reference");
  const initialProfile = version?.profileId && version.profileId !== "openai-specialist" ? version.profileId as ImageProfileId : "openai-image";
  const [profileId, setProfileId] = useState<ImageProfileId>(initialProfile);
  const defaults = textDefaults(version?.role ?? "", version?.skillId ?? "");
  const [modelId, setModelId] = useState(version?.modelId ?? defaults.modelId);
  const [reasoningEffort, setReasoningEffort] = useState(version?.reasoningEffort ?? defaults.reasoningEffort);
  const [maxTurns, setMaxTurns] = useState(String(version?.maxTurns ?? defaults.maxTurns));
  const [imageQuality, setImageQuality] = useState(version?.imageQuality ?? "auto");
  const [imageResolution, setImageResolution] = useState(version?.imageResolution ?? "1K");
  const isImage = role === "image";
  const isManager = role === "manager";
  const disabledIdentity = Boolean(version?.isActive || (version && version.status !== "draft"));
  const currentImage = imageProfiles[profileId];
  const setRoleAndDefaults = (nextRole: string) => {
    setRole(nextRole);
    if (nextRole === "image") { setSkill(""); setModelId(imageProfiles[profileId].defaultModel); return; }
    const next = textDefaults(nextRole, skill); setModelId(next.modelId); setReasoningEffort(next.reasoningEffort); setMaxTurns(next.maxTurns);
  };
  const setProfile = (next: ImageProfileId) => { setProfileId(next); setModelId(imageProfiles[next].defaultModel); };

  return <fieldset className="grid gap-4"><legend className="sr-only">Agent configuration</legend>
    <label htmlFor="displayName" className="font-medium">Display Name<input id="displayName" name="displayName" autoComplete="off" required maxLength={120} defaultValue={version?.displayName} className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-white p-2.5" {...controlProps("displayName", state)} /><FieldError field="displayName" state={state} /></label>
    <label htmlFor="purpose" className="font-medium">Purpose<textarea id="purpose" name="purpose" autoComplete="off" required maxLength={1000} defaultValue={version?.purpose} className="mt-1 block min-h-20 w-full rounded-lg border border-[var(--border)] bg-white p-2.5" {...controlProps("purpose", state)} /><FieldError field="purpose" state={state} /></label>
    <label htmlFor="role" className="font-medium">Role<select id="role" name="role" required value={role} disabled={disabledIdentity} onChange={(event) => setRoleAndDefaults(event.target.value)} className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-white p-2.5"><option value="">Choose a role</option><option value="manager">Manager</option><option value="specialist">Specialist</option><option value="image">Image</option></select>{disabledIdentity ? <input type="hidden" name="role" value={role} /> : null}<FieldError field="role" state={state} /></label>
    {isImage ? <>
      <label htmlFor="imageTarget" className="font-medium">Image Target<select id="imageTarget" name="imageTarget" value={imageTarget} disabled={disabledIdentity} onChange={(event) => setImageTarget(event.target.value as "reference" | "page")} className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-white p-2.5"><option value="reference">Canonical reference</option><option value="page">Booklet page</option></select>{disabledIdentity ? <input type="hidden" name="imageTarget" value={imageTarget} /> : null}<FieldError field="imageTarget" state={state} /></label>
      <label htmlFor="profileId" className="font-medium">Execution Profile<select id="profileId" name="profileId" value={profileId} onChange={(event) => setProfile(event.target.value as ImageProfileId)} className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-white p-2.5" translate="no"><option value="openai-image">OpenAI Image v1</option><option value="gemini-image">Gemini Image v1</option><option value="flux-image">FLUX Image v1</option></select><input type="hidden" name="profileVersion" value="1" /><FieldError field="profileId" state={state} /></label>
      <label htmlFor="provider" className="font-medium">Provider<input id="provider" name="provider" readOnly value={currentImage.provider} className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-stone-100 p-2.5" translate="no" /></label>
      <label htmlFor="modelId" className="font-medium">Model<select id="modelId" name="modelId" value={modelId} onChange={(event) => setModelId(event.target.value)} className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-white p-2.5" translate="no">{currentImage.models.map((model) => <option key={model} value={model}>{model}</option>)}</select><FieldError field="modelId" state={state} /></label>
      {profileId === "openai-image" ? <label htmlFor="imageQuality" className="font-medium">Image Quality<select id="imageQuality" name="imageQuality" value={imageQuality} onChange={(event) => setImageQuality(event.target.value as "auto" | "low" | "medium" | "high")} className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-white p-2.5"><option value="auto">Auto</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label> : <input type="hidden" name="imageQuality" value="" />}
      {profileId === "gemini-image" ? <label htmlFor="imageResolution" className="font-medium">Resolution<select id="imageResolution" name="imageResolution" value={imageResolution} onChange={(event) => setImageResolution(event.target.value as "1K" | "2K" | "4K")} className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-white p-2.5"><option value="1K">1K</option><option value="2K">2K</option><option value="4K">4K</option></select></label> : <input type="hidden" name="imageResolution" value="" />}
      <input type="hidden" name="skillId" value="" /><input type="hidden" name="instructions" value="" /><input type="hidden" name="reasoningEffort" value="" /><input type="hidden" name="maxTurns" value="" />
      <p className="rounded-lg bg-stone-50 p-3 text-sm text-[var(--muted-ink)]">Prompt wording, reference ordering, and provider request bodies are application-owned. Credentials are never stored here.</p>
    </> : <>
      <label htmlFor="skillId" className="font-medium">Skill Binding<select id="skillId" name="skillId" value={skill} disabled={disabledIdentity || !role || isManager} onChange={(event) => { const next = event.target.value; setSkill(next); const values = textDefaults(role, next); setModelId(values.modelId); }} className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-white p-2.5" translate="no"><option value="">{isManager ? "Managers have no skill binding" : "Choose a registered skill"}</option>{skills.map((id) => <option key={id} value={id}>{id}</option>)}</select>{disabledIdentity ? <input type="hidden" name="skillId" value={skill} /> : null}<FieldError field="skillId" state={state} /></label>
      <input type="hidden" name="imageTarget" value="" /><input type="hidden" name="profileId" value={role === "specialist" ? "openai-specialist" : ""} /><input type="hidden" name="profileVersion" value={role === "specialist" ? "1" : ""} /><input type="hidden" name="imageQuality" value="" /><input type="hidden" name="imageResolution" value="" />
      <label htmlFor="provider" className="font-medium">Provider<input id="provider" name="provider" readOnly value="openai" className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-stone-100 p-2.5" translate="no" /></label>
      <label htmlFor="modelId" className="font-medium">Model<select id="modelId" name="modelId" value={modelId} onChange={(event) => setModelId(event.target.value)} className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-white p-2.5" translate="no">{textModels.map((model) => <option key={model} value={model}>{model}</option>)}</select><FieldError field="modelId" state={state} /></label>
      <label htmlFor="reasoningEffort" className="font-medium">Reasoning<select id="reasoningEffort" name="reasoningEffort" value={reasoningEffort} onChange={(event) => setReasoningEffort(event.target.value)} className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-white p-2.5"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
      <label htmlFor="maxTurns" className="font-medium">Maximum Turns<input id="maxTurns" name="maxTurns" type="number" min={1} max={isManager ? 2 : 1} value={maxTurns} onChange={(event) => setMaxTurns(event.target.value)} className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-white p-2.5" /></label>
      <label htmlFor="instructions" className="font-medium">Complete Instructions<textarea id="instructions" name="instructions" autoComplete="off" required maxLength={20000} defaultValue={version?.instructions ?? ""} className="mt-1 block min-h-72 w-full rounded-lg border border-[var(--border)] bg-white p-3 font-mono text-sm" /><FieldError field="instructions" state={state} /></label>
    </>}
    {isCreate ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Agent settings and instructions are snapshotted in evidence. Do not include secrets or private data.</p> : null}
  </fieldset>;
}

function useValidationFocus(state: AgentActionState, formRef: React.RefObject<HTMLFormElement | null>) {
  useEffect(() => {
    if (state.kind !== "validation_error") return;
    const field = Object.keys(state.fieldErrors ?? {})[0];
    const control = field ? formRef.current?.elements.namedItem(field) : null;
    if (control instanceof HTMLElement) control.focus();
  }, [formRef, state]);
}

function useResult(state: AgentActionState, onResult: (state: AgentActionState) => void, onDirtyChange: (dirty: boolean) => void) { const handled = useRef<AgentActionState | null>(null); useEffect(() => { if (state.kind === "idle" || handled.current === state) return; handled.current = state; if (state.kind === "success") onDirtyChange(false); onResult(state); }, [onDirtyChange, onResult, state]); }
export function CreateAgentForm({ skills, onCancel, onDirtyChange, onMutationStart, onResult }: { skills: SkillId[] } & FormCallbacks) { const [state, formAction] = useActionState(createAgent, initialAgentActionState); const formRef = useRef<HTMLFormElement>(null); useResult(state, onResult, onDirtyChange); useValidationFocus(state, formRef); return <form ref={formRef} action={formAction} onChange={() => onDirtyChange(true)} onSubmit={(event) => { const data = new FormData(event.currentTarget); const imageTarget = String(data.get("imageTarget") ?? ""); onMutationStart({ kind: "create", role: String(data.get("role") ?? ""), skillId: String(data.get("skillId") ?? ""), imageTarget: imageTarget === "reference" || imageTarget === "page" ? imageTarget : undefined }); }} className="grid gap-5"><AgentFields skills={skills} state={state} isCreate />{state.kind === "validation_error" ? <p className="text-sm text-red-700">{state.message}</p> : null}<div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4"><SubmitButton label="Create Draft" pendingLabel="Creating…" /><button type="button" className="rounded-lg border border-[var(--border)] px-4 py-2 font-semibold hover:bg-stone-100" onClick={onCancel}>Cancel</button></div></form>; }
export function EditAgentForm({ version, skills, onCancel, onDirtyChange, onMutationStart, onResult }: { version: AgentVersion; skills: SkillId[] } & FormCallbacks) { const [state, formAction] = useActionState(saveAgentDraft, initialAgentActionState); const formRef = useRef<HTMLFormElement>(null); useResult(state, onResult, onDirtyChange); useValidationFocus(state, formRef); return <form ref={formRef} action={formAction} onChange={() => onDirtyChange(true)} onSubmit={() => onMutationStart({ kind: "save", version })} className="grid gap-5"><input type="hidden" name="id" value={version.id} /><input type="hidden" name="expectedRevision" value={version.revision} /><AgentFields version={version} skills={skills} state={state} />{state.kind === "validation_error" ? <p className="text-sm text-red-700">{state.message}</p> : null}<div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4"><SubmitButton label="Save Draft" pendingLabel="Saving…" /><button type="button" className="rounded-lg border border-[var(--border)] px-4 py-2 font-semibold hover:bg-stone-100" onClick={onCancel}>Cancel</button></div></form>; }
