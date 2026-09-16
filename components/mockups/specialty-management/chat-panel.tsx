"use client";

import { useChat } from "@ai-sdk/react";
import { Copy, PanelRightClose, Send, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyProposal,
  baseMatches,
  beginResponse,
  canApplyProposal,
  cancelResponse,
  completeResponse,
  resolveTarget,
  selectedTarget,
  simulateReply,
  targetKey,
} from "@/lib/mockups/specialty-management/chat";
import { ManagementLocalChatTransport } from "@/lib/mockups/specialty-management/local-chat-transport";
import type {
  ChatProposal,
  EditingTarget,
  ErrorDetails,
  ManagementUIMessage,
  MockupState,
  Selection,
} from "@/lib/mockups/specialty-management/types";

type Update = (fn: (draft: MockupState) => void) => void;
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const selectionForTarget = (target: EditingTarget): Selection =>
  target.kind === "specialty"
    ? { kind: "specialty", specialtyId: target.specialtyId }
    : target;
const textOf = (message: ManagementUIMessage) =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

function targetLabel(state: MockupState, target: EditingTarget | null) {
  if (!target) return "Open an editable section to request changes";
  const found = resolveTarget(state, target);
  if (!found) return "Target unavailable";
  if (target.kind === "specialty") return `${found.specialty.name} · Settings`;
  const section =
    target.section === "configuration"
      ? "Configuration"
      : target.section === "instructions"
        ? "Main instructions"
        : (found.reference?.name ?? "Deleted reference");
  return `${found.version?.title ?? "Deleted agent"} · v${found.version?.number ?? "?"} · ${section}`;
}

function proposedFields(proposal: ChatProposal) {
  const patch = proposal.patch as Record<string, unknown>;
  return Object.entries(patch).map(([key, value]) => ({
    key,
    label: key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()),
    value:
      typeof value === "string"
        ? value
        : Array.isArray(value)
          ? value.join(", ")
          : value === null
            ? "None"
            : JSON.stringify(value),
  }));
}

function ProposalCard({
  proposal,
  state,
  update,
  announce,
  select,
}: {
  proposal: ChatProposal;
  state: MockupState;
  update: Update;
  announce(message: string): void;
  select(selection: Selection): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const found = resolveTarget(state, proposal.target);
  const selected = selectedTarget(state);
  const matches = !!selected && targetKey(selected) === targetKey(proposal.target);
  const actionable = canApplyProposal(state, proposal);
  const fields = proposedFields(proposal);
  const long = fields.some((field) => field.value.length > 360);
  const openTarget = () => {
    const target = proposal.target;
    select(selectionForTarget(target));
    announce("Proposal target opened.");
  };
  return (
    <section className="proposal" aria-label="Edit proposal">
      <small>{targetLabel(state, proposal.target)} · {proposal.status}</small>
      <div className={long && !expanded ? "proposal-content collapsed" : "proposal-content"}>
        {fields.map((field) => (
          <div className="proposal-field" key={field.key}>
            <strong>{field.label}</strong>
            <pre>{field.value}</pre>
          </div>
        ))}
      </div>
      {long ? (
        <button className="link-button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Collapse" : "Show full"}
        </button>
      ) : null}
      {!found ? <p className="proposal-note">Target unavailable.</p> : null}
      {found && proposal.status === "pending" && !matches ? (
        <button onClick={openTarget}>Open target</button>
      ) : null}
      {found && matches && proposal.status === "pending" && !actionable ? (
        <p className="proposal-note">The selected section changed. Request a fresh proposal.</p>
      ) : null}
      <div className="proposal-actions">
        <button
          disabled={!actionable}
          onClick={() => {
            update((draft) => {
              applyProposal(draft, proposal.id, uid);
            });
            announce("Proposal applied to the working copy.");
          }}
        >
          {found?.savedVersion?.status && found.savedVersion.status !== "draft"
            ? "Create draft with changes"
            : "Apply"}
        </button>
        <button
          disabled={proposal.status !== "pending"}
          onClick={() => {
            update((draft) => {
              const item = draft.chat.proposals.find((value) => value.id === proposal.id);
              if (item) item.status = "dismissed";
            });
            announce("Proposal dismissed.");
          }}
        >Dismiss</button>
      </div>
    </section>
  );
}

