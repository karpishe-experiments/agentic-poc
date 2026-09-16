"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  MessageSquare,
  Plus,
  RotateCcw,
  Search,
  Filter,
  ArrowLeft,
} from "lucide-react";
import {
  freshSeed,
  loadState,
  reducer,
  saveState,
} from "@/lib/mockups/specialty-management/state";
import type {
  Agent,
  EditableAgentSection,
  MockupState,
  Selection,
  Specialty,
} from "@/lib/mockups/specialty-management/types";
import { AgentEditor } from "./agent-editor";
import { ChatPanel } from "./chat-panel";
import { StudioDirectory } from "./studio-directory";

type Update = (fn: (draft: MockupState) => void) => void;
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
function change(state: MockupState, mutate: (draft: MockupState) => void) {
  const next = structuredClone(state);
  mutate(next);
  return next;
}

function selectionUrl(selection: Selection) {
  const query = new URLSearchParams();
  query.set("view", selection.kind);
  if (selection.kind === "specialty") query.set("specialty", selection.specialtyId);
  if (selection.kind === "agent") {
    query.set("specialty", selection.specialtyId);
    query.set("agent", selection.agentId);
    query.set("version", selection.versionId);
    query.set("tab", "edit");
    query.set("section", selection.section);
  }
  return `?${query.toString()}`;
}

