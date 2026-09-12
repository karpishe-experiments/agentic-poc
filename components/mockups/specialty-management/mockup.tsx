"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";
import {
  freshSeed,
  loadState,
  reducer,
  saveState,
} from "@/lib/mockups/specialty-management/state";
import type {
  Agent,
  MockupState,
  Selection,
  Specialty,
} from "@/lib/mockups/specialty-management/types";
import { AgentEditor } from "./agent-editor";
import { ChatPanel } from "./chat-panel";

type Update = (fn: (draft: MockupState) => void) => void;
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
function change(state: MockupState, mutate: (draft: MockupState) => void) {
  const next = structuredClone(state);
  mutate(next);
  return next;
}

function ResizeHandle({
  label,
  onMove,
}: {
  label: string;
  onMove(delta: number): void;
}) {
  const start = useRef(0);
  return (
    <div
      className="resize-handle"
      role="separator"
      aria-label={label}
      tabIndex={0}
      onPointerDown={(event) => {
        start.current = event.clientX;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const delta = event.clientX - start.current;
        if (Math.abs(delta) >= 4) {
          onMove(delta);
          start.current = event.clientX;
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          onMove(event.key === "ArrowLeft" ? -16 : 16);
        }
      }}
    />
  );
}

function Navigation({ state, update }: { state: MockupState; update: Update }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const visible = state.specialties.filter(
    (specialty) =>
      (state.ui.showRetired || !specialty.retired) &&
      (!needle ||
        specialty.name.toLowerCase().includes(needle) ||
        state.agents.some(
          (agent) =>
            agent.specialtyId === specialty.id &&
            agent.versions.some((version) =>
              version.title.toLowerCase().includes(needle),
            ),
        )),
  );
  const select = (selection: Selection) =>
    update((draft) => {
      draft.ui.selection = selection;
    });
  const addSpecialty = () => {
    const specialty: Specialty = {
      id: uid("sp"),
      name: "Untitled specialty",
      description: "",
      outputType: "text",
      allowedToolIds: [],
      builtIn: false,
      retired: false,
    };
    update((draft) => {
      draft.specialties.push(specialty);
      draft.ui.expandedSpecialtyIds.push(specialty.id);
      draft.ui.selection = { kind: "specialty", specialtyId: specialty.id };
    });
  };
  const addAgent = (specialty: Specialty) => {
    const language = state.models.find((item) => item.kind === "language")!;
    const image = state.models.find((item) => item.kind === "image")!;
    const versionId = uid("version");
    const agent: Agent = {
      id: uid("agent"),
      specialtyId: specialty.id,
      activeVersionId: null,
      versions: [
        {
          id: versionId,
          number: 1,
          parentVersionId: null,
          status: "draft",
          title: "Untitled agent",
          languageModel: { provider: language.provider, model: language.label },
          imageModel:
            specialty.outputType === "image"
              ? { provider: image.provider, model: image.label }
              : null,
          mainInstructions: "",
          references: [],
        },
      ],
    };
    update((draft) => {
      draft.agents.push(agent);
      draft.ui.selection = {
        kind: "agent",
        specialtyId: specialty.id,
        agentId: agent.id,
        versionId,
        section: "configuration",
      };
    });
  };
  return (
    <nav className="left-pane" aria-label="Specialties and agents">
      <div className="pane-heading">
        <div>
          <h2>Specialties</h2>
          <span>{visible.length} shown</span>
        </div>
        <button
          className="icon-button"
          onClick={addSpecialty}
          aria-label="Add specialty"
        >
          <Plus size={17} />
        </button>
      </div>
      <label className="search">
        <Search size={15} />
        <span className="sr-only">Search specialties and agents</span>
        <input
          name="specialty-search"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search…"
        />
      </label>
      <ul className="specialty-list">
        {visible.map((specialty) => {
          const expanded = state.ui.expandedSpecialtyIds.includes(specialty.id);
          const specialtyMatches =
            !needle || specialty.name.toLowerCase().includes(needle);
          const agents = state.agents.filter(
            (agent) =>
              agent.specialtyId === specialty.id &&
              (specialtyMatches ||
                agent.versions.some((version) =>
                  version.title.toLowerCase().includes(needle),
                )),
          );
          const selected =
            state.ui.selection.kind === "specialty" &&
            state.ui.selection.specialtyId === specialty.id;
          const dirty = !!state.workingCopies.specialties[specialty.id];
          return (
            <li key={specialty.id}>
              <div className={`specialty-row ${selected ? "selected" : ""}`}>
                <button
                  className="chevron"
                  aria-label={`${expanded ? "Collapse" : "Expand"} ${specialty.name}`}
                  aria-expanded={expanded}
                  onClick={() =>
                    update((draft) => {
                      draft.ui.expandedSpecialtyIds = expanded
                        ? draft.ui.expandedSpecialtyIds.filter(
                            (id) => id !== specialty.id,
                          )
                        : [...draft.ui.expandedSpecialtyIds, specialty.id];
                    })
                  }
                >
                  {expanded ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </button>
                <button
                  className="entity-button"
                  aria-current={selected ? "page" : undefined}
                  onClick={() =>
                    select({ kind: "specialty", specialtyId: specialty.id })
                  }
                >
                  <span>
                    {specialty.name}
                    {dirty ? (
                      <i className="dirty-dot" aria-label="Unsaved changes">
                        ●
                      </i>
                    ) : null}
                  </span>
                  <small>
                    {specialty.outputType}
                    {specialty.builtIn ? " · Built-in" : ""}
                    {specialty.retired ? " · Retired" : ""}
                  </small>
                </button>
              </div>
              {expanded ? (
                <ul className="agent-list">
                  {agents.map((agent) => {
                    const recentId = state.ui.recentVersionIds?.[agent.id];
                    const version =
                      agent.versions.find((item) => item.id === recentId) ??
                      agent.versions.find(
                        (item) => item.id === agent.activeVersionId,
                      ) ??
                      agent.versions.toSorted((a, b) => b.number - a.number)[0];
                    if (!version) return null;
                    const shown =
                      state.ui.selection.kind === "agent" &&
                      state.ui.selection.agentId === agent.id
                        ? (state.workingCopies.versions[
                            state.ui.selection.versionId
                          ] ?? version)
                        : version;
                    const agentSelected =
                      state.ui.selection.kind === "agent" &&
                      state.ui.selection.agentId === agent.id;
                    return (
                      <li key={agent.id}>
                        <button
                          className={`agent-row ${agentSelected ? "selected" : ""}`}
                          aria-current={agentSelected ? "page" : undefined}
                          onClick={() =>
                            update((draft) => {
                              draft.ui.recentVersionIds = {
                                ...draft.ui.recentVersionIds,
                                [agent.id]: version.id,
                              };
                              draft.ui.selection = {
                                kind: "agent",
                                specialtyId: specialty.id,
                                agentId: agent.id,
                                versionId: version.id,
                                section: "configuration",
                              };
                            })
                          }
                        >
                          <span>
                            {shown.title}
                            {state.ui.selection.kind === "agent" &&
                            state.ui.selection.agentId === agent.id &&
                            state.workingCopies.versions[
                              state.ui.selection.versionId
                            ] ? (
                              <i
                                className="dirty-dot"
                                aria-label="Unsaved changes"
                              >
                                ●
                              </i>
                            ) : null}
                          </span>
                          <small>
                            {agent.activeVersionId ? "Active" : "Inactive"} · v
                            {version.number}
                          </small>
                        </button>
                      </li>
                    );
                  })}
                  <li>
                    <button
                      className="add-agent"
                      onClick={() => addAgent(specialty)}
                    >
                      <Plus size={14} /> Add agent
                    </button>
                  </li>
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
      <label className="show-retired">
        <input
          type="checkbox"
          checked={state.ui.showRetired}
          onChange={(event) =>
            update((draft) => {
              draft.ui.showRetired = event.target.checked;
            })
          }
        />{" "}
        Show retired
      </label>
    </nav>
  );
}

function SpecialtyEditor({
  state,
  update,
  announce,
}: {
  state: MockupState;
  update: Update;
  announce(message: string): void;
}) {
  if (state.ui.selection.kind !== "specialty")
    return <AgentEditor state={state} update={update} announce={announce} />;
  const id = state.ui.selection.specialtyId;
  const saved = state.specialties.find((item) => item.id === id);
  if (!saved) return null;
  const draft = state.workingCopies.specialties[id] ?? saved;
  const dirty = !!state.workingCopies.specialties[id];
  const set = (patch: Partial<Specialty>) =>
    update((next) => {
      next.workingCopies.specialties[id] = {
        ...(next.workingCopies.specialties[id] ??
          next.specialties.find((item) => item.id === id)!),
        ...patch,
      };
    });
  const save = () => {
    if (!draft.name.trim()) return;
    update((next) => {
      const working = next.workingCopies.specialties[id];
      if (working)
        next.specialties = next.specialties.map((item) =>
          item.id === id ? { ...working, name: working.name.trim() } : item,
        );
      delete next.workingCopies.specialties[id];
    });
    announce("Specialty changes saved.");
  };
  const discard = () => {
    update((next) => {
      delete next.workingCopies.specialties[id];
    });
    announce("Specialty changes discarded.");
  };
  return (
    <section className="specialty-editor">
      <header className="entity-header">
        <div>
          <p>Specialty settings</p>
          <h2>{draft.name || "Untitled specialty"}</h2>
          <span>
            {dirty ? "Unsaved changes · retained in this browser" : "Saved"}
          </span>
        </div>
        <div className="header-actions">
          <button disabled={!dirty} onClick={discard}>
            Discard
          </button>
          <button
            className="primary"
            disabled={!dirty || !draft.name.trim()}
            onClick={save}
          >
            Save changes
          </button>
        </div>
      </header>
      <div className="form-grid">
        <label>
          Name
          <input
            name="specialty-name"
            autoComplete="off"
            value={draft.name}
            disabled={draft.builtIn}
            onChange={(event) => set({ name: event.target.value })}
          />
          {!draft.name.trim() ? (
            <small className="error">Enter a name.</small>
          ) : null}
        </label>
        <label>
          Description
          <textarea
            name="specialty-description"
            autoComplete="off"
            value={draft.description}
            onChange={(event) => set({ description: event.target.value })}
          />
        </label>
        <fieldset disabled={draft.builtIn}>
          <legend>Output type</legend>
          <div className="segments">
            <button
              type="button"
              className={draft.outputType === "text" ? "active" : ""}
              onClick={() => set({ outputType: "text" })}
            >
              Text
            </button>
            <button
              type="button"
              className={draft.outputType === "image" ? "active" : ""}
              onClick={() => set({ outputType: "image" })}
            >
              Image
            </button>
          </div>
        </fieldset>
        <fieldset>
          <legend>Allowed tools</legend>
          <div className="tool-list">
            {state.tools.map((tool) => (
              <label key={tool.id}>
                <input
                  type="checkbox"
                  checked={draft.allowedToolIds.includes(tool.id)}
                  onChange={(event) =>
                    set({
                      allowedToolIds: event.target.checked
                        ? [...draft.allowedToolIds, tool.id]
                        : draft.allowedToolIds.filter(
                            (item) => item !== tool.id,
                          ),
                    })
                  }
                />
                <span>
                  <strong>{tool.name}</strong>
                  <small>{tool.description}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <footer className="danger-zone">
        <div>
          <strong>
            {saved.retired ? "Restore specialty" : "Retire specialty"}
          </strong>
          <p>This only changes its visibility in this mockup.</p>
        </div>
        <button
          disabled={saved.builtIn}
          onClick={() =>
            update((next) => {
              const item = next.specialties.find((value) => value.id === id);
              if (item) item.retired = !item.retired;
            })
          }
        >
          {saved.retired ? "Restore" : "Retire"}
        </button>
      </footer>
    </section>
  );
}

export function SpecialtyManagementMockup() {
  const [state, dispatch] = useReducer(reducer, undefined, freshSeed);
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [chatResetToken, setChatResetToken] = useState(0);
  const update: Update = (fn) =>
    dispatch({ type: "mutate", mutate: (current) => change(current, fn) });
  useEffect(() => {
    const result = loadState(localStorage);
    queueMicrotask(() => {
      if (result.state) dispatch({ type: "replace", state: result.state });
      else setLoadError(result.error);
      setHydrated(true);
    });
  }, []);
  useEffect(() => {
    if (hydrated && !loadError) {
      const error = saveState(localStorage, state);
      queueMicrotask(() => setSaveError(error));
    }
  }, [hydrated, loadError, state]);
  useEffect(() => {
    const dirty =
      Object.keys(state.workingCopies.specialties).length > 0 ||
      Object.keys(state.workingCopies.versions).length > 0;
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.workingCopies]);
  const reset = () => {
    if (!confirm("Reset all specialty-management demo data?")) return;
    const next = freshSeed();
    setLoadError(null);
    setSaveError(saveState(localStorage, next));
    setChatResetToken((value) => value + 1);
    dispatch({ type: "replace", state: next });
  };
  if (!hydrated) return <div role="status">Loading management mockup…</div>;
  if (loadError)
    return (
      <section>
        <h1>Agent Studio</h1>
        <p role="alert">{loadError}</p>
        <button onClick={reset}>Reset demo data</button>
      </section>
    );
  return (
    <section data-management-mockup className="management-mockup">
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
      <header className="mockup-toolbar">
        <div>
          <h1>Agent Studio</h1>
          <p>Synthetic data · simulated chat</p>
        </div>
        <div>
          <button
            className="toolbar-icon-button"
            aria-label={state.ui.chatOpen ? "Hide chat" : "Show chat"}
            title={state.ui.chatOpen ? "Hide chat" : "Show chat"}
            onClick={() =>
              update((draft) => {
                draft.ui.chatOpen = !draft.ui.chatOpen;
              })
            }
          >
            <MessageSquare aria-hidden="true" size={15} />
          </button>
          <button
            className="toolbar-icon-button"
            aria-label="Reset demo data"
            title="Reset demo data"
            onClick={reset}
          >
            <RotateCcw aria-hidden="true" size={15} />
          </button>
        </div>
      </header>
      {saveError ? (
        <div className="storage-alert" role="alert">
          {saveError}{" "}
          <button onClick={() => setSaveError(saveState(localStorage, state))}>
            Retry
          </button>
        </div>
      ) : null}
      <div
        className="mockup-shell"
        style={{
          gridTemplateColumns: `${state.ui.navWidth}px 7px minmax(360px,1fr)${state.ui.chatOpen ? ` 7px ${state.ui.chatWidth}px` : ""}`,
        }}
      >
        <Navigation state={state} update={update} />
        <ResizeHandle
          label="Resize specialties pane"
          onMove={(delta) =>
            update((draft) => {
              draft.ui.navWidth = Math.max(
                200,
                Math.min(320, draft.ui.navWidth + delta),
              );
            })
          }
        />
        <SpecialtyEditor
          state={state}
          update={update}
          announce={setAnnouncement}
        />
        {state.ui.chatOpen ? (
          <ResizeHandle
            label="Resize editing assistant pane"
            onMove={(delta) =>
              update((draft) => {
                draft.ui.chatWidth = Math.max(
                  300,
                  Math.min(460, draft.ui.chatWidth - delta),
                );
              })
            }
          />
        ) : null}
        <ChatPanel
          state={state}
          update={update}
          announce={setAnnouncement}
          hidden={!state.ui.chatOpen}
          resetToken={chatResetToken}
        />
      </div>
    </section>
  );
}
