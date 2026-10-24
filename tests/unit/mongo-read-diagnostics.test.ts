import { EventEmitter } from "node:events";
import type { MongoClient } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { installMongoReadDiagnostics, observeMongoRead } from "@/db/mongo-read-diagnostics";

describe("public MongoDB read monitoring", () => {
  it("shares request scopes with listeners created by another module bundle", async () => {
    const events = new EventEmitter(); installMongoReadDiagnostics(events as MongoClient);
    vi.resetModules();
    const routeModule = await import("@/db/mongo-read-diagnostics");
    const result = await routeModule.observeMongoRead(() => routeModule.withMongoReadPhase("proofs", async () => {
      events.emit("connectionCheckedOut", { durationMS: 4 });
      events.emit("commandSucceeded", { commandName: "find", duration: 12, reply: { cursor: { firstBatch: [1] } } });
    }));
    expect(result.metrics).toMatchObject({ checkoutMs: 4, commands: [{ phase: "proofs", command: "find", elapsedMs: 12 }] });
  });
  it("keeps bounded numeric measurements without retaining commands, replies or connection identities", async () => {
    const events = new EventEmitter(); installMongoReadDiagnostics(events as MongoClient);
    events.emit("connectionCheckedOut", { durationMS: 999 });
    const observed = await observeMongoRead(async () => {
      events.emit("connectionCheckedOut", { durationMS: 12 });
      events.emit("connectionCheckOutFailed", { durationMS: 3, reason: "private-host" });
      events.emit("commandSucceeded", { commandName: "find", duration: 20, reply: { cursor: { firstBatch: ["private-proof"] } }, address: "private-host" });
      events.emit("commandSucceeded", { commandName: "getMore", duration: 5, reply: { cursor: { nextBatch: [1, 2] } } });
      events.emit("commandFailed", { commandName: "explain", duration: 7, failure: "private-proof" });
      events.emit("commandSucceeded", { commandName: "insert", duration: 9, reply: "private-proof" });
      return 1;
    });
    expect(observed).toMatchObject({ value: 1, metrics: { checkoutCount: 1, checkoutFailed: 1, checkoutMs: 15,
      commands: [{ command: "find", elapsedMs: 20, outcome: "succeeded", batchRows: 1 },
        { command: "getMore", elapsedMs: 5, outcome: "succeeded", batchRows: 2 },
        { command: "explain", elapsedMs: 7, outcome: "failed", batchRows: null }] } });
    expect(JSON.stringify(observed)).not.toContain("private");
  });
  it("isolates concurrent scopes, caps commands and retains timing on failure", async () => {
    const events = new EventEmitter(); installMongoReadDiagnostics(events as MongoClient);
    const [failed, other] = await Promise.all([observeMongoRead(async () => {
      for (let i = 0; i < 105; i++) events.emit("commandSucceeded", { commandName: "find", duration: 1, reply: {} });
      await Promise.resolve(); throw new Error("private-error");
    }), observeMongoRead(async () => { events.emit("connectionCheckedOut", { durationMS: 2 }); return true; })]);
    expect(failed.metrics.commands).toHaveLength(100); expect(failed.metrics.droppedCommands).toBe(5);
    expect(failed).toMatchObject({ value: null, failure: { errorKind: "Error" } });
    expect(other.metrics).toMatchObject({ commands: [], checkoutMs: 2 });
    expect(JSON.stringify(failed)).not.toContain("private");
  });
});
