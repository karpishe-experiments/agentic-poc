"use client";

import { useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AtSign, BookOpen, Wrench } from "lucide-react";
import Image from "next/image";
import {
  insertMention,
  mentionQuery,
  resolveMention,
  safeMarkdownUrl,
  SAMPLE_IMAGE_PATH,
  type MentionTrigger,
} from "@/lib/mockups/specialty-management/mentions";
import type {
  ReferenceFile,
  Specialty,
  ToolFixture,
} from "@/lib/mockups/specialty-management/types";

type Item = { id: string; label: string; description: string; href: string };
type Mode = "edit" | "preview";

export function MarkdownEditor({
  label,
  value,
  disabled,
  mode,
  specialties,
  tools,
  references,
  currentReferenceId,
  onChange,
  onModeChange,
  onOpenSpecialty,
  onOpenReference,
}: {
  label: string;
  value: string;
  disabled: boolean;
  mode: Mode;
  specialties: Specialty[];
  tools: ToolFixture[];
  references: ReferenceFile[];
  currentReferenceId?: string;
  onChange(value: string): void;
  onModeChange(mode: Mode): void;
  onOpenSpecialty(id: string): void;
  onOpenReference(id: string): void;
}) {
  const [menu, setMenu] = useState<{
    trigger: MentionTrigger;
    start: number;
    cursor: number;
    query: string;
  } | null>(null);
  const [active, setActive] = useState(0);
  const [toolDetails, setToolDetails] = useState<ToolFixture | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const lastCursor = useRef(0);
  const items: Item[] =
    menu?.trigger === "@"
      ? specialties
          .filter((item) => !item.retired)
          .map((item) => ({
            id: item.id,
            label: `@${item.name}`,
            description: item.description,
            href: `specialty:${item.id}`,
          }))
      : menu?.trigger === "/"
        ? tools.map((item) => ({
            id: item.id,
            label: `/${item.name}`,
            description: item.description,
            href: `tool:${item.id}`,
          }))
        : references
            .filter((item) => item.id !== currentReferenceId)
            .map((item) => ({
              id: item.id,
              label: `$${item.name}`,
              description: item.description,
              href: `reference:${item.id}`,
            }));
  const filtered = items.filter(
    (item) =>
      !menu?.query ||
      item.label.toLowerCase().includes(menu.query.toLowerCase()),
  );
  const openMenu = (trigger: MentionTrigger) => {
    if (disabled) return;
    const cursor = textarea.current?.selectionStart ?? lastCursor.current;
    onModeChange("edit");
    setMenu({ trigger, start: cursor, cursor, query: "" });
    setActive(0);
    queueMicrotask(() => textarea.current?.focus());
  };
  const choose = (item: Item) => {
    if (!menu) return;
    const result = insertMention(
      value,
      menu.start,
      menu.cursor,
      item.label,
      item.href,
    );
    onChange(result.text);
    setMenu(null);
    lastCursor.current = result.cursor;
    queueMicrotask(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(result.cursor, result.cursor);
    });
  };
  return (
    <div className="markdown-editor">
      <div className="editor-toolbar">
        <div className="mode-tabs">
          <button
            type="button"
            className={mode === "edit" ? "active" : ""}
            onClick={() => onModeChange("edit")}
          >
            Edit
          </button>
          <button
            type="button"
            className={mode === "preview" ? "active" : ""}
            onClick={() => {
              setMenu(null);
              onModeChange("preview");
            }}
          >
            Preview
          </button>
        </div>
        <div className="mention-tools">
          <button
            type="button"
            disabled={disabled}
            title="Mention specialty"
            aria-label="Mention specialty"
            onClick={() => openMenu("@")}
          >
            <AtSign size={15} />
          </button>
          <button
            type="button"
            disabled={disabled}
            title="Mention tool"
            aria-label="Mention tool"
            onClick={() => openMenu("/")}
          >
            <Wrench size={15} />
          </button>
          <button
            type="button"
            disabled={disabled}
            title="Mention reference"
            aria-label="Mention reference"
            onClick={() => openMenu("$")}
          >
            <BookOpen size={15} />
          </button>
        </div>
      </div>
      {menu ? (
        <div
          className="mention-menu"
          role="listbox"
          aria-label={`${menu.trigger} suggestions`}
        >
          {filtered.length ? (
            filtered.map((item, index) => (
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                key={item.id}
                className={index === active ? "active" : ""}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(item)}
              >
                {item.label}
                <small>{item.description || "No description"}</small>
              </button>
            ))
          ) : (
            <p>No available choices.</p>
          )}
        </div>
      ) : null}
      {mode === "edit" ? (
        <label className="editor-textarea">
          <span className="sr-only">{label}</span>
          <textarea
            ref={textarea}
            aria-label={label}
            name={label.toLowerCase().replaceAll(" ", "-")}
            autoComplete="off"
            disabled={disabled}
            value={value}
            onSelect={(event) => {
              lastCursor.current = event.currentTarget.selectionStart;
            }}
            onChange={(event) => {
              const cursor = event.currentTarget.selectionStart;
              lastCursor.current = cursor;
              onChange(event.target.value);
              const next = mentionQuery(event.target.value, cursor);
              setMenu(next ? { ...next, cursor } : null);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (!menu) return;
              if (event.key === "Escape") {
                event.preventDefault();
                setMenu(null);
              } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setActive((current) =>
                  Math.max(
                    0,
                    Math.min(
                      filtered.length - 1,
                      current + (event.key === "ArrowDown" ? 1 : -1),
                    ),
                  ),
                );
              } else if (event.key === "Enter" && filtered[active]) {
                event.preventDefault();
                choose(filtered[active]);
              }
            }}
          />
        </label>
      ) : (
        <div className="markdown-preview">
          <Markdown
            remarkPlugins={[remarkGfm]}
            urlTransform={safeMarkdownUrl}
            components={{
              a: ({ href, children }) => {
                const mention = resolveMention(href, {
                  specialty: specialties.map((item) => item.id),
                  tool: tools.map((item) => item.id),
                  reference: references.map((item) => item.id),
                });
                if (!mention)
                  return (
                    <a href={href} rel="noreferrer">
                      {children}
                    </a>
                  );
                const { kind, id, available } = mention;
                return (
                  <button
                    type="button"
                    className={`mention-badge ${available ? "" : "unavailable"}`}
                    disabled={!available}
                    onClick={() => {
                      if (kind === "specialty") onOpenSpecialty(id);
                      if (kind === "reference") onOpenReference(id);
                      if (kind === "tool")
                        setToolDetails(
                          tools.find((item) => item.id === id) ?? null,
                        );
                    }}
                  >
                    {available ? children : `Unavailable ${kind}`}
                  </button>
                );
              },
              img: ({ alt, src }) => src === SAMPLE_IMAGE_PATH
                ? <Image src={SAMPLE_IMAGE_PATH} width={560} height={315} alt={alt || "Sample illustration"} />
                : <span className="image-placeholder">Image placeholder: {alt || "Untitled"}</span>,
            }}
          >
            {value || "_Nothing to preview yet._"}
          </Markdown>
          {toolDetails ? (
            <div className="tool-popover" role="status">
              <strong>/{toolDetails.name}</strong>
              <span>{toolDetails.description}</span>
              <button type="button" onClick={() => setToolDetails(null)}>
                Close
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
