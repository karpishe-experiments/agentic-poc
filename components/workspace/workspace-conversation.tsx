"use client";

import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CardRegistry } from "@/components/cards/card-registry";
import type { CardAction, GenUICard } from "@/lib/contracts/cards";
import type { BookletUIMessage } from "@/lib/contracts/messages";

type CardResponseBody = { data?: { summary: string; followupRequired: boolean; refreshRequired?: boolean }; error?: { message?: string } };

export function WorkspaceConversation({ bookletId, initialMessages }: Readonly<{ bookletId: string; initialMessages: BookletUIMessage[] }>) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [workingStatus, setWorkingStatus] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const [submittedCardIds, setSubmittedCardIds] = useState<Set<string>>(() => new Set());
  const [hasUnseenMessages, setHasUnseenMessages] = useState(false);
  const conversationRef = useRef<HTMLDivElement>(null);
  const hasMounted = useRef(false);
  const transport = useMemo(() => new DefaultChatTransport<BookletUIMessage>({
    api: `/api/chat/${bookletId}`,
    prepareSendMessagesRequest: ({ messages }) => ({ body: { message: messages.at(-1) } }),
  }), [bookletId]);
  const { messages, sendMessage, setMessages, status, error } = useChat<BookletUIMessage>({
    id: bookletId,
    messages: initialMessages,
    transport,
    onData: (dataPart) => {
      if (dataPart.type === "data-workingStatus") setWorkingStatus(dataPart.data.label);
    },
    onFinish: () => {
      setWorkingStatus(null);
      router.refresh();
    },
    onError: () => setWorkingStatus(null),
  });

  useEffect(() => {
    const serverLatest = initialMessages.at(-1)?.id;
    const clientLatest = messages.at(-1)?.id;
    if (initialMessages.length > messages.length || (initialMessages.length === messages.length && serverLatest && clientLatest && serverLatest !== clientLatest)) {
      setMessages(initialMessages);
    }
  }, [initialMessages, messages, setMessages]);

  useEffect(() => {
    const container = conversationRef.current;
    if (!container) return;
    if (!hasMounted.current) {
      hasMounted.current = true;
      container.scrollTop = container.scrollHeight;
      return;
    }
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 96) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      setHasUnseenMessages(false);
    } else {
      setHasUnseenMessages(true);
    }
  }, [messages]);

  async function sendText(text: string, responseId?: string) {
    await sendMessage({
      text,
      metadata: responseId ? { schemaVersion: "1", bookletId, responseId } : undefined,
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || status !== "ready") return;
    setInput("");
    await sendText(text);
  }

  async function submitCard(card: GenUICard, response: { action: CardAction; value?: unknown; revisionInstruction?: string }) {
    setCardError(null);
    setBusyCardId(card.cardId);
    try {
      const responseId = crypto.randomUUID();
      const result = await fetch(`/api/booklets/${bookletId}/cards/${card.cardId}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId, ...response }),
      });
      const body = await result.json() as CardResponseBody;
      if (!result.ok || !body.data) throw new Error(body.error?.message ?? "We could not save that decision.");
      setSubmittedCardIds((submitted) => new Set(submitted).add(card.cardId));
      if (body.data.followupRequired) await sendText(body.data.summary, responseId);
      else if (body.data.refreshRequired || (card.family === "artifact_review" && response.action === "approve_and_continue" && (card.payload.artifactType === "page_plan" || (card.payload.artifactType === "visual_bible" && card.variant === "summary")))) router.refresh();
    } catch (submissionError) {
      setCardError(submissionError instanceof Error ? submissionError.message : "We could not save that decision.");
    } finally {
      setBusyCardId(null);
    }
  }

  async function reopenCard(cardId: string) {
    setCardError(null);
    setBusyCardId(cardId);
    try {
      const result = await fetch(`/api/booklets/${bookletId}/cards/${cardId}/reopen`, { method: "POST" });
      const body = await result.json() as CardResponseBody;
      if (!result.ok || !body.data) throw new Error(body.error?.message ?? "We could not reopen that decision.");
      window.location.reload();
    } catch (reopenError) {
      setCardError(reopenError instanceof Error ? reopenError.message : "We could not reopen that decision.");
    } finally {
      setBusyCardId(null);
    }
  }

  function jumpToLatest() {
    const container = conversationRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    setHasUnseenMessages(false);
  }

  return (
    <section aria-label="Conversation" className="flex min-h-80 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="text-lg font-semibold">Creative partner</h2>
      <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" ref={conversationRef}>
        {messages.map((message) => <article className={`rounded-xl p-3 text-sm ${message.role === "user" ? "bg-[#fff7ee]" : "bg-white"}`} key={message.id}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">{message.role}</p>
          {message.parts.map((part, index) => {
            if (part.type === "text") return <p key={`${message.id}-${index}`}>{part.text}</p>;
            if (part.type === "data-card") {
              const card = submittedCardIds.has(part.data.cardId) ? { ...part.data, status: "submitted" as const } : part.data;
              return <CardRegistry busy={busyCardId === card.cardId} card={card} key={part.id ?? card.cardId} reopenCard={() => reopenCard(card.cardId)} submitResponse={(response) => submitCard(card, response)} />;
            }
            return null;
          })}
        </article>)}
        {workingStatus ? <p aria-live="polite" className="rounded-lg bg-[#f3e5d8] p-2 text-sm">{workingStatus}</p> : null}
        {error || cardError ? <p className="rounded-lg border border-red-300 p-2 text-sm text-red-700" role="alert">{error?.message ?? cardError}</p> : null}
      </div>
      {hasUnseenMessages ? <button className="mt-2 w-fit rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent)]" onClick={jumpToLatest} type="button">Jump to latest</button> : null}
      <form className="mt-3 flex gap-2" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="chat-message">Tell the creative partner what to change</label>
        <input autoComplete="off" className="min-w-0 flex-1 rounded-lg border border-[var(--border)] px-3 py-2" disabled={status !== "ready"} id="chat-message" name="message" onChange={(event) => setInput(event.target.value)} placeholder="Add a story detail or ask to begin…" value={input} />
        <button className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={status !== "ready" || !input.trim()} type="submit">Send</button>
      </form>
      {messages.length === initialMessages.length ? <button className="mt-2 w-fit text-sm font-semibold text-[var(--accent)]" disabled={status !== "ready"} onClick={() => void sendText("Please begin the guided questions.")} type="button">Start guided questions</button> : null}
    </section>
  );
}
