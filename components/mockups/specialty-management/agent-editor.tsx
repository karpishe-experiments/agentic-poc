"use client";
import { useEffect, useRef, useState } from "react";
import { FileText, Info, Maximize2, Minimize2, MoreHorizontal, Plus, Settings2, Trash2 } from "lucide-react";
import { MarkdownEditor } from "./markdown-editor";
import { SampleResultDialog } from "./sample-result-dialog";
import { suggestVersionNote } from "@/lib/mockups/specialty-management/version-notes";
import type {
  AgentVersion,
  MockupState,
  ReferenceFile,
  Selection,
} from "@/lib/mockups/specialty-management/types";

type Update = (fn: (draft: MockupState) => void) => void;
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const newest = (versions: AgentVersion[]) =>
  versions.toSorted((a, b) => b.number - a.number)[0];

export function AgentEditor({
  state,
  update,
  announce,
  select,
}: {
  state: MockupState;
  update: Update;
  announce(message: string): void;
  select(selection: Selection, history?: "push" | "replace"): void;
}) {
  const [sampleOpen, setSampleOpen] = useState(false);
  const [confirmNote, setConfirmNote] = useState<string | null>(null);
  const [suggestedNote, setSuggestedNote] = useState<string | null>(null);
  const [lifecycleOpen, setLifecycleOpen] = useState(false);
  const confirmationDialog = useRef<HTMLDialogElement>(null);
  const confirmationSubmitting = useRef(false);
  const versionNoteDetails = useRef<HTMLDetailsElement>(null);
  const lifecycleButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = confirmationDialog.current;
    if (confirmNote !== null && dialog && !dialog.open) dialog.showModal();
  }, [confirmNote]);
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
    select({ ...selection, section });
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
  const closeConfirmation = () => {
    if (confirmationDialog.current?.open) confirmationDialog.current.close();
    confirmationSubmitting.current = false;
    setConfirmNote(null);
    setSuggestedNote(null);
    queueMicrotask(() => lifecycleButton.current?.focus());
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
                description: working.description.trim(),
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
    const discardedReference =
      selection.section.startsWith("reference:") &&
      !saved.references.some((reference) => reference.id === selection.section.slice(10));
    update((draft) => {
      delete draft.workingCopies.versions[saved.id];
    });
    if (discardedReference)
      select({ ...selection, section: "configuration" }, "replace");
    announce("Agent changes discarded.");
  };
  const saveAndConfirm = () => {
    if (
      confirmationSubmitting.current ||
      confirmNote === null ||
      confirmNote.length > 240 ||
      !version.title.trim() ||
      version.references.some((ref) => !ref.name.trim())
    )
      return;
    confirmationSubmitting.current = true;
    update((draft) => {
      const target = draft.agents.find((item) => item.id === agent.id);
      if (!target) return;
      const visible =
        draft.workingCopies.versions[saved.id] ??
        target.versions.find((item) => item.id === saved.id);
      if (!visible || visible.status !== "draft") return;
      const firstImage = draft.models.find((item) => item.kind === "image");
      const confirmed: AgentVersion = {
        ...structuredClone(visible),
        title: visible.title.trim(),
        description: visible.description.trim(),
        versionNote: confirmNote.trim(),
        status: "confirmed",
        imageModel:
          specialty.outputType === "image" && !visible.imageModel && firstImage
            ? { provider: firstImage.provider, model: firstImage.label }
            : visible.imageModel,
        references: visible.references.map((ref) => ({
          ...ref,
          name: ref.name.trim(),
        })),
      };
      target.versions = target.versions.map((item) =>
        item.id === saved.id ? confirmed : item,
      );
      delete draft.workingCopies.versions[saved.id];
    });
    closeConfirmation();
    announce("Draft saved and confirmed.");
  };
  const fork = () => {
    const copyId = uid("version");
    update((draft) => {
      const target = draft.agents.find((item) => item.id === agent.id)!;
      const source =
        draft.workingCopies.versions[saved.id] ??
        target.versions.find((item) => item.id === saved.id)!;
      const copy = structuredClone(source);
      copy.id = copyId;
      copy.number = Math.max(...target.versions.map((item) => item.number)) + 1;
      copy.parentVersionId = saved.id;
      copy.status = "draft";
      copy.versionNote = "";
      target.versions.push(copy);
      draft.ui.recentVersionIds = {
        ...draft.ui.recentVersionIds,
        [agent.id]: copy.id,
      };
    });
    select({ ...selection, versionId: copyId });
  };
  const transition = (status: "retired") => {
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
    announce("Version retired.");
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
    const remaining = agent.versions.filter((item) => item.id !== saved.id);
    const nextSelection: Selection = !remaining.length
      ? { kind: "specialty", specialtyId: specialty.id } as Selection
      : { ...selection, versionId: (remaining.find((item) => item.id === agent.activeVersionId) ?? newest(remaining)!).id, section: "configuration" };
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
        return;
      }
    });
    select(nextSelection, "replace");
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
      const copyId = uid("version");
      update((draft) => {
        const target = draft.agents.find((item) => item.id === agent.id)!;
        const source =
          draft.workingCopies.versions[saved.id] ??
          target.versions.find((item) => item.id === saved.id)!;
        const copy = structuredClone(source);
        copy.id = copyId;
        copy.number =
          Math.max(...target.versions.map((item) => item.number)) + 1;
        copy.parentVersionId = saved.id;
        copy.status = "draft";
        copy.versionNote = "";
        copy.references.push(ref);
        target.versions.push(copy);
        draft.ui.recentVersionIds[agent.id] = copy.id;
      });
      select({ kind: "agent", specialtyId: specialty.id, agentId: agent.id, versionId: copyId, section: `reference:${ref.id}` });
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
  const openSpecialty = (specialtyId: string) => select({ kind: "specialty", specialtyId });
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
              <button
                role="menuitem"
                onClick={() => {
                  setSuggestedNote(null);
                  setConfirmNote(version.versionNote);
                }}
              >
                Confirm · Lock this version
              </button>
            ) : null}
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
        </div>
        <div className="agent-header-controls">
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
          <div className="version-control">
          <label>
            Version{" "}
            <select
              value={version.id}
              onChange={(event) =>
                select({ ...selection, versionId: event.target.value, section: "configuration" })
              }
            >
              {agent.versions
                .toSorted((a, b) => b.number - a.number)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    v{item.number} · {item.status}
                  </option>
                ))}
            </select>
          </label>
          <details
            ref={versionNoteDetails}
            className="version-note-details"
            onKeyDown={(event) => {
              if (event.key === "Escape" && event.currentTarget.open) {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.open = false;
                event.currentTarget.querySelector<HTMLElement>("summary")?.focus();
              }
            }}
          >
            <summary aria-label="Show version note" title="Show version note">
              <Info size={15} />
            </summary>
            <div className="version-note-popover">
              <strong>Version note</strong>
              <p>{version.versionNote || "No version note."}</p>
            </div>
          </details>
          </div>
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
      <div className="agent-body"
        style={{
          gridTemplateColumns: state.ui.focusMode
            ? "minmax(360px,1fr)"
            : `${state.ui.sectionWidth}px 7px minmax(360px,1fr)`,
        }}
      >
        {!state.ui.focusMode ? (
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
        {!state.ui.focusMode ? (
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
        <div className="agent-editor">
          {selection.section === "configuration" ? (
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
                Description <small>Optional</small>
                <textarea
                  name="agent-description"
                  autoComplete="off"
                  disabled={!editable}
                  value={version.description}
                  onChange={(event) =>
                    setVersion({ description: event.target.value })
                  }
                />
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
                      selectSection("configuration");
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
      {confirmNote !== null ? (
        <dialog
          ref={confirmationDialog}
          aria-modal="true"
          aria-labelledby="confirm-version-title"
          className="confirmation-dialog"
          onCancel={(event) => {
            event.preventDefault();
            closeConfirmation();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            const items = [
              ...event.currentTarget.querySelectorAll<HTMLElement>(
                "textarea, button:not(:disabled)",
              ),
            ];
            if (!items.length) return;
            const first = items[0]!;
            const last = items.at(-1)!;
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (
              !event.shiftKey &&
              document.activeElement === last
            ) {
              event.preventDefault();
              first.focus();
            }
          }}
        >
          <h3 id="confirm-version-title">Save and confirm v{version.number}</h3>
          <p>Save all visible draft changes and lock this version. Activation remains separate.</p>
          <label>
            Notes <small>Optional · {confirmNote.length}/240</small>
            <textarea
              autoFocus
              aria-label="Confirmation notes"
              maxLength={240}
              value={confirmNote}
              onChange={(event) => setConfirmNote(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setSuggestedNote(suggestVersionNote(agent, version))}
          >
            Suggest note
          </button>
          {suggestedNote !== null ? (
            <section className="note-suggestion-preview" aria-label="Simulated note suggestion">
              <p>Simulated suggestion</p>
              <p>{suggestedNote}</p>
              <button type="button" onClick={() => setConfirmNote(suggestedNote)}>
                Use suggestion
              </button>
            </section>
          ) : null}
          <div className="dialog-actions">
            <button type="button" onClick={closeConfirmation}>Cancel</button>
            <button
              type="button"
              className="primary"
              disabled={
                confirmNote.length > 240 ||
                !version.title.trim() ||
                version.references.some((ref) => !ref.name.trim())
              }
              onClick={saveAndConfirm}
            >
              Save and confirm
            </button>
          </div>
        </dialog>
      ) : null}
    </section>
  );
}