function ErrorCard({
  details,
  state,
  composer,
  update,
  select,
  send,
}: {
  details: ErrorDetails;
  state: MockupState;
  composer: string;
  update: Update;
  select(selection: Selection): void;
  send(text: string, target: EditingTarget): void;
}) {
  const [open, setOpen] = useState(false);
  const available = details.target && resolveTarget(state, details.target);
  const current = selectedTarget(state);
  const matches = !!details.target && !!current && targetKey(details.target) === targetKey(current);
  const retryMatchesBase =
    !!details.target &&
    !!details.capturedBase &&
    baseMatches(state, details.target, details.capturedBase);
  const prepare = () => {
    if (!details.target || !available) return;
    update((draft) => {
      const separator = draft.chat.composerText.trim() ? "\n\n---\n\n" : "";
      draft.chat.composerText = `${draft.chat.composerText}${separator}${details.request}`;
    });
    select(selectionForTarget(details.target));
  };
  return (
    <div className="chat-error-card">
      <div className="proposal-actions">
        {details.target && matches ? (
          <button
            disabled={!retryMatchesBase}
            onClick={() => send(details.request, details.target!)}
          >Retry</button>
        ) : null}
        {details.target && available && !matches ? <button onClick={prepare}>Open target</button> : null}
        {details.target && available ? <button onClick={prepare}>Edit request</button> : null}
        <button aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? "Hide error details" : "Show error details"}
        </button>
      </div>
      {details.target && matches && !retryMatchesBase ? (
        <p className="proposal-note">The captured section changed. Edit the request and send it again.</p>
      ) : null}
      {open ? (
        <dl className="error-details">
          <dt>Responder</dt><dd>{details.responder}</dd>
          <dt>Captured request</dt><dd>{details.request}</dd>
          <dt>Target</dt><dd>{targetLabel(state, details.target)}</dd>
          <dt>Stages</dt><dd>{details.stages.join(" → ")}</dd>
          <dt>Started</dt><dd>{details.timestamps.startedAt}</dd>
          <dt>Stopped or failed</dt><dd>{details.timestamps.failedAt}</dd>
          <dt>Captured section</dt><dd><pre>{JSON.stringify(details.capturedBase, null, 2)}</pre></dd>
          <dt>Error</dt><dd>{details.systemError}</dd>
          {details.modelContext ? <><dt>Selected models (context only)</dt><dd>{details.modelContext.languageModel.provider} · {details.modelContext.languageModel.model}</dd></> : null}
        </dl>
      ) : null}
      {composer.trim() ? <small>Your existing draft will be preserved when preparing this request.</small> : null}
    </div>
  );
}

