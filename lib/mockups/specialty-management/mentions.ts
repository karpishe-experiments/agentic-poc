export type MentionTrigger = "@" | "/" | "$";
export type MentionKind = "specialty" | "tool" | "reference";
export const SAMPLE_IMAGE_PATH = "/mockups/specialty-management/sample-image.svg";

export function safeMarkdownUrl(url: string) {
  return /^(specialty|tool|reference):/.test(url) || /^(https?:|mailto:)/.test(url) || url === SAMPLE_IMAGE_PATH ? url : "";
}

export function resolveMention(href: string | undefined, ids: Record<MentionKind, string[]>) {
  const match = href?.match(/^(specialty|tool|reference):(.+)$/);
  if (!match) return null;
  const kind = match[1] as MentionKind;
  const id = match[2]!;
  return { kind, id, available: ids[kind].includes(id) };
}
export function mentionQuery(
  text: string,
  cursor: number,
): { trigger: MentionTrigger; start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const match = before.match(/(?:^|\s)([@/$])([^\s@/$]*)$/);
  if (!match) return null;
  const trigger = match[1] as MentionTrigger;
  const start = cursor - match[2]!.length - 1;
  if (trigger === "/" && /https?:$/i.test(text.slice(0, start))) return null;
  return { trigger, start, query: match[2]! };
}
export function insertMention(
  text: string,
  start: number,
  cursor: number,
  label: string,
  href: string,
) {
  const inserted = `[${label}](${href}) `;
  return {
    text: text.slice(0, start) + inserted + text.slice(cursor),
    cursor: start + inserted.length,
  };
}
