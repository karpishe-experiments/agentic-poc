"use client";
import { useEffect, useRef, useState } from "react";
import { FileText, Maximize2, Minimize2, MoreHorizontal, Plus, Settings2, Trash2 } from "lucide-react";
import { MarkdownEditor } from "./markdown-editor";
import { SampleResultDialog } from "./sample-result-dialog";
import { AgentTestWorkspace } from "./test-workspace";
import { suggestVersionNote } from "@/lib/mockups/specialty-management/version-notes";
import type {
  AgentVersion,
  MockupState,
  ReferenceFile,
} from "@/lib/mockups/specialty-management/types";

type Update = (fn: (draft: MockupState) => void) => void;
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const newest = (versions: AgentVersion[]) =>
  versions.toSorted((a, b) => b.number - a.number)[0];

export function AgentEditor({
  state,
  update,
  announce,
}: {
  state: MockupState;
  update: Update;
  announce(message: string): void;
}) {
  const [sampleOpen, setSampleOpen] = useState(false);
  const [noteSuggestion, setNoteSuggestion] = useState<{
    versionId: string;
    text: string;
  } | null>(null);
  const [lifecycleOpen, setLifecycleOpen] = useState(false);
  const suggestNoteButton = useRef<HTMLButtonElement>(null);
  const noteSuggestionDialog = useRef<HTMLDialogElement>(null);
  const lifecycleButton = useRef<HTMLButtonElement>(null);
  const editTabButton = useRef<HTMLButtonElement>(null);
  const testTabButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = noteSuggestionDialog.current;
    if (noteSuggestion && dialog && !dialog.open) dialog.showModal();
  }, [noteSuggestion]);
  const selection = state.ui.selection;
  if (selection.kind !== "agent") return null;
  const specialty = state.specialties.find(
    (item) => item.id === selection.specialtyId,
  );
  const agent = state.agents.find((item) => item.id === selection.agentId);
  const saved = agent?.versions.find((item) => item.id === selection.versionId);
  if (!specialty || !agent || !saved)
    return (
      <section className="workspace-placeholder">
        <h2>Agent unavailable</h2>
        <p>Select another agent.</p>
      </section>
    );
  const version = state.workingCopies.versions[saved.id] ?? saved;
  const visibleSpecialty =
    state.workingCopies.specialties[specialty.id] ?? specialty;
  const dirty = !!state.workingCopies.versions[saved.id];
  const editable = version.status === "draft";
  const selectSection = (section: typeof selection.section) =>
    update((draft) => {
      if (draft.ui.selection.kind === "agent") {
        draft.ui.selection.section = section;
        if (section !== "test")
          draft.ui.lastEditorSections[agent?.id ?? selection.agentId] = section;
      }
    });
  const selectTab = (tab: "edit" | "test") => {
    if (tab === "test") {
      update((draft) => {
        if (draft.ui.selection.kind !== "agent") return;
        if (draft.ui.selection.section !== "test")
          draft.ui.lastEditorSections[agent?.id ?? selection.agentId] =
            draft.ui.selection.section;
        draft.ui.selection.section = "test";
      });
      return;
    }
    const previous = state.ui.lastEditorSections[agent?.id ?? selection.agentId];
    const valid =
      previous?.startsWith("reference:")
        ? version.references.some((item) => item.id === previous.slice(10))
        : !!previous;
    selectSection(valid && previous ? previous : "instructions");
  };
  const setVersion = (patch: Partial<AgentVersion>) => {
    if (!editable) return;
    update((draft) => {
      draft.workingCopies.versions[saved.id] = {
        ...(draft.workingCopies.versions[saved.id] ?? saved),
        ...patch,
      };
    });
  };
  const setReferences = (references: ReferenceFile[]) =>
    setVersion({ references });
  const closeNoteSuggestion = () => {
    setNoteSuggestion(null);
    queueMicrotask(() => suggestNoteButton.current?.focus());
  };
  const save = () => {
    if (
      !version.title.trim() ||
      version.references.some((ref) => !ref.name.trim())
    )
      return;
    update((draft) => {
      const working = draft.workingCopies.versions[saved.id];
      const target = draft.agents.find((item) => item.id === agent.id);
      const firstImage = draft.models.find((item) => item.kind === "image");
      if (working && target)
        target.versions = target.versions.map((item) =>
          item.id === saved.id
            ? {
                ...working,
                imageModel:
                  specialty.outputType === "image" &&
                  !working.imageModel &&
                  firstImage
                    ? { provider: firstImage.provider, model: firstImage.label }
                    : working.imageModel,
                title: working.title.trim(),
                references: working.references.map((ref) => ({
                  ...ref,
                  name: ref.name.trim(),
                })),
              }
            : item,
        );
      delete draft.workingCopies.versions[saved.id];
    });
    announce("Agent draft saved.");
  };
  const discard = () => {
    update((draft) => {
      delete draft.workingCopies.versions[saved.id];
    });
    announce("Agent changes discarded.");
  };
  const fork = () =>
    update((draft) => {
      const target = draft.agents.find((item) => item.id === agent.id)!;
      const source =
        draft.workingCopies.versions[saved.id] ??
        target.versions.find((item) => item.id === saved.id)!;
      const copy = structuredClone(source);
      copy.id = uid("version");
      copy.number = Math.max(...target.versions.map((item) => item.number)) + 1;
      copy.parentVersionId = saved.id;
      copy.status = "draft";
      copy.versionNote = "";
      target.versions.push(copy);
      draft.ui.recentVersionIds = {
        ...draft.ui.recentVersionIds,
        [agent.id]: copy.id,
      };
      draft.ui.selection = { ...selection, versionId: copy.id };
    });
  const transition = (status: "confirmed" | "retired") => {
    if (dirty) {
      announce("Save or discard changes first.");
      return;
    }
    update((draft) => {
      const target = draft.agents.find((item) => item.id === agent.id)!;
      const item = target.versions.find(
        (candidate) => candidate.id === saved.id,
      )!;
      item.status = status;
    });
    announce(status === "confirmed" ? "Draft confirmed." : "Version retired.");
  };
  const activate = () => {
    if (dirty) {
      announce("Save or discard changes first.");
      return;
    }
    update((draft) => {
      draft.agents.find((item) => item.id === agent.id)!.activeVersionId =
        saved.id;
    });
    announce("Agent version activated.");
  };
  const deactivate = () =>
    update((draft) => {
      draft.agents.find((item) => item.id === agent.id)!.activeVersionId = null;
    });
  const removeVersion = () => {
    if (!confirm("Delete this inactive draft?")) return;
    update((draft) => {
      const target = draft.agents.find((item) => item.id === agent.id)!;
      draft.chat.proposals.forEach((proposal) => {
        if (
          proposal.target.kind === "agent" &&
          proposal.target.agentId === agent.id &&
          proposal.target.versionId === saved.id &&
          proposal.status === "pending"
        )
          proposal.status = "unavailable";
      });
      if (
        draft.chat.pendingResponse?.target.kind === "agent" &&
        draft.chat.pendingResponse?.target.agentId === agent.id &&
        draft.chat.pendingResponse.target.versionId === saved.id
      )
        draft.chat.pendingResponse = null;
      target.versions = target.versions.filter((item) => item.id !== saved.id);
      delete draft.workingCopies.versions[saved.id];
      if (!target.versions.length) {
        draft.agents = draft.agents.filter((item) => item.id !== target.id);
        draft.ui.selection = { kind: "specialty", specialtyId: specialty.id };
        return;
      }
      const next =
        target.versions.find((item) => item.id === target.activeVersionId) ??
        newest(target.versions)!;
      draft.ui.selection = {
        ...selection,
        versionId: next.id,
        section: "configuration",
      };
    });
    announce("Draft deleted; related chat proposals are unavailable.");
  };
  const addReference = () => {
    const used = new Set(version.references.map((ref) => ref.name));
    let number = 1;
    while (used.has(`reference-${number}.md`)) number++;
    const ref = {
      id: uid("reference"),
      name: `reference-${number}.md`,
      description: "",
      content: "",
    };
    if (!editable) {
      update((draft) => {
        const target = draft.agents.find((item) => item.id === agent.id)!;
        const source =
          draft.workingCopies.versions[saved.id] ??
          target.versions.find((item) => item.id === saved.id)!;
        const copy = structuredClone(source);
        copy.id = uid("version");
        copy.number =
          Math.max(...target.versions.map((item) => item.number)) + 1;
        copy.parentVersionId = saved.id;
        copy.status = "draft";
        copy.versionNote = "";
        copy.references.push(ref);
        target.versions.push(copy);
        draft.ui.recentVersionIds[agent.id] = copy.id;
        draft.ui.selection = {
          kind: "agent",
          specialtyId: specialty.id,
          agentId: agent.id,
          versionId: copy.id,
          section: `reference:${ref.id}`,
        };
      });
      announce("Draft created with a new reference.");
      return;
    }
    setReferences([...version.references, ref]);
    selectSection(`reference:${ref.id}`);
  };
  const referenceId = selection.section.startsWith("reference:")
    ? selection.section.slice(10)
    : null;
  const reference = version.references.find((item) => item.id === referenceId);
  const languageProviders = [
    ...new Set(
      state.models
        .filter((item) => item.kind === "language")
        .map((item) => item.provider),
    ),
  ];
  const imageProviders = [
    ...new Set(
      state.models
        .filter((item) => item.kind === "image")
        .map((item) => item.provider),
    ),
  ];
  const setModel = (
    kind: "language" | "image",
    provider: string,
    model?: string,
  ) => {
    const options = state.models.filter(
      (item) => item.kind === kind && item.provider === provider,
    );
    const value = { provider, model: model ?? options[0]!.label };
    setVersion(
      kind === "language" ? { languageModel: value } : { imageModel: value },
    );
  };
  const setEditorMode = (mode: "edit" | "preview") =>
    update((draft) => {
      draft.ui.editorMode = mode;
    });
  const openSpecialty = (specialtyId: string) =>
    update((draft) => {
      draft.ui.selection = { kind: "specialty", specialtyId };
    });
  const openReference = (id: string) => selectSection(`reference:${id}`);
  const markdownProps = {
    disabled: !editable,
    mode: state.ui.editorMode,
    specialties: state.specialties,
    tools: state.tools.filter((tool) =>
      specialty.allowedToolIds.includes(tool.id),
    ),
    references: version.references,
    onModeChange: setEditorMode,
    onOpenSpecialty: openSpecialty,
    onOpenReference: openReference,
  };
  const lifecycleControls = (
    <>
      {!editable ? (
        <button className="primary" onClick={fork}>Edit as draft</button>
      ) : null}
      <div className="lifecycle-menu">
        <button
          ref={lifecycleButton}
          aria-haspopup="menu"
          aria-expanded={lifecycleOpen}
          onClick={() => {
            const opening = !lifecycleOpen;
            setLifecycleOpen(opening);
            if (opening)
              queueMicrotask(() =>
                lifecycleButton.current?.parentElement
                  ?.querySelector<HTMLButtonElement>("[role='menuitem']")
                  ?.focus(),
              );
          }}
        >
          <MoreHorizontal size={15} /> Version actions
        </button>
        {lifecycleOpen ? (
          <div
            role="menu"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("[role='menuitem']"))
                setLifecycleOpen(false);
            }}
            onKeyDown={(event) => {
              const items = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "[role='menuitem']:not(:disabled)",
                ),
              ];
              const index = items.indexOf(document.activeElement as HTMLButtonElement);
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setLifecycleOpen(false);
                lifecycleButton.current?.focus();
              } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const delta = event.key === "ArrowDown" ? 1 : -1;
                items[(index + delta + items.length) % items.length]?.focus();
              }
            }}
          >
            {editable ? <button role="menuitem" onClick={fork}>Fork draft</button> : null}
            {editable ? (
              <button role="menuitem" disabled={dirty} onClick={() => transition("confirmed")}>
                Confirm · Lock this version
              </button>
            ) : null}
            {editable && dirty ? <small>Save or discard before locking this version.</small> : null}
            {editable ? (
              <button role="menuitem" disabled={agent.activeVersionId === version.id} onClick={removeVersion}>Delete draft</button>
            ) : null}
            {version.status === "confirmed" ? (
              agent.activeVersionId === version.id ? (
                <button role="menuitem" onClick={deactivate}>Deactivate</button>
              ) : (
                <button role="menuitem" onClick={activate}>Activate · Make available for selection</button>
              )
            ) : null}
            {version.status === "confirmed" ? (
              <button role="menuitem" disabled={dirty || agent.activeVersionId === version.id} onClick={() => transition("retired")}>Retire</button>
            ) : null}
            {version.status === "confirmed" && agent.activeVersionId === version.id ? (
              <small>Deactivate before retiring this version.</small>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
  return (
    <section className="agent-workspace">
      <header className="entity-header">
        <div>
          <p>{specialty.name} · Agent</p>
          <h2>{version.title || "Untitled agent"}</h2>
          <span>
            {dirty
              ? "Unsaved changes · retained in this browser"
              : `${version.status} · ${agent.activeVersionId === version.id ? "Active" : "Not active"}`}
          </span>
          <p className="version-note-summary">
            {version.versionNote || "No version note"}
          </p>
        </div>
        <div className="agent-header-controls">
          <div className="agent-tabs" role="tablist" aria-label="Agent workspace">
            <button
              id="agent-edit-tab"
              ref={editTabButton}
              role="tab"
              aria-selected={selection.section !== "test"}
              aria-controls="agent-edit-panel"
              tabIndex={selection.section !== "test" ? 0 : -1}
              onClick={() => selectTab("edit")}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "End") {
                  event.preventDefault();
                  selectTab("test");
                  testTabButton.current?.focus();
                }
              }}
            >
              Edit
            </button>
            <button
              id="agent-test-tab"
              ref={testTabButton}
              role="tab"
              aria-selected={selection.section === "test"}
              aria-controls="agent-test-panel"
              tabIndex={selection.section === "test" ? 0 : -1}
              onClick={() => selectTab("test")}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "Home") {
                  event.preventDefault();
                  selectTab("edit");
                  editTabButton.current?.focus();
                }
              }}
            >
              Test
            </button>
          </div>
          <div className="header-actions">
          <button
            className="toolbar-icon-button"
            aria-label={state.ui.focusMode ? "Exit focus mode" : "Enter focus mode"}
            title={state.ui.focusMode ? "Exit focus mode" : "Enter focus mode"}
            onClick={() =>
              update((draft) => {
                draft.ui.focusMode = !draft.ui.focusMode;
              })
            }
          >
            {state.ui.focusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <label>
            Version{" "}
            <select
              value={version.id}
              onChange={(event) =>
                update((draft) => {
                  if (draft.ui.selection.kind === "agent") {
                    draft.ui.recentVersionIds = {
                      ...draft.ui.recentVersionIds,
                      [agent.id]: event.target.value,
                    };
                    draft.ui.selection.versionId = event.target.value;
                    draft.ui.selection.section = "configuration";
                  }
                })
              }
            >
              {agent.versions
                .toSorted((a, b) => b.number - a.number)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    v{item.number} · {item.status}
                    {item.versionNote ? ` · ${item.versionNote}` : ""}
                  </option>
                ))}
            </select>
          </label>
          {dirty ? (
            <>
              <button onClick={discard}>Discard</button>
              <button
                className="primary"
                disabled={
                  !version.title.trim() ||
                  version.references.some((ref) => !ref.name.trim())
                }
                onClick={save}
              >
                Save changes
              </button>
            </>
          ) : null}
          {lifecycleControls}
          </div>
        </div>
      </header>
      <div
        id={selection.section === "test" ? "agent-test-panel" : "agent-edit-panel"}
        role="tabpanel"
        aria-labelledby={selection.section === "test" ? "agent-test-tab" : "agent-edit-tab"}
        className={`agent-body ${selection.section === "test" ? "test-mode" : ""}`}
        style={{
          gridTemplateColumns: selection.section === "test"
            ? "minmax(360px,1fr)"
            : state.ui.focusMode
            ? "minmax(360px,1fr)"
            : `${state.ui.sectionWidth}px 7px minmax(360px,1fr)`,
        }}
      >
        {!state.ui.focusMode && selection.section !== "test" ? (
        <nav className="section-nav" aria-label="Agent sections">
          <button
            className={selection.section === "configuration" ? "selected" : ""}
            aria-current={selection.section === "configuration" ? "page" : undefined}
            onClick={() => selectSection("configuration")}
          >
            <Settings2 size={15} /> Configuration
          </button>
          <button
            className={selection.section === "instructions" ? "selected" : ""}
            aria-current={selection.section === "instructions" ? "page" : undefined}
            onClick={() => selectSection("instructions")}
          >
            <FileText size={15} /> Main instructions
          </button>
          <div className="reference-heading">
            <strong>References</strong>
            <button aria-label="Add reference" onClick={addReference}>
              <Plus size={15} />
            </button>
          </div>
          {version.references.map((ref) => (
            <button
              key={ref.id}
              className={referenceId === ref.id ? "selected" : ""}
              aria-current={referenceId === ref.id ? "page" : undefined}
              onClick={() => selectSection(`reference:${ref.id}`)}
            >
              {ref.name}
            </button>
          ))}
        </nav>
        ) : null}
        {!state.ui.focusMode && selection.section !== "test" ? (
        <div
          className="resize-handle"
          role="separator"
          aria-label="Resize agent sections"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight")
              update((draft) => {
                draft.ui.sectionWidth = Math.max(
                  150,
                  Math.min(
                    240,
                    draft.ui.sectionWidth +
                      (event.key === "ArrowLeft" ? -16 : 16),
                  ),
                );
              });
          }}
        />
        ) : null}
        <div className={selection.section === "test" ? "agent-editor test-space" : "agent-editor"}>
          {selection.section === "test" ? (
            <AgentTestWorkspace
              agentId={agent.id}
              state={state}
              update={update}
              announce={announce}
            />
          ) : selection.section === "configuration" ? (
            <div className="form-grid">
              <label>
                Title
                <input
                  name="agent-title"
                  autoComplete="off"
                  disabled={!editable}
                  value={version.title}
                  onChange={(event) =>
                    setVersion({ title: event.target.value })
                  }
                />
                {!version.title.trim() ? (
                  <small className="error">Enter a title.</small>
                ) : null}
              </label>
              <label>
                Version note
                <small>Optional · {version.versionNote.length}/240</small>
                <textarea
                  aria-label="Version note"
                  disabled={!editable}
                  maxLength={240}
                  value={version.versionNote}
                  onChange={(event) =>
                    setVersion({ versionNote: event.target.value })
                  }
                />
                {editable ? (
                  <button
                    ref={suggestNoteButton}
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      setNoteSuggestion({
                        versionId: version.id,
                        text: suggestVersionNote(agent, version),
                      })
                    }
                  >
                    Suggest note
                  </button>
                ) : null}
              </label>
              <section
                className="allowed-tools-summary"
                aria-label="Allowed tools summary"
              >
                <div>
                  <strong>Allowed tools</strong>
                  <small>
                    {state.workingCopies.specialties[specialty.id]
                      ? "Unsaved specialty values"
                      : "From specialty"}
                  </small>
                </div>
                <p>
                  {visibleSpecialty.allowedToolIds.length
                    ? visibleSpecialty.allowedToolIds
                        .map(
                          (id) =>
                            state.tools.find((tool) => tool.id === id)?.name ??
                            id,
                        )
                        .join(", ")
                    : "No tools allowed"}
                </p>
                <button
                  type="button"
                  onClick={() => openSpecialty(specialty.id)}
                >
                  Edit specialty tools
                </button>
              </section>
              <fieldset disabled={!editable}>
                <legend>
                  Language model <small>Demo catalog</small>
                </legend>
                <div className="model-grid">
                  <label>
                    Provider
                    <select
                      value={version.languageModel.provider}
                      onChange={(event) =>
                        setModel("language", event.target.value)
                      }
                    >
                      {languageProviders.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Model
                    <select
                      value={version.languageModel.model}
                      onChange={(event) =>
                        setModel(
                          "language",
                          version.languageModel.provider,
                          event.target.value,
                        )
                      }
                    >
                      {state.models
                        .filter(
                          (item) =>
                            item.kind === "language" &&
                            item.provider === version.languageModel.provider,
                        )
                        .map((item) => (
                          <option key={item.id}>{item.label}</option>
                        ))}
                    </select>
                  </label>
                </div>
              </fieldset>
              {specialty.outputType === "image" ? (
                <>
                  <fieldset disabled={!editable}>
                    <legend>
                      Image model <small>Demo catalog</small>
                    </legend>
                    <div className="model-grid">
                      <label>
                        Provider
                        <select
                          value={
                            (
                              version.imageModel ?? {
                                provider: imageProviders[0],
                              }
                            ).provider
                          }
                          onChange={(event) =>
                            setModel("image", event.target.value)
                          }
                        >
                          {imageProviders.map((item) => (
                            <option key={item}>{item}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Model
                        <select
                          value={
                            (
                              version.imageModel ?? {
                                model: state.models.find(
                                  (item) => item.kind === "image",
                                )!.label,
                              }
                            ).model
                          }
                          onChange={(event) =>
                            setModel(
                              "image",
                              (
                                version.imageModel ?? {
                                  provider: imageProviders[0],
                                }
                              ).provider,
                              event.target.value,
                            )
                          }
                        >
                          {state.models
                            .filter(
                              (item) =>
                                item.kind === "image" &&
                                item.provider ===
                                  (
                                    version.imageModel ?? {
                                      provider: imageProviders[0],
                                    }
                                  ).provider,
                            )
                            .map((item) => (
                              <option key={item.id}>{item.label}</option>
                            ))}
                        </select>
                      </label>
                    </div>
                  </fieldset>
                  <button
                    type="button"
                    className="sample-result-button"
                    onClick={() => setSampleOpen(true)}
                  >
                    Preview sample result
                  </button>
                </>
              ) : null}
            </div>
          ) : selection.section === "instructions" ? (
            <div className="text-editor">
              <h3>Main instructions</h3>
              <MarkdownEditor
                {...markdownProps}
                label="Main instructions"
                value={version.mainInstructions}
                onChange={(mainInstructions) =>
                  setVersion({ mainInstructions })
                }
              />
            </div>
          ) : reference ? (
            <div className="text-editor">
              <div className="reference-fields">
                <label>
                  Name
                  <input
                    name="reference-name"
                    autoComplete="off"
                    disabled={!editable}
                    value={reference.name}
                    onChange={(event) =>
                      setReferences(
                        version.references.map((item) =>
                          item.id === reference.id
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  {!reference.name.trim() ? (
                    <small className="error">Enter a name.</small>
                  ) : null}
                </label>
                <label>
                  Description
                  <input
                    name="reference-description"
                    autoComplete="off"
                    disabled={!editable}
                    value={reference.description}
                    onChange={(event) =>
                      setReferences(
                        version.references.map((item) =>
                          item.id === reference.id
                            ? { ...item, description: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
              </div>
              <MarkdownEditor
                {...markdownProps}
                label="Reference content"
                currentReferenceId={reference.id}
                value={reference.content}
                onChange={(content) =>
                  setReferences(
                    version.references.map((item) =>
                      item.id === reference.id ? { ...item, content } : item,
                    ),
                  )
                }
              />
              {editable ? (
                <button
                  className="danger-button"
                  onClick={() => {
                    if (confirm("Remove this reference?")) {
                      setReferences(
                        version.references.filter(
                          (item) => item.id !== reference.id,
                        ),
                      );
                      update((draft) => {
                        const section = `reference:${reference.id}`;
                        draft.chat.proposals.forEach((proposal) => {
                          if (
                            proposal.target.kind === "agent" &&
                            proposal.target.agentId === agent.id &&
                            proposal.target.versionId === saved.id &&
                            proposal.target.section === section &&
                            proposal.status === "pending"
                          )
                            proposal.status = "unavailable";
                        });
                        if (
                          draft.chat.pendingResponse?.target.kind === "agent" &&
                          draft.chat.pendingResponse?.target.agentId ===
                            agent.id &&
                          draft.chat.pendingResponse.target.versionId ===
                            saved.id &&
                          draft.chat.pendingResponse.target.section === section
                        )
                          draft.chat.pendingResponse = null;
                      });
                      announce(
                        "Reference removed; related chat proposals are unavailable.",
                      );
                      selectSection("instructions");
                    }
                  }}
                >
                  <Trash2 size={15} /> Remove reference
                </button>
              ) : null}
            </div>
          ) : (
            <p>Select an agent section.</p>
          )}
        </div>
      </div>
      <SampleResultDialog
        open={sampleOpen}
        description={state.ui.imageDescriptions[version.id] ?? ""}
        onDescriptionChange={(value) =>
          update((draft) => {
            draft.ui.imageDescriptions[version.id] = value;
          })
        }
        onClose={() => setSampleOpen(false)}
      />
      {noteSuggestion?.versionId === version.id ? (
        <dialog
          ref={noteSuggestionDialog}
          aria-modal="true"
          aria-labelledby="version-note-suggestion-title"
          className="note-suggestion-dialog"
          onCancel={(event) => {
            event.preventDefault();
            closeNoteSuggestion();
          }}
        >
          <p>Simulated suggestion</p>
          <h3 id="version-note-suggestion-title">Suggested version note</h3>
          <p>{noteSuggestion.text}</p>
          <div>
            <button autoFocus onClick={closeNoteSuggestion}>Cancel</button>
            <button
              className="primary"
              onClick={() => {
                setVersion({ versionNote: noteSuggestion.text });
                closeNoteSuggestion();
              }}
            >
              Use suggestion
            </button>
          </div>
        </dialog>
      ) : null}
    </section>
  );
}