export function ChatPanel({
  state,
  update,
  announce,
  select,
  hidden = false,
  resetToken = 0,
  onCollapse,
}: {
  state: MockupState;
  update: Update;
  announce(message: string): void;
  select(selection: Selection): void;
  hidden?: boolean;
  resetToken?: number;
  onCollapse(): void;
}) {
  const current = selectedTarget(state);
  const conversationRef = useRef<HTMLDivElement>(null);
  const [nearBottom, setNearBottom] = useState(true);
  const transport = useMemo(
    () =>
      new ManagementLocalChatTransport({
        respond(message) {
          return { text: `The synthetic simulator could not prepare ${message.id}.` };
        },
        delayMs: 45,
      }),
    [],
  );
  const chat = useChat<ManagementUIMessage>({
    id: "agent-studio-editing-assistant",
    transport,
    messages: [],
    onFinish({ isAbort, isError }) {
      update((draft) => {
        if (isAbort || isError) cancelResponse(draft, uid);
        else completeResponse(draft, uid);
      });
    },
    onError() {
      update((draft) => cancelResponse(draft, uid));
    },
  });
  const running = chat.status === "submitted" || chat.status === "streaming";
  const streamingMessage = running && chat.messages.at(-1)?.role === "assistant" ? chat.messages.at(-1) : null;
  const pendingClarification = state.chat.pendingClarification;
  const clarificationMatches =
    !pendingClarification ||
    (!!current && targetKey(current) === targetKey(pendingClarification.target));
  const previousResetToken = useRef(resetToken);
  const observedPending = useRef(false);

  useEffect(() => {
    if (previousResetToken.current === resetToken) return;
    previousResetToken.current = resetToken;
    if (running) void chat.stop();
  }, [chat, resetToken, running]);

  useEffect(() => {
    if (state.chat.pendingResponse) observedPending.current = true;
    else if (running && observedPending.current) {
      observedPending.current = false;
      void chat.stop();
    }
  }, [chat, running, state.chat.pendingResponse]);

  const send = (text: string, target = current) => {
    const clean = text.trim();
    if (!clean || !target || state.chat.pendingResponse || running) return;
    if (
      pendingClarification &&
      targetKey(target) !== targetKey(pendingClarification.target)
    )
      return;
    const responseTarget = pendingClarification?.target ?? target;
    const base = resolveTarget(state, responseTarget);
    if (!base) return;
    update((draft) => {
      beginResponse(draft, responseTarget, clean, uid);
      draft.chat.pendingClarification = null;
    });
    const reply = simulateReply(state, responseTarget, clean, `preview-${crypto.randomUUID()}`);
    const simulatedResponse = {
      text: reply.text,
      clarification:
        reply.kind === "clarification"
          ? { id: uid("preview"), question: reply.question, choices: reply.choices, target: responseTarget, request: clean }
          : undefined,
      proposalId: reply.kind === "proposal" ? reply.proposal.id : undefined,
    };
    void chat.sendMessage(
      { text: clean, metadata: { target: responseTarget, createdAt: new Date().toISOString(), state: "complete" } },
      { body: { simulatedResponse } },
    );
    announce("Synthetic simulator response started.");
  };

  useEffect(() => {
    const node = conversationRef.current;
    if (node && nearBottom) node.scrollTop = node.scrollHeight;
  }, [state.chat.messages, state.chat.proposals, streamingMessage, nearBottom]);

  const suggestions = current?.kind === "specialty"
    ? ["Update the description", "Use Text output", "Use Image output"]
    : current?.section === "configuration"
      ? ["Change the title", "Use Story", "Use Quick"]
      : ["Make this concise", "Use a numbered checklist", "Add an example"];

  return (
    <aside className="chat-panel" aria-label="Assistant" hidden={hidden}>
      <header>
        <h2>Assistant</h2>
        <button
          className="icon-button"
          aria-label="Collapse Assistant"
          title="Collapse Assistant"
          onClick={onCollapse}
        >
          <PanelRightClose aria-hidden="true" size={15} />
        </button>
      </header>
      <div
        className="conversation"
        ref={conversationRef}
        aria-live="polite"
        onScroll={(event) => {
          const node = event.currentTarget;
          setNearBottom(node.scrollHeight - node.scrollTop - node.clientHeight < 72);
        }}
      >
        {state.chat.messages.map((message) => {
          const text = textOf(message);
          return (
            <article className={`chat-message ${message.role}`} key={message.id}>
              <small>{message.role === "user" ? "You · " : ""}{targetLabel(state, message.metadata?.target ?? null)}</small>
              {text ? <p>{text}</p> : null}
              {message.role === "assistant" && text ? (
                <button className="icon-text-button" aria-label="Copy assistant response" onClick={() => void navigator.clipboard.writeText(text)}>
                  <Copy aria-hidden="true" size={13} /> Copy
                </button>
              ) : null}
              {message.parts.map((part, index) => {
                if (part.type === "data-proposal") {
                  const proposal = state.chat.proposals.find((item) => item.id === part.data.proposalId);
                  return proposal ? <ProposalCard key={`${message.id}-${index}`} proposal={proposal} state={state} update={update} announce={announce} select={select} /> : null;
                }
                if (part.type === "data-clarification") {
                  const matches = !!current && targetKey(current) === targetKey(part.data.target);
                  const active = pendingClarification?.id === part.data.id;
                  return (
                    <div className="clarification-card" key={`${message.id}-${index}`}>
                      <strong>{part.data.question}</strong>
                      <div className="chat-suggestions">
                        {part.data.choices.map((choice) => <button key={choice} disabled={!active || !matches || running} onClick={() => send(choice, part.data.target)}>{choice}</button>)}
                        {active && !matches ? <button onClick={() => select(selectionForTarget(part.data.target))}>Open target</button> : null}
                      </div>
                      <small>You can also type a free-text reply below.</small>
                    </div>
                  );
                }
                if (part.type === "data-error-details") return <ErrorCard key={`${message.id}-${index}`} details={part.data} state={state} composer={state.chat.composerText} update={update} send={send} select={select} />;
                return null;
              })}
            </article>
          );
        })}
        {streamingMessage ? (
          <article className="chat-message assistant streaming">
            <small>{targetLabel(state, streamingMessage.metadata?.target ?? current)}</small>
            {streamingMessage.parts.map((part, index) => part.type === "text" ? <p key={index}>{part.text}</p> : part.type === "data-working-status" ? <p className="progress-label" key={index}>{part.data.label}…</p> : null)}
          </article>
        ) : null}
        {!state.chat.messages.length && !streamingMessage ? <p>Ask about the selected section or request a simulated edit.</p> : null}
      </div>
      {!nearBottom ? <button className="jump-latest" onClick={() => { const node = conversationRef.current; if (node) node.scrollTop = node.scrollHeight; }}>Jump to latest</button> : null}
      {pendingClarification && !clarificationMatches ? (
        <div className="clarification-binding">
          <span>Open {targetLabel(state, pendingClarification.target)} to answer the pending clarification.</span>
          <button onClick={() => select(selectionForTarget(pendingClarification.target))}>Open clarification target</button>
        </div>
      ) : null}
      <div className="composer-context">
        <span>{targetLabel(state, current)}</span>
        <div className="chat-suggestions" aria-label="Suggested requests">
          {suggestions.map((item) => (
            <button key={item} disabled={!current || running} onClick={() => update((draft) => { draft.chat.composerText = item; })}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); send(state.chat.composerText); }}>
        <label>
          <span className="sr-only">Message the editing assistant</span>
          <textarea
            name="chat-request"
            autoComplete="off"
            aria-label="Message the editing assistant"
            disabled={!current}
            value={state.chat.composerText}
            onChange={(event) => update((draft) => { draft.chat.composerText = event.target.value; })}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send(state.chat.composerText);
              }
            }}
            placeholder={current ? "Ask a question or describe a change…" : "Open an editable section first…"}
          />
        </label>
        {running ? (
          <button type="button" onClick={() => void chat.stop()}><Square aria-hidden="true" size={13} /> Stop</button>
        ) : (
          <button type="submit" disabled={!current || !state.chat.composerText.trim() || !clarificationMatches}><Send aria-hidden="true" size={13} /> Send</button>
        )}
      </form>
    </aside>
  );
}
