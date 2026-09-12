"use client";

import { useMemo, useState } from "react";
import { History, Play, RotateCcw, Send, Square, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { STAGES } from "@/lib/mockups/specialty-management/booklets";
import {
  compatibilityFor,
  createTestSession,
  editingHandoff,
  isSessionOrphaned,
  isSessionVersionMissing,
  rateTestResponse,
  repeatTestSetup,
  retryTestResponse,
  selectTestVersion,
  startTestResponse,
  stopTestResponse,
} from "@/lib/mockups/specialty-management/testing";
import type {
  MockupState,
  TestMessage,
  TestSession,
} from "@/lib/mockups/specialty-management/types";

type Update = (fn: (draft: MockupState) => void) => void;
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function ResultView({ message }: { message: TestMessage }) {
  const result = message.result;
  if (!result) return null;
  if (result.kind === "text")
    return (
      <div className="test-result markdown-preview compact-preview">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.markdown}</ReactMarkdown>
        {result.revisionNote ? <small>{result.revisionNote}</small> : null}
      </div>
    );
  if (result.kind === "image")
    return (
      <figure className="test-result image-test-result">
        {/* eslint-disable-next-line @next/next/no-img-element -- bundled mockup fixture */}
        <img src={result.imagePath} alt={result.description} />
        <figcaption>{result.description}</figcaption>
        {result.revisionNote ? <small>{result.revisionNote}</small> : null}
        <details>
          <summary>Image metadata</summary>
          <dl>{Object.entries(result.metadata).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
        </details>
      </figure>
    );
  if (result.kind === "orchestrator")
    return (
      <div className="test-result">
        <strong>{result.selectedSpecialtyId ? "Specialty selected" : "Routing unavailable"}</strong>
        <p>{result.explanation}</p>
      </div>
    );
  return <div className="test-result"><p>{result.explanation}</p></div>;
}

function TestTurn({
  message,
  session,
  state,
  update,
  announce,
}: {
  message: TestMessage;
  session: TestSession;
  state: MockupState;
  update: Update;
  announce(message: string): void;
}) {
  const activity = session.activity.filter((item) => message.activityIds?.includes(item.id));
  const orphaned = isSessionOrphaned(state, session);
  const handoff = message.role === "assistant" && message.result
    ? editingHandoff(state, session.id, message.id)
    : null;
  return (
    <article className={`test-message ${message.role}`}>
      <small>{message.role === "user" ? "You" : "Test agent"} · {message.state}</small>
      <p>{message.text}</p>
      <ResultView message={message} />
      {activity.length ? (
        <details className="test-activity">
          <summary>Simulated activity ({activity.length})</summary>
          {activity.map((item) => (
            <details key={item.id}>
              <summary>{item.label}</summary>
              <dl><dt>Input</dt><dd>{item.input}</dd><dt>Output</dt><dd>{item.output}</dd></dl>
            </details>
          ))}
        </details>
      ) : null}
      {message.retryRequest ? (
        <button
          disabled={!!state.pendingTestResponse}
          onClick={() => update((draft) => { retryTestResponse(draft, session.id, message.id, uid); })}
        >Retry turn</button>
      ) : null}
      {message.role === "assistant" && message.state === "complete" ? (
        <div className="test-feedback">
          <div>
            <button
              aria-pressed={message.rating === "useful"}
              onClick={() => update((draft) => { rateTestResponse(draft, session.id, message.id, message.rating === "useful" ? null : "useful", message.note ?? ""); })}
            >Useful</button>
            <button
              aria-pressed={message.rating === "needs-work"}
              onClick={() => update((draft) => { rateTestResponse(draft, session.id, message.id, message.rating === "needs-work" ? null : "needs-work", message.note ?? ""); })}
            >Needs work</button>
          </div>
          <label>Feedback note
            <textarea
              value={message.note ?? ""}
              onChange={(event) => update((draft) => { rateTestResponse(draft, session.id, message.id, message.rating ?? null, event.target.value); })}
            />
          </label>
          <button
            disabled={!handoff}
            onClick={() => {
              if (!handoff) return;
              update((draft) => {
                const agent = draft.agents.find((item) => item.id === handoff.agentId)!;
                const separator = draft.chat.composerText.trim() ? "\n\n---\n\n" : "";
                draft.chat.composerText += `${separator}${handoff.differs ? "The tested version is unavailable; using the current version.\n\n" : ""}${handoff.request}`;
                draft.ui.chatOpen = true;
                draft.ui.focusMode = false;
                draft.ui.selection = { kind: "agent", specialtyId: agent.specialtyId, agentId: agent.id, versionId: handoff.versionId, section: "instructions" };
              });
              announce("Test feedback prepared in the Editing assistant. Review before sending.");
            }}
          >Send to editing chat</button>
          {orphaned ? <small className="proposal-note">Unavailable because the source agent was deleted.</small> : null}
        </div>
      ) : null}
    </article>
  );
}

function SessionView({
  session,
  state,
  update,
  announce,
}: {
  session: TestSession;
  state: MockupState;
  update: Update;
  announce(message: string): void;
}) {
  const [request, setRequest] = useState("");
  const pending = state.pendingTestResponse?.sessionId === session.id;
  const orphaned = isSessionOrphaned(state, session);
  const versionMissing = isSessionVersionMissing(state, session);
  const repeat = () => {
    const setup = repeatTestSetup(state, session.id);
    if (!setup) return;
    update((draft) => { draft.ui.testSetup = setup; });
    announce("Repeat setup is ready. Select Start test to capture current agent edits.");
  };
  return (
    <section className="test-session" aria-label="Test session">
      <header>
        <label>Session name
          <input value={session.name} onChange={(event) => update((draft) => {
            const item = draft.testSessions.find((value) => value.id === session.id);
            if (item) item.name = event.target.value;
          })} />
        </label>
        <div className="session-badges">
          <span>Frozen v{session.agentVersionNumber}</span>
          <span>{session.stageSnapshot.stageLabel}</span>
          {session.sourceSessionId ? <span>Repeated test</span> : null}
          {orphaned ? <span className="warning-badge">Source agent missing</span> : null}
          {versionMissing ? <span className="warning-badge">Tested version missing</span> : null}
        </div>
      </header>
      <details className="captured-context">
        <summary>Captured test details</summary>
        <dl>
          <dt>Agent</dt><dd>{session.agentName} · v{session.agentVersionNumber}</dd>
          <dt>Version note</dt><dd>{session.agentSnapshot.versionNote || "No version note"}</dd>
          <dt>Specialty</dt><dd>{session.specialtyName} · {session.specialtySnapshot.outputType}</dd>
          <dt>Allowed tools</dt><dd>{session.specialtySnapshot.allowedToolIds.join(", ") || "None"}</dd>
          <dt>Booklet</dt><dd>{session.stageSnapshot.premise} · {session.stageSnapshot.audience}</dd>
          <dt>Task</dt><dd>{session.stageSnapshot.taskContext}</dd>
        </dl>
      </details>
      <div className="test-conversation" aria-live="polite">
        {session.messages.map((message) => <TestTurn key={message.id} message={message} session={session} state={state} update={update} announce={announce} />)}
        {pending ? <div className="test-progress" role="status">Reading frozen context… Preparing deterministic result…</div> : null}
      </div>
      <div className="test-suggestions">
        {["Summarize context", "Produce a sample result", "Revise the result"].map((item) => <button key={item} onClick={() => setRequest(item)}>{item}</button>)}
      </div>
      <form className="test-composer" onSubmit={(event) => {
        event.preventDefault();
        if (!request.trim()) return;
        update((draft) => { startTestResponse(draft, session.id, request, "followup", uid); });
        setRequest("");
      }}>
        <label><span className="sr-only">Message Test agent</span><textarea aria-label="Message Test agent" value={request} onChange={(event) => setRequest(event.target.value)} /></label>
        {pending ? <button type="button" onClick={() => update((draft) => { stopTestResponse(draft, uid); })}><Square size={13} /> Stop test response</button> : <button type="submit" disabled={!request.trim() || !!state.pendingTestResponse}><Send size={13} /> Send to Test agent</button>}
      </form>
      <div className="session-actions">
        <button disabled={orphaned} onClick={repeat}><RotateCcw size={13} /> Repeat test with current edits</button>
        {orphaned ? <small>Repeat is unavailable because the source agent was deleted.</small> : null}
        <button className="danger-button" onClick={() => {
          if (!confirm("Delete this test session?")) return;
          update((draft) => {
            if (draft.pendingTestResponse?.sessionId === session.id) draft.pendingTestResponse = null;
            draft.testSessions = draft.testSessions.filter((item) => item.id !== session.id);
            if (draft.ui.selection.kind === "test-history" && draft.ui.selection.sessionId === session.id)
              draft.ui.selection.sessionId = draft.testSessions[0]?.id ?? null;
          });
        }}><Trash2 size={13} /> Delete session</button>
      </div>
    </section>
  );
}

function Setup({ agentId, state, update }: { agentId: string; state: MockupState; update: Update }) {
  const setup = state.ui.testSetup;
  const selected = selectTestVersion(state, agentId);
  const source = setup.sourceSessionId
    ? state.testSessions.find(
        (item) => item.id === setup.sourceSessionId && item.agentId === agentId,
      )
    : null;
  const booklet = state.booklets.find((item) => item.id === setup.bookletId) ?? state.booklets[0];
  const snapshot = source?.stageSnapshot ?? booklet?.snapshots.find((item) => item.stageId === setup.stageId) ?? booklet?.snapshots[0];
  const specialty = selected && state.specialties.find((item) => item.id === selected.agent.specialtyId);
  const compatibility = specialty && snapshot ? compatibilityFor(specialty, snapshot.stageId) : "undefined";
  if (!selected || !booklet || !snapshot) return <p>Test setup is unavailable.</p>;
  return (
    <section className="test-setup" aria-label="Test setup">
      <header><h3>Test agent</h3><p>Choose frozen synthetic context. No model or tool executes.</p></header>
      {source ? <p className="info-banner">Repeating {source.name}. The original booklet snapshot is fixed; Start test captures current agent edits.</p> : null}
      <div className="form-grid">
        <label>Booklet
          <select aria-label="Test booklet" disabled={!!source} value={setup.bookletId} onChange={(event) => update((draft) => {
            const next = draft.booklets.find((item) => item.id === event.target.value)!;
            draft.ui.testSetup.bookletId = next.id;
            draft.ui.testSetup.stageId = next.currentStageId;
            draft.ui.testSetup.sourceSessionId = null;
          })}>{state.booklets.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
        </label>
        <label>Prepared stage
          <select aria-label="Test stage" disabled={!!source} value={setup.stageId} onChange={(event) => update((draft) => { draft.ui.testSetup.stageId = event.target.value as typeof setup.stageId; })}>
            {booklet.snapshots.map((item) => <option key={item.id} value={item.stageId}>{item.stageLabel}{item.stageId === booklet.currentStageId ? " · Current" : ""}</option>)}
          </select>
        </label>
        <label>Opening request
          <textarea aria-label="Opening test request" value={setup.openingRequest} onChange={(event) => update((draft) => { draft.ui.testSetup.openingRequest = event.target.value; })} />
        </label>
      </div>
      <div className="snapshot-preview">
        <div><strong>Version to capture</strong><p>{selected.visible.title} · v{selected.visible.number}{state.workingCopies.versions[selected.saved.id] ? " · unsaved edits included" : ""}</p></div>
        <div><strong>Stage order</strong><p>{STAGES.slice(0, snapshot.stageIndex + 1).map((item) => item.label).join(" → ")}</p></div>
        <div><strong>Available artifacts</strong><p>{snapshot.artifacts.map((item) => item.label).join(", ") || "None yet"}</p></div>
        <div><strong>Conversation</strong><p>{snapshot.conversation.map((item) => `${item.role}: ${item.text}`).join(" · ")}</p></div>
        <div><strong>Task context</strong><p>{snapshot.taskContext}</p></div>
      </div>
      {compatibility !== "compatible" ? <p className="info-banner">{compatibility === "undefined" ? "Compatibility not defined for this specialty." : "This specialty is not a typical match for the selected stage. You can still test it."}</p> : null}
      <button className="primary" disabled={!setup.openingRequest.trim() || !!state.pendingTestResponse} onClick={() => update((draft) => {
        const session = createTestSession(
          draft,
          agentId,
          {
            ...draft.ui.testSetup,
            sourceSessionId: source?.id ?? null,
          },
          uid,
        );
        if (session) startTestResponse(draft, session.id, session.openingRequest, "opening", uid);
      })}><Play size={13} /> Start test</button>
    </section>
  );
}

export function AgentTestWorkspace({ agentId, state, update, announce }: { agentId: string; state: MockupState; update: Update; announce(message: string): void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sessions = state.testSessions.filter((item) => item.agentId === agentId);
  const session = sessions.find((item) => item.id === selectedId) ?? sessions[0];
  return (
    <div className="test-workspace">
      <Setup agentId={agentId} state={state} update={update} />
      <section className="agent-test-history">
        <div className="section-title"><h3>Previous tests</h3><span>{sessions.length}</span></div>
        <div className="session-list">{sessions.map((item) => <button className={session?.id === item.id ? "selected" : ""} key={item.id} onClick={() => setSelectedId(item.id)}>{item.name}</button>)}</div>
        {session ? <SessionView session={session} state={state} update={update} announce={announce} /> : <p>No tests yet.</p>}
      </section>
    </div>
  );
}

export function TestHistoryWorkspace({ state, update, announce }: { state: MockupState; update: Update; announce(message: string): void }) {
  const selection = state.ui.selection;
  const [agentFilter, setAgentFilter] = useState("");
  const [bookletFilter, setBookletFilter] = useState("");
  const sessions = useMemo(() => state.testSessions.filter((item) => (!agentFilter || item.agentId === agentFilter) && (!bookletFilter || item.stageSnapshot.bookletId === bookletFilter)), [agentFilter, bookletFilter, state.testSessions]);
  const selectedId = selection.kind === "test-history" ? selection.sessionId : null;
  const session = sessions.find((item) => item.id === selectedId) ?? sessions[0];
  return (
    <section className="history-workspace">
      <header className="entity-header"><div><p>Agent Studio</p><h2>Test history</h2><span>Frozen synthetic sessions, newest first</span></div></header>
      <div className="history-body">
        <div className="history-filters">
          <label>Agent<select aria-label="Filter test history by agent" value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)}><option value="">All agents</option>{[...new Map(state.testSessions.map((item) => [item.agentId, item.agentName])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label>Booklet<select aria-label="Filter test history by booklet" value={bookletFilter} onChange={(event) => setBookletFilter(event.target.value)}><option value="">All booklets</option>{state.booklets.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        </div>
        <div className="history-grid">
          <nav className="session-list" aria-label="Test sessions">{sessions.map((item) => <button className={session?.id === item.id ? "selected" : ""} key={item.id} onClick={() => update((draft) => { draft.ui.selection = { kind: "test-history", sessionId: item.id }; })}><History size={13} /> {item.name}</button>)}</nav>
          <div>{session ? <SessionView session={session} state={state} update={update} announce={announce} /> : <p>No test sessions match these filters.</p>}</div>
        </div>
      </div>
    </section>
  );
}
