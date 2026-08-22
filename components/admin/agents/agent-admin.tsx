"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AgentActionState } from "@/app/admin/agents/actions";
import { AgentActionDialog, type DialogTarget, type MutationDescriptor } from "@/components/admin/agents/agent-action-dialog";
import { CreateAgentForm, type FormMutationStart } from "@/components/admin/agents/agent-forms";
import { AgentVersionWorkspace } from "@/components/admin/agents/agent-version-workspace";
import { newlyAddedVersions, resolveAdminSelection, SLOT_LABELS, slotKeyForVersion, type AgentAdminViewModel, type SlotKey } from "@/components/admin/agents/agent-admin-model";

type AdminMode = "inspect" | "create" | "edit";
type RequestedSelection = { slotKey: SlotKey; agentId: string | null; versionId: string | null };
type PendingMutation = (FormMutationStart | MutationDescriptor) & { beforeVersionIds: Set<string> };

function Banner({ state, onDismiss }: { state: AgentActionState; onDismiss(): void }) {
  if (state.kind === "idle") return null;
  const success = state.kind === "success";
  return <div className={`mb-4 flex items-start justify-between gap-4 rounded-xl border p-4 ${success ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-900"}`} role={success ? "status" : "alert"} aria-live={success ? "polite" : "assertive"}>
    <p className="text-sm font-medium">{state.message}</p>
    <button type="button" onClick={onDismiss} className="shrink-0 rounded px-2 py-1 text-sm font-semibold hover:bg-black/5" aria-label="Dismiss message">Dismiss</button>
  </div>;
}

