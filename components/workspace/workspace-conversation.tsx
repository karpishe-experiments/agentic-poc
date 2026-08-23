"use client";

import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CardRegistry } from "@/components/cards/card-registry";
import type { CardAction, GenUICard } from "@/lib/contracts/cards";
import type { BookletUIMessage } from "@/lib/contracts/messages";

type CardResponseBody = { data?: { summary: string; followupRequired: boolean; refreshRequired?: boolean }; error?: { message?: string } };
const workspaceRefreshMessage = "The workspace needs a refresh. Your saved work is still available.";
type PendingSend = { text: string; responseId?: string };

export function isAgentConfigurationTransportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  const starts = [...message.matchAll(/\{/g)].map((match) => match.index ?? -1).filter((index) => index >= 0);
  return starts.some((start) => {
    try {
      const body = JSON.parse(message.slice(start)) as { error?: { code?: unknown; details?: { adminPath?: unknown } } };
      return body.error?.code === "agent_configuration_unavailable" && body.error.details?.adminPath === "/admin/agents";
    } catch {
      return false;
    }
  });
}

export function WorkspaceConversation({ bookletId, initialMessages, pendingCardFollowup }: Readonly<{ bookletId: string; initialMessages: BookletUIMessage[]; pendingCardFollowup: { responseId: string; summary: string } | null }>) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [workingStatus, setWorkingStatus] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [transportError, setTransportError] = useState<string | null>(null);
  const [agentConfigurationError, setAgentConfigurationError] = useState(false);
  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null);
  const [reloadSuggested, setReloadSuggested] = useState(false);
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const [submittedCardIds, setSubmittedCardIds] = useState<Set<string>>(() => new Set());
  const [hasUnseenMessages, setHasUnseenMessages] = useState(false);
  const conversationRef = useRef<HTMLDivElement>(null);
  const pendingSendRef = useRef<PendingSend | null>(null);
  const hasMounted = useRef(false);
  const transport = useMemo(() => new DefaultChatTransport<BookletUIMessage>({
    api: `/api/chat/${bookletId}`,
    prepareSendMessagesRequest: ({ messages }) => ({ body: { message: messages.at(-1) } }),
  }), [bookletId]);
  const { messages, sendMessage, setMessages, status, clearError } = useChat<BookletUIMessage>({
    id: bookletId,
    messages: initialMessages,
    transport,
    onData: (dataPart) => {
      if (dataPart.type === "data-workingStatus") setWorkingStatus(dataPart.data.label);
    },
    onFinish: ({ isError }) => {
      setWorkingStatus(null);
      if (!isError) {
        pendingSendRef.current = null;
        setPendingSend(null);
        setTransportError(null);
        setAgentConfigurationError(false);
        router.refresh();
      }
    },
    onError: (error) => {
      setWorkingStatus(null);
      const pending = pendingSendRef.current;
      if (pending && !pending.responseId) setInput(pending.text);
      const isConfigurationError = isAgentConfigurationTransportError(error);
      setAgentConfigurationError(isConfigurationError);
      setTransportError(isConfigurationError
        ? "Runtime agent configuration needs repair. Your saved booklet work is unchanged."
        : "The connection was interrupted. Your saved work is still available.");
    },
  });

  useEffect(() => {
    // Persisted Agent Run cards evolve in place while their message IDs remain
    // stable. A router refresh must therefore reconcile projections as well as
    // appended messages.
    setMessages(initialMessages);
  }, [initialMessages, setMessages]);

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
    pendingSendRef.current = { text, responseId };
    setPendingSend({ text, responseId });
    await sendMessage({
      text,
      metadata: responseId ? { schemaVersion: "1", bookletId, responseId } : undefined,
    });
  }

  async function readCardResponse(result: Response): Promise<CardResponseBody> {
    try {
      return await result.json() as CardResponseBody;
    } catch {
      setReloadSuggested(true);
      throw new Error(workspaceRefreshMessage);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || status !== "ready") return;
    setInput("");
    await sendText(text);
  }

  async function retryPendingSend() {
    const pending = pendingSendRef.current;
    if (!pending || status !== "ready") return;
    clearError();
    setCardError(null);
    setTransportError(null);
    setAgentConfigurationError(false);
    await sendText(pending.text, pending.responseId);
  }

  async function resumeSavedDecision() {
    if (!pendingCardFollowup || status !== "ready") return;
    await sendText(pendingCardFollowup.summary, pendingCardFollowup.responseId);
  }

  async function submitCard(card: GenUICard, response: { action: CardAction; value?: unknown; revisionInstruction?: string }) {
    setCardError(null);
    setReloadSuggested(false);
    setBusyCardId(card.cardId);
    try {
      const responseId = crypto.randomUUID();
      const result = await fetch(`/api/booklets/${bookletId}/cards/${card.cardId}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId, ...response }),
      });
      const body = await readCardResponse(result);
      if (!result.ok || !body.data) throw new Error(body.error?.message ?? "We could not save that decision.");
      if (card.family !== "agent_run") setSubmittedCardIds((submitted) => new Set(submitted).add(card.cardId));
      const advancesGuidedFlow = card.family === "artifact_review" && response.action === "approve_and_continue" && (
        (card.variant === "summary" && (card.payload.artifactType === "audience_profile" || card.payload.artifactType === "story_plan"))
        || (card.variant === "visual_gallery" && (card.payload.artifactType === "visual_bible" || card.payload.artifactType === "final_pages"))
      );
      if (body.data.followupRequired) await sendText(body.data.summary, responseId);
      else if (body.data.refreshRequired) router.refresh();
      else if (advancesGuidedFlow) await sendText(body.data.summary);
      else router.refresh();
    } catch (submissionError) {
      setCardError(submissionError instanceof Error ? submissionError.message : "We could not save that decision.");
    } finally {
      setBusyCardId(null);
    }
  }

  async function reopenCard(cardId: string) {
    setCardError(null);
    setReloadSuggested(false);
    setBusyCardId(cardId);
    try {
      const result = await fetch(`/api/booklets/${bookletId}/cards/${cardId}/reopen`, { method: "POST" });
      const body = await readCardResponse(result);
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

  const hasStartedGuidedFlow = messages.some((message) => message.role === "assistant" || Boolean(message.metadata?.responseId));
  const earlierMessages = messages.slice(0, -5);
  const currentMessages = messages.slice(-5);
  const renderMessage = (message: BookletUIMessage) => <article className={`rounded-xl p-3 text-sm ${message.role === "user" ? "bg-[#fff7ee]" : "bg-white"}`} key={message.id}>
    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">{message.role}</p>
    {message.parts.map((part, index) => {
      if (part.type === "text") return <p key={`${message.id}-${index}`}>{part.text}</p>;
      if (part.type === "data-card") {
        const card = submittedCardIds.has(part.data.cardId) ? { ...part.data, status: "submitted" as const } : part.data;
        return <CardRegistry bookletId={bookletId} busy={busyCardId === card.cardId} card={card} key={part.id ?? card.cardId} refreshWorkspace={() => router.refresh()} reopenCard={() => reopenCard(card.cardId)} submitResponse={(response) => submitCard(card, response)} />;
      }
      return null;
    })}
  </article>;

  return (
    <section aria-label="Conversation" className="flex min-h-80 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="text-lg font-semibold">Creative partner</h2>
      <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" ref={conversationRef}>
        {earlierMessages.length ? <details className="rounded-xl border border-[var(--border)] bg-[#fffaf2] p-3"><summary className="cursor-pointer text-sm font-semibold">Show {earlierMessages.length} earlier message{earlierMessages.length === 1 ? "" : "s"}</summary><div className="mt-3 space-y-3">{earlierMessages.map(renderMessage)}</div></details> : null}
        {currentMessages.map(renderMessage)}
        {workingStatus ? <p aria-live="polite" className="rounded-lg bg-[#f3e5d8] p-2 text-sm">{workingStatus}</p> : null}
        {transportError || cardError ? <div className="rounded-lg border border-red-300 p-2 text-sm text-red-700" role="alert"><p>{transportError ?? cardError}</p>{transportError ? <div className="mt-2 flex flex-wrap gap-2"><button className="rounded border border-red-500 px-2 py-1 font-semibold" disabled={!pendingSend || status !== "ready"} onClick={() => void retryPendingSend()} type="button">Retry</button>{agentConfigurationError ? <Link className="rounded border border-red-500 px-2 py-1 font-semibold" href="/admin/agents">Agents</Link> : null}<button className="rounded border border-red-500 px-2 py-1 font-semibold" onClick={() => { clearError(); setCardError(null); setTransportError(null); setAgentConfigurationError(false); setReloadSuggested(false); router.refresh(); }} type="button">Reload workspace</button></div> : reloadSuggested ? <button className="mt-2 rounded border border-red-500 px-2 py-1 font-semibold" onClick={() => { clearError(); setCardError(null); setTransportError(null); setReloadSuggested(false); router.refresh(); }} type="button">Reload workspace</button> : null}</div> : null}
      </div>
      {hasUnseenMessages ? <button className="mt-2 w-fit rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent)]" onClick={jumpToLatest} type="button">Jump to latest</button> : null}
      <form className="mt-3 flex gap-2" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="chat-message">Tell the creative partner what to change</label>
        <input autoComplete="off" className="min-w-0 flex-1 rounded-lg border border-[var(--border)] px-3 py-2" disabled={status !== "ready"} id="chat-message" name="message" onChange={(event) => setInput(event.target.value)} placeholder="Add a story detail or ask to begin…" value={input} />
        <button className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={status !== "ready" || !input.trim()} type="submit">Send</button>
      </form>
      {pendingCardFollowup ? <button className="mt-2 w-fit rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent)]" disabled={status !== "ready"} onClick={() => void resumeSavedDecision()} type="button">Resume saved decision</button> : null}
      {!hasStartedGuidedFlow ? <button className="mt-2 w-fit text-sm font-semibold text-[var(--accent)]" disabled={status !== "ready"} onClick={() => void sendText("Please begin the guided questions.")} type="button">Start guided questions</button> : null}
    </section>
  );
}
