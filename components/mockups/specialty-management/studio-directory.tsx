"use client";

import { Filter, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  Agent,
  AgentVersion,
  MockupState,
  Selection,
  Specialty,
} from "@/lib/mockups/specialty-management/types";

type Update = (fn: (draft: MockupState) => void) => void;

function displayedVersion(state: MockupState, agent: Agent): AgentVersion | null {
  const recent = state.ui.recentVersionIds[agent.id];
  return (
    agent.versions.find((version) => version.id === recent) ??
    agent.versions.find((version) => version.id === agent.activeVersionId) ??
    agent.versions.toSorted((a, b) => b.number - a.number)[0] ??
    null
  );
}

export function StudioDirectory({
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
  const groups = useMemo(
    () =>
      state.specialties
        .filter((specialty) => state.ui.showRetired || !specialty.retired)
        .map((specialty) => ({
          specialty,
          agents: state.agents.filter((agent) => agent.specialtyId === specialty.id),
        }))
        .filter(({ specialty, agents }) =>
          !needle ||
          specialty.name.toLowerCase().includes(needle) ||
          specialty.description.toLowerCase().includes(needle) ||
          agents.some((agent) =>
            agent.versions.some((version) =>
              `${version.title} ${version.description}`.toLowerCase().includes(needle),
            ),
          ),
        ),
    [needle, state],
  );

  return (
    <section className="studio-directory" aria-labelledby="directory-title">
      <header className="directory-header">
        <div>
          <p>Agent Studio</p>
          <h2 id="directory-title">Specialties and agents</h2>
          <span>Choose an entity to edit, or create a new one.</span>
        </div>
        <div className="directory-actions">
          <details className="filter-menu">
            <summary className="secondary-button" role="button">
              <Filter aria-hidden="true" size={15} /> Filter
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
              />
              Show retired
            </label>
          </details>
          <button className="primary-button" onClick={addSpecialty}>
            <Plus aria-hidden="true" size={15} /> Add specialty
          </button>
        </div>
      </header>
      <label className="directory-search search">
        <Search aria-hidden="true" size={15} />
        <span className="sr-only">Search specialties and agents</span>
        <input
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search specialties and agents…"
        />
      </label>
      <div className="directory-groups">
        {groups.map(({ specialty, agents }) => (
          <section className="directory-group" key={specialty.id}>
            <header>
              <div className="directory-specialty">
                <span>
                  <span className="directory-specialty-name">{specialty.name}</span>
                  {specialty.builtIn ? <small>Built-in</small> : null}
                  {specialty.retired ? <small>Retired</small> : null}
                </span>
                <span>{specialty.description || "No description"}</span>
              </div>
              <div className="directory-group-actions">
                <span className="output-badge">{specialty.outputType}</span>
                <button
                  className="icon-text-button"
                  aria-label={`Open ${specialty.name} settings`}
                  onClick={() => select({ kind: "specialty", specialtyId: specialty.id })}
                >
                  Open
                </button>
                <button
                  className="icon-text-button"
                  onClick={() => addAgent(specialty)}
                >
                  <Plus aria-hidden="true" size={14} /> Add agent
                </button>
              </div>
            </header>
            {agents.length ? (
              <div className="directory-agents">
                {agents.map((agent) => {
                  const version = displayedVersion(state, agent);
                  if (!version) return null;
                  return (
                    <button
                      key={agent.id}
                      className="directory-agent"
                      onClick={() =>
                        select({
                          kind: "agent",
                          specialtyId: specialty.id,
                          agentId: agent.id,
                          versionId: version.id,
                          section: "configuration",
                        })
                      }
                    >
                      <strong>{version.title}</strong>
                      <span>{version.description || "No description"}</span>
                      <small>
                        v{version.number} · {version.status}
                        {agent.activeVersionId === version.id ? " · Active" : ""}
                      </small>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="directory-empty">No agents yet.</p>
            )}
          </section>
        ))}
        {!groups.length ? <p className="directory-empty">No matching specialties or agents.</p> : null}
      </div>
    </section>
  );
}