export function AgentAdmin({ snapshot, initialSelection }: { snapshot: AgentAdminViewModel; initialSelection?: { slotKey?: SlotKey; agentId?: string | null; versionId?: string | null } }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [requested, setRequested] = useState<RequestedSelection>({ slotKey: initialSelection?.slotKey ?? "manager", agentId: initialSelection?.agentId ?? null, versionId: initialSelection?.versionId ?? null });
  const [mode, setMode] = useState<AdminMode>("inspect");
  const [returnSelection, setReturnSelection] = useState<RequestedSelection | null>(null);
  const [dirty, setDirty] = useState(false);
  const [banner, setBanner] = useState<AgentActionState>({ kind: "idle", message: "" });
  const [dialogTarget, setDialogTarget] = useState<DialogTarget | null>(null);
  const pendingMutation = useRef<PendingMutation | null>(null);
  const selection = useMemo(() => resolveAdminSelection(snapshot, requested), [requested, snapshot]);
  const [agentSearch, setAgentSearch] = useState("");
  const visibleAgents = useMemo(() => {
    const needle = agentSearch.trim().toLocaleLowerCase();
    if (!needle) return selection.agents;
    return selection.agents.filter((candidate) => `${candidate.activeVersion?.displayName ?? ""} ${candidate.versions.map((version) => version.displayName).join(" ")}`.toLocaleLowerCase().includes(needle));
  }, [agentSearch, selection.agents]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("target", requested.slotKey);
    if (requested.agentId) next.set("agent", requested.agentId); else next.delete("agent");
    if (requested.versionId) next.set("version", requested.versionId); else next.delete("version");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, requested, router, searchParams]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const beforeNavigation = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || new URL(anchor.href).origin !== window.location.origin) return;
      if (window.confirm("Discard unsaved agent changes?")) { setDirty(false); return; }
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

  const guarded = useCallback((change: () => void) => {
    if (dirty && !window.confirm("Discard unsaved agent changes?")) return;
    setDirty(false);
    change();
  }, [dirty]);

  const startMutation = useCallback((descriptor: FormMutationStart | MutationDescriptor) => {
    pendingMutation.current = { ...descriptor, beforeVersionIds: new Set(snapshot.versions.map((version) => version.id)) };
  }, [snapshot.versions]);

  const handleResult = useCallback((state: AgentActionState) => {
    setBanner(state);
    const pending = pendingMutation.current;
    if (state.kind !== "success" || !pending) return;
    pendingMutation.current = null;
    setDirty(false);
    const added = newlyAddedVersions(pending.beforeVersionIds, snapshot.versions);

    if (pending.kind === "create") {
      const created = added.length === 1 ? added[0] : null;
      const fallbackSlot = pending.role === "manager" ? "manager" : pending.role === "image" ? `image:${pending.imageTarget ?? "reference"}` as SlotKey : pending.skillId as SlotKey;
      setRequested({ slotKey: created ? slotKeyForVersion(created) : fallbackSlot, agentId: created?.agentId ?? null, versionId: created?.id ?? null });
      setMode("inspect");
      setReturnSelection(null);
      return;
    }
    if (pending.kind === "fork") {
      const forked = added.filter((version) => version.agentId === pending.version.agentId);
      setRequested({ slotKey: slotKeyForVersion(pending.version), agentId: pending.version.agentId, versionId: forked.length === 1 ? forked[0]!.id : null });
      setMode("inspect");
      return;
    }
    if (pending.kind === "delete") {
      setRequested({ slotKey: slotKeyForVersion(pending.version), agentId: pending.version.agentId, versionId: null });
      setMode("inspect");
      return;
    }
    const version = "version" in pending ? pending.version : selection.version;
    if (version) setRequested({ slotKey: slotKeyForVersion(version), agentId: version.agentId, versionId: version.id });
    setMode("inspect");
  }, [selection.version, snapshot.versions]);

  const selectSlot = (slotKey: SlotKey) => guarded(() => { setRequested({ slotKey, agentId: null, versionId: null }); setMode("inspect"); });
  const selectAgent = (agentId: string) => guarded(() => { setRequested((current) => ({ ...current, agentId, versionId: null })); setMode("inspect"); });
  const selectVersion = (versionId: string) => guarded(() => { setRequested((current) => ({ ...current, agentId: selection.agent?.definition.id ?? null, versionId })); setMode("inspect"); });
  const openCreate = () => guarded(() => {
    setReturnSelection({ slotKey: selection.slot.key, agentId: selection.agent?.definition.id ?? null, versionId: selection.version?.id ?? null });
    setMode("create");
    setBanner({ kind: "idle", message: "" });
  });
  const cancelCreate = () => guarded(() => { if (returnSelection) setRequested(returnSelection); setReturnSelection(null); setMode("inspect"); });
  const cancelEdit = () => guarded(() => setMode("inspect"));

  return <section className="mx-auto max-w-[90rem] space-y-6">
    <header>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold uppercase tracking-wide text-[var(--accent)]">Trusted Local Backoffice</p><h1 className="text-4xl font-semibold">Runtime Agents</h1></div>
        <button type="button" onClick={openCreate} className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-white hover:brightness-95">New Agent</button>
      </div>
      <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"><strong>No authentication.</strong> Use only in trusted local development; never expose this page on an untrusted network.</p>
    </header>

    <div className="grid items-start gap-5 lg:grid-cols-[minmax(15rem,19rem)_minmax(16rem,21rem)_minmax(0,1fr)]">
      <nav aria-labelledby="slots-heading" className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 id="slots-heading" className="text-lg font-semibold">Runtime Slots</h2>
        <p className="mt-1 text-sm text-[var(--muted-ink)]">Select a slot to inspect its agents and versions.</p>
        <ul className="mt-4 grid gap-2">{snapshot.coverage.map((slot) => {
          const active = snapshot.versions.find((version) => version.id === slot.activeVersionId) ?? null;
          const selected = slot.key === selection.slot.key;
          return <li key={slot.key}><button type="button" aria-current={selected ? "true" : undefined} onClick={() => selectSlot(slot.key)} className={`w-full min-w-0 rounded-xl border p-3 text-left hover:border-[var(--accent)] hover:bg-orange-50 ${selected ? "border-[var(--accent)] bg-orange-50" : "border-[var(--border)]"}`}>
            <span className="flex items-center justify-between gap-2"><strong className="min-w-0 break-words">{SLOT_LABELS[slot.key]}</strong><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${slot.violation ? "bg-red-600" : "bg-green-600"}`} aria-hidden="true" /></span>
            <span className={`mt-1 block text-xs font-semibold ${slot.violation ? "text-red-700" : "text-green-700"}`}>{slot.violation ?? "Healthy"}</span>
            {active ? <span className="mt-2 block min-w-0 text-sm text-[var(--muted-ink)]"><span className="block truncate">{active.displayName}</span><span className="block tabular-nums" translate="no">v{active.versionNumber} · {active.modelId}</span>{active.status === "draft" ? <span className="font-semibold text-amber-800">Active Draft</span> : null}</span> : null}
          </button></li>;
        })}</ul>
      </nav>

      <aside aria-labelledby="agents-heading" className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex items-center justify-between gap-3"><div><h2 id="agents-heading" className="text-lg font-semibold">Agents</h2><p className="mt-1 text-sm text-[var(--muted-ink)]">{selection.agents.length} logical candidate{selection.agents.length === 1 ? "" : "s"}</p></div><button type="button" onClick={openCreate} className="rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-orange-50">Add</button></div>
        <label className="mt-4 block text-sm font-medium" htmlFor="agent-search">Search agents<input id="agent-search" type="search" value={agentSearch} onChange={(event) => setAgentSearch(event.target.value)} className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-white p-2" /></label>
        {visibleAgents.length ? <ul className="mt-4 grid gap-2">{visibleAgents.map((candidate) => <li key={candidate.definition.id}><button type="button" aria-current={candidate.definition.id === selection.agent?.definition.id ? "true" : undefined} onClick={() => selectAgent(candidate.definition.id)} className={`w-full rounded-xl border p-3 text-left hover:border-[var(--accent)] hover:bg-orange-50 ${candidate.definition.id === selection.agent?.definition.id ? "border-[var(--accent)] bg-orange-50" : "border-[var(--border)]"}`}><span className="block break-words font-semibold">{candidate.activeVersion?.displayName ?? candidate.versions[0]?.displayName ?? "Unnamed agent"}</span><span className="mt-1 block text-xs text-[var(--muted-ink)]">{candidate.activeVersion ? `Active v${candidate.activeVersion.versionNumber}` : `${candidate.versions.length} inactive version${candidate.versions.length === 1 ? "" : "s"}`}</span></button></li>)}</ul> : <p className="mt-4 rounded-lg bg-stone-50 p-3 text-sm text-[var(--muted-ink)]">No agents match this search.</p>}
      </aside>      <div className="min-w-0">
        <Banner state={banner} onDismiss={() => setBanner({ kind: "idle", message: "" })} />
        {mode === "create" ? <section aria-labelledby="create-heading" className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--accent)]">New Logical Agent</p>
          <h2 id="create-heading" className="mb-5 mt-1 text-2xl font-semibold">Create Inactive Draft</h2>
          <CreateAgentForm skills={snapshot.skillChoices} onCancel={cancelCreate} onDirtyChange={setDirty} onMutationStart={startMutation} onResult={handleResult} />
        </section> : <AgentVersionWorkspace snapshot={snapshot} selection={selection} editing={mode === "edit"} onSelectVersion={selectVersion} onEdit={() => guarded(() => setMode("edit"))} onNewAgent={openCreate} onCancelEdit={cancelEdit} onDirtyChange={setDirty} onFormMutationStart={startMutation} onMutationStart={startMutation} onResult={handleResult} onOpenDialog={(target, trigger) => setDialogTarget({ ...target, trigger })} />}
      </div>
    </div>

    {dialogTarget ? <AgentActionDialog key={`${dialogTarget.kind}:${dialogTarget.version.id}:${dialogTarget.version.revision}`} target={dialogTarget} onClose={() => setDialogTarget(null)} onMutationStart={startMutation} onResult={handleResult} /> : null}
  </section>;
}
