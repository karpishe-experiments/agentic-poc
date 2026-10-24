import { AsyncLocalStorage } from "node:async_hooks";
import type { MongoClient, CommandSucceededEvent, CommandFailedEvent } from "mongodb";
import { safeFailure } from "@/lib/operations/completion-failure";

type ReadPhase = "selection" | "proofs" | "plan";
type Command = { phase: ReadPhase | null; command: "find" | "getMore" | "explain"; elapsedMs: number; outcome: "succeeded" | "failed"; batchRows: number | null };
type Observation = { checkoutCount: number; checkoutFailed: number; checkoutMs: number; commands: Command[]; droppedCommands: number };
const scope = new AsyncLocalStorage<Observation>();
const phase = new AsyncLocalStorage<ReadPhase>();

export function withMongoReadPhase<T>(name: ReadPhase, work: () => Promise<T>) { return phase.run(name, work); }

// Public monitoring events only. Never copy command/reply documents, connection
// identities, addresses or errors into the diagnostic result.
export function installMongoReadDiagnostics(client: MongoClient) {
  client.on("connectionCheckedOut", event => {
    const state = scope.getStore();
    if (state) { state.checkoutCount++; state.checkoutMs += event.durationMS; }
  });
  client.on("connectionCheckOutFailed", event => {
    const state = scope.getStore();
    if (state) { state.checkoutFailed++; state.checkoutMs += event.durationMS; }
  });
  const record = (event: CommandSucceededEvent | CommandFailedEvent, succeeded: boolean) => {
    const state = scope.getStore();
    if (!state || !["find", "getMore", "explain"].includes(event.commandName)) return;
    if (state.commands.length >= 100) { state.droppedCommands++; return; }
    let batchRows: number | null = null;
    if (succeeded && "reply" in event && event.reply && typeof event.reply === "object") {
      const cursor = (event.reply as { cursor?: { firstBatch?: unknown; nextBatch?: unknown } }).cursor;
      const batch = cursor?.firstBatch ?? cursor?.nextBatch;
      if (Array.isArray(batch)) batchRows = batch.length;
    }
    state.commands.push({ phase: phase.getStore() ?? null, command: event.commandName as Command["command"], elapsedMs: Math.round(event.duration),
      outcome: succeeded ? "succeeded" : "failed", batchRows });
  };
  client.on("commandSucceeded", event => record(event, true));
  client.on("commandFailed", event => record(event, false));
}

export async function observeMongoRead<T>(work: () => Promise<T>) {
  const state: Observation = { checkoutCount: 0, checkoutFailed: 0, checkoutMs: 0, commands: [], droppedCommands: 0 };
  const start = performance.now();
  return scope.run(state, async () => {
    try {
      return { value: await work(), metrics: state, elapsedMs: Math.round(performance.now() - start) };
    } catch (error) {
      return { value: null, failure: safeFailure(error), metrics: state, elapsedMs: Math.round(performance.now() - start) };
    } finally { state.checkoutMs = Math.round(state.checkoutMs); }
  });
}
