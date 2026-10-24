import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { DryMongoBinary, MongoMemoryReplSet } from "mongodb-memory-server";
import { expect, it } from "vitest";
import { createMongoDatabase, withMongoTransaction } from "@/db/client";
import { withOperationBudget } from "@/lib/operations/budget";
import { boundedCollection } from "@/db/bounded-collection";

it.each(["zlib", "disabled"] as const)("preserves full evidence, cursor batches and transactions with server compression %s", async (compression) => {
  const binary = await DryMongoBinary.locateBinary(await DryMongoBinary.generateOptions());
  const server = await MongoMemoryReplSet.create({
    ...(binary ? { binary: { systemBinary: binary } } : {}),
    replSet: { count: 1, storageEngine: "wiredTiger", args: ["--networkMessageCompressors", compression] },
  });
  const databaseName = `compression_${randomUUID().replaceAll("-", "")}`;
  const context = createMongoDatabase({ uri: server.getUri(), databaseName });
  // An uncompressed observer keeps status reads out of compression counters.
  const observer = new MongoClient(server.getUri(), { compressors: [] });
  try {
    type Evidence = { _id: string; proof: string; approved: boolean };
    const collection = boundedCollection(context.database.collection<Evidence>("evidence"),
      (timeoutMS) => context.database.collection<Evidence>("evidence", { timeoutMS }));
    await context.client.connect();
    const counters = async () => {
      const status = await observer.db("admin").command({ serverStatus: 1 });
      const zlib = status.network.compression?.zlib;
      return {
        incoming: Number(zlib?.decompressor?.bytesOut ?? 0),
        incomingWire: Number(zlib?.decompressor?.bytesIn ?? 0),
        outgoing: Number(zlib?.compressor?.bytesIn ?? 0),
        outgoingWire: Number(zlib?.compressor?.bytesOut ?? 0),
      };
    };
    const before = await counters();
    const documents = Array.from({ length: 4 }, (_, index) => ({
      _id: `proof-${index}`, approved: false,
      proof: JSON.stringify({ request: "exact saved prompt and provider evidence ".repeat(20_000), index }),
    }));
    await collection.insertMany(documents);
    await withOperationBudget(Date.now() + 15_000, () => withMongoTransaction(context, async (session) => {
      const found = await collection.find({}, { session, batchSize: 1 }).sort({ _id: 1 }).toArray();
      expect(found).toEqual(documents);
      const aggregated = await collection.aggregate([{ $sort: { _id: 1 } }], { session, batchSize: 1 }).toArray();
      expect(aggregated).toEqual(documents);
      await collection.updateOne({ _id: documents[0]._id }, { $set: { approved: true } }, { session });
    }));
    expect(await collection.findOne({ _id: documents[0]._id })).toEqual({ ...documents[0], approved: true });
    const after = await counters();
    const delta = Object.fromEntries(Object.keys(before).map((key) => [key, after[key as keyof typeof after] - before[key as keyof typeof before]]));
    if (compression === "zlib") {
      expect(delta.incoming).toBeGreaterThan(3_000_000);
      expect(delta.outgoing).toBeGreaterThan(6_000_000);
      expect(delta.incomingWire).toBeLessThan(delta.incoming / 10);
      expect(delta.outgoingWire).toBeLessThan(delta.outgoing / 10);
    } else {
      expect(delta).toEqual({ incoming: 0, incomingWire: 0, outgoing: 0, outgoingWire: 0 });
    }
  } finally {
    await context.close();
    await observer.close();
    await server.stop();
  }
}, 60_000);
