"use client";

import { useState } from "react";
import { getTarget, selectedTarget, simulateSuggestion, targetKey, writeTarget } from "@/lib/mockups/specialty-management/chat";
import type { AgentVersion, MockupState, ProposalTarget } from "@/lib/mockups/specialty-management/types";

type Update = (fn: (draft: MockupState) => void) => void;
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function targetLabel(state: MockupState, target: ProposalTarget | null) {
  if (!target) return "No editable target selected";
  const found = getTarget(state, target);
  if (!found) return "Deleted target";
  const section = target.section === "instructions" ? "Main instructions" : found.version.references.find((item) => item.id === target.section.slice(10))?.name ?? "Deleted reference";
  return `${found.version.title} · v${found.version.number} · ${section}`;
}

export function ChatPanel({ state, update, announce }: { state: MockupState; update: Update; announce(message: string): void }) {
  const [request, setRequest] = useState("");
  const current = selectedTarget(state);
  const send = (text: string, capturedTarget = current) => {
    const clean = text.trim(); if (!clean || !capturedTarget || state.chat.pendingResponse) return;
    const found = getTarget(state, capturedTarget); if (!found) { announce("The proposal target is unavailable."); return; }
    const prior = [...state.chat.proposals].reverse().find((item) => targetKey(item.target) === targetKey(capturedTarget) && item.status === "pending");
    const conflict = !!prior && prior.baseText !== found.text;
    const baseText = prior && !conflict ? prior.baseText : found.text;
    const inputText = prior && !conflict ? prior.proposedText : found.text;
    update((draft) => {
      draft.chat.proposals.forEach((item) => { if (targetKey(item.target) === targetKey(capturedTarget) && item.status === "pending") item.status = "superseded"; });
      draft.chat.messages.push({ id: uid("message"), role: "user", text: clean, target: capturedTarget });
      draft.chat.pendingResponse = { id: uid("response"), target: capturedTarget, request: clean, baseText, inputText };
    });
    setRequest(""); announce("Simulated response started.");
  };
  const openTarget = (target: ProposalTarget) => { update((draft) => { const agent = draft.agents.find((item) => item.id === target.agentId); if (!agent?.versions.some((item) => item.id === target.versionId)) return; draft.ui.recentVersionIds[target.agentId] = target.versionId; draft.ui.selection = { kind: "agent", specialtyId: agent.specialtyId, agentId: agent.id, versionId: target.versionId, section: target.section }; }); announce("Proposal target opened."); };
  const apply = (proposalId: string) => { const createsDraft = state.chat.proposals.some((item) => item.id === proposalId && getTarget(state, item.target)?.saved.status !== "draft"); update((draft) => {
    const proposal = draft.chat.proposals.find((item) => item.id === proposalId); if (!proposal || proposal.status !== "pending") return;
    const found = getTarget(draft, proposal.target); const selected = selectedTarget(draft); if (!found || !selected || found.text !== proposal.baseText || targetKey(selected) !== targetKey(proposal.target)) return;
    if (found.saved.status === "draft") {
      const working = structuredClone(found.version); writeTarget(working, proposal.target, proposal.proposedText); draft.workingCopies.versions[found.saved.id] = working;
    } else {
      const copy = structuredClone(found.version) as AgentVersion; copy.id = uid("version"); copy.number = Math.max(...found.agent.versions.map((item) => item.number)) + 1; copy.parentVersionId = found.saved.id; copy.status = "draft"; writeTarget(copy, { ...proposal.target, versionId: copy.id }, proposal.proposedText); found.agent.versions.push(copy); draft.ui.recentVersionIds[found.agent.id] = copy.id; draft.ui.selection = { kind: "agent", specialtyId: found.agent.specialtyId, agentId: found.agent.id, versionId: copy.id, section: proposal.target.section }; 
    }
    proposal.status = "applied";
  }); announce(createsDraft ? "Draft created with proposed changes." : "Proposed changes applied."); };
  return <aside className="chat-panel" aria-label="Simulated assistant">
    <header><p>Editing target</p><h2>Simulated assistant</h2><span>{targetLabel(state, current)}</span></header>
    <div className="chat-suggestions">{["Make this concise", "Use a numbered checklist", "Add an example"].map((item) => <button key={item} disabled={!current || !!state.chat.pendingResponse} onClick={() => send(item)}>{item}</button>)}</div>
    <div className="conversation" aria-live="polite">{state.chat.messages.length || state.chat.proposals.length ? <>{state.chat.messages.map((message) => <article className={`chat-message ${message.role}`} key={message.id}><small>{message.role === "user" ? "You" : "Simulated assistant"} · {targetLabel(state, message.target)}</small><p>{message.text}</p>{message.retryRequest && message.target ? <button disabled={!!state.chat.pendingResponse || !getTarget(state, message.target)} onClick={() => { send(message.retryRequest!, message.target); update((draft) => { const item = draft.chat.messages.find((value) => value.id === message.id); if (item) delete item.retryRequest; }); }}>Retry response</button> : null}</article>)}{state.chat.proposals.map((proposal) => { const found = getTarget(state, proposal.target); const matches = !!current && targetKey(current) === targetKey(proposal.target); const conflict = !!found && found.text !== proposal.baseText; const actionable = proposal.status === "pending" && matches && !conflict && !!found; return <article className="proposal" key={proposal.id}><small>{targetLabel(state, proposal.target)} · {proposal.status}</small><label>Before<textarea readOnly value={proposal.baseText} /></label><label>After<textarea disabled={proposal.status !== "pending"} value={proposal.proposedText} onChange={(event) => update((draft) => { const item = draft.chat.proposals.find((value) => value.id === proposal.id); if (item) item.proposedText = event.target.value; })} /></label>{!found ? <p className="proposal-note">Target unavailable.</p> : conflict ? <p className="proposal-note">Content changed; generate a new proposal.</p> : !matches && proposal.status === "pending" ? <button onClick={() => openTarget(proposal.target)}>Open target</button> : null}<div className="proposal-actions"><button disabled={!actionable} onClick={() => apply(proposal.id)}>{!found || found.saved.status === "draft" ? "Apply" : "Create draft with changes"}</button><button disabled={proposal.status !== "pending"} onClick={() => { update((draft) => { const item = draft.chat.proposals.find((value) => value.id === proposal.id); if (item) item.status = "dismissed"; }); announce("Proposal dismissed."); }}>Dismiss</button></div></article>; })}</> : <p>Choose Main instructions or a reference, then ask for a simulated edit.</p>}{state.chat.pendingResponse ? <div className="pending-response" role="status">Preparing a deterministic suggestion… <button onClick={() => { update((draft) => { draft.chat.pendingResponse = null; }); announce("Simulated response cancelled."); }}>Cancel</button></div> : null}</div>
    <form onSubmit={(event) => { event.preventDefault(); send(request); }}><label><span className="sr-only">Request an edit</span><textarea aria-label="Request an edit" value={request} onChange={(event) => setRequest(event.target.value)} placeholder="Describe a change…" /></label><button type="submit" disabled={!current || !request.trim() || !!state.chat.pendingResponse}>Send</button></form>
    <p className="simulation-note">Suggestions are deterministic simulations, not model interpretations.</p>
  </aside>;
}

export function finishPendingResponse(state: MockupState) {
  const pending = state.chat.pendingResponse; if (!pending) return null;
  const status = getTarget(state, pending.target) ? "pending" : "unavailable";
  state.chat.proposals.push({ id: pending.id, target: pending.target, request: pending.request, baseText: pending.baseText, proposedText: simulateSuggestion(pending.inputText, pending.request), status });
  state.chat.messages.push({ id: uid("message"), role: "assistant", text: "Here is a simulated suggestion. Review the before and after text before applying it.", target: pending.target });
  state.chat.pendingResponse = null;
  return status;
}