function selectionFromUrl(state: MockupState) {
  const query = new URLSearchParams(window.location.search);
  const view = query.get("view");
  if (!view || view === "directory")
    return { selection: { kind: "directory" } as Selection, notice: null };
  if (view === "specialty") {
    const specialtyId = query.get("specialty") ?? "";
    if (state.specialties.some((item) => item.id === specialtyId))
      return {
        selection: { kind: "specialty", specialtyId } as Selection,
        notice: null,
      };
  }
  if (view === "agent") {
    const specialtyId = query.get("specialty") ?? "";
    const agentId = query.get("agent") ?? "";
    const versionId = query.get("version") ?? "";
    const agent = state.agents.find(
      (item) => item.id === agentId && item.specialtyId === specialtyId,
    );
    const version = agent?.versions.find((item) => item.id === versionId);
    if (agent && version) {
      const tab = query.get("tab");
      const requested = query.get("section") ?? "configuration";
      const referenceId = requested.startsWith("reference:")
        ? requested.slice(10)
        : null;
      const requestedTest = tab === "test" || requested === "test";
      const validSection =
        requested === "configuration" ||
        requested === "instructions" ||
        (referenceId && version.references.some((item) => item.id === referenceId));
      return {
        selection: {
          kind: "agent",
          specialtyId,
          agentId,
          versionId,
          section: validSection ? (requested as EditableAgentSection) : "configuration",
        } as Selection,
        notice: requestedTest
          ? "Agent testing has been removed. Configuration was opened instead."
          : validSection ? null : "That editor section is unavailable. Configuration was opened instead.",
      };
    }
  }
  if (view === "test-history") return {
    selection: { kind: "directory" } as Selection,
    notice: "Agent testing has been removed. The directory was opened.",
  };
  return {
    selection: { kind: "directory" } as Selection,
    notice: "That Agent Studio target is unavailable. The directory was opened instead.",
  };
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

function Navigation({
  state,
  update,
  select,
  addSpecialty,
  addAgent,
}: {
  state: MockupState;
  update: Update;
  select(selection: Selection): void;
  addSpecialty(): void;
  addAgent(specialty: Specialty): void;
}) {
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
  return (
    <nav className="left-pane" aria-label="Specialties and agents">
      <div className="pane-heading">
        <div>
          <h2>Specialties</h2>
          <span>{visible.length} shown</span>
        </div>
        <div className="pane-heading-actions">
        <details className="filter-menu">
          <summary className="icon-button" aria-label="Filter specialties" role="button">
            <Filter size={16} />
          </summary>
          <label>
            <input
              type="checkbox"
              checked={state.ui.showRetired}
              onChange={(event) =>
                update((draft) => {
                  draft.ui.showRetired = event.target.checked;
                })
              }
            /> Show retired
          </label>
        </details>
        <button
          className="icon-button"
          onClick={addSpecialty}
          aria-label="Add specialty"
        >
          <Plus size={17} />
        </button>
        </div>
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
  if (state.ui.selection.kind === "directory") return null;
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
          <button
            className="toolbar-icon-button"
            aria-label={state.ui.focusMode ? "Exit focus mode" : "Enter focus mode"}
            title={state.ui.focusMode ? "Exit focus mode" : "Enter focus mode"}
            onClick={() =>
              update((next) => {
                next.ui.focusMode = !next.ui.focusMode;
              })
            }
          >
            {state.ui.focusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
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
  const select = (selection: Selection, history: "push" | "replace" = "push") => {
    if (history === "push")
      window.history.pushState(null, "", selectionUrl(selection));
    else window.history.replaceState(null, "", selectionUrl(selection));
    update((draft) => {
      draft.ui.selection = selection;
      draft.ui.navigationNotice = null;
      if (selection.kind === "agent")
        draft.ui.recentVersionIds[selection.agentId] = selection.versionId;
    });
  };
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
    });
    select({ kind: "specialty", specialtyId: specialty.id });
  };
  const addAgent = (specialty: Specialty) => {
    const language = state.models.find((item) => item.kind === "language")!;
    const image = state.models.find((item) => item.kind === "image")!;
    const versionId = uid("version");
    const agent: Agent = {
      id: uid("agent"),
      specialtyId: specialty.id,
      activeVersionId: null,
      versions: [{
        id: versionId,
        number: 1,
        parentVersionId: null,
        status: "draft",
        title: "Untitled agent",
        description: "",
        versionNote: "",
        languageModel: { provider: language.provider, model: language.label },
        imageModel: specialty.outputType === "image"
          ? { provider: image.provider, model: image.label }
          : null,
        mainInstructions: "",
        references: [],
      }],
    };
    update((draft) => {
      draft.agents.push(agent);
    });
    select({
      kind: "agent",
      specialtyId: specialty.id,
      agentId: agent.id,
      versionId,
      section: "configuration",
    });
  };
  useEffect(() => {
    const result = loadState(localStorage);
    queueMicrotask(() => {
      if (result.state) {
        const resolved = selectionFromUrl(result.state);
        result.state.ui.selection = resolved.selection;
        result.state.ui.navigationNotice = resolved.notice;
        if (resolved.selection.kind === "agent")
          result.state.ui.recentVersionIds[resolved.selection.agentId] =
            resolved.selection.versionId;
        dispatch({ type: "replace", state: result.state });
        window.history.replaceState(null, "", selectionUrl(resolved.selection));
      }
      else setLoadError(result.error);
      setHydrated(true);
    });
  }, []);
  useEffect(() => {
    if (!hydrated || loadError) return;
    const onPopState = () => {
      const resolved = selectionFromUrl(state);
      update((draft) => {
        draft.ui.selection = resolved.selection;
        draft.ui.navigationNotice = resolved.notice;
        if (resolved.selection.kind === "agent")
          draft.ui.recentVersionIds[resolved.selection.agentId] =
            resolved.selection.versionId;
      });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [hydrated, loadError, state]);
  useEffect(() => {
    if (!hydrated || loadError) return;
    window.history.replaceState(null, "", selectionUrl(state.ui.selection));
  }, [hydrated, loadError, state.ui.selection]);
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
  useEffect(() => {
    if (!state.ui.focusMode) return;
    const exit = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;
      if (document.querySelector("dialog[open], .mention-menu, [role='menu']"))
        return;
      event.preventDefault();
      update((draft) => {
        draft.ui.focusMode = false;
      });
      queueMicrotask(() =>
        document
          .querySelector<HTMLButtonElement>("[aria-label='Enter focus mode']")
          ?.focus(),
      );
    };
    window.addEventListener("keydown", exit);
    return () => window.removeEventListener("keydown", exit);
  }, [state.ui.focusMode]);
  const reset = () => {
    if (!confirm("Reset all specialty-management demo data?")) return;
    const next = freshSeed();
    setLoadError(null);
    setSaveError(saveState(localStorage, next));
    setChatResetToken((value) => value + 1);
    dispatch({ type: "replace", state: next });
    window.history.replaceState(null, "", selectionUrl(next.ui.selection));
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
        </div>
        <div>
          {state.ui.selection.kind !== "directory" ? (
            <button
              className="toolbar-text-button"
              onClick={() => select({ kind: "directory" })}
            >
              <ArrowLeft aria-hidden="true" size={15} /> Directory
            </button>
          ) : null}
          {state.ui.selection.kind !== "directory" && !state.ui.chatOpen ? <button
            className="toolbar-icon-button"
            aria-label="Reopen Assistant"
            title="Reopen Assistant"
            onClick={() =>
              update((draft) => {
                draft.ui.chatOpen = true;
                draft.ui.focusMode = false;
              })
            }
          >
            <MessageSquare aria-hidden="true" size={15} />
          </button> : null}
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
      {state.ui.navigationNotice ? (
        <div className="navigation-notice" role="status">
          {state.ui.navigationNotice}
          <button
            className="link-button"
            onClick={() => update((draft) => { draft.ui.navigationNotice = null; })}
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {saveError ? (
        <div className="storage-alert" role="alert">
          {saveError}{" "}
          <button onClick={() => setSaveError(saveState(localStorage, state))}>
            Retry
          </button>
        </div>
      ) : null}
      <div
        className={`mockup-shell ${state.ui.focusMode ? "focus-mode" : ""} ${state.ui.selection.kind === "directory" ? "directory-shell" : ""}`}
        style={{
          gridTemplateColumns: state.ui.focusMode
            ? "minmax(360px,1fr)"
            : state.ui.selection.kind === "directory"
              ? "minmax(560px,1fr)"
              : `${state.ui.navWidth}px 7px minmax(360px,1fr)${state.ui.chatOpen ? ` 7px ${state.ui.chatWidth}px` : ""}`,
        }}
      >
        {state.ui.selection.kind === "directory" ? (
          <StudioDirectory
            state={state}
            update={update}
            select={select}
            addSpecialty={addSpecialty}
            addAgent={addAgent}
          />
        ) : !state.ui.focusMode ? (
          <Navigation
            state={state}
            update={update}
            select={select}
            addSpecialty={addSpecialty}
            addAgent={addAgent}
          />
        ) : null}
        {state.ui.selection.kind !== "directory" && !state.ui.focusMode ? (
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
        ) : null}
        {state.ui.selection.kind !== "directory" ? (
          <SpecialtyEditor
            state={state}
            update={update}
            announce={setAnnouncement}
          />
        ) : null}
        {!state.ui.focusMode && state.ui.selection.kind !== "directory" && state.ui.chatOpen ? (
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
          key="persistent-assistant"
          state={state}
          update={update}
          announce={setAnnouncement}
          hidden={state.ui.focusMode || state.ui.selection.kind === "directory" || !state.ui.chatOpen}
          resetToken={chatResetToken}
          onCollapse={() =>
            update((draft) => {
              draft.ui.chatOpen = false;
            })
          }
        />
      </div>
    </section>
  );
}
