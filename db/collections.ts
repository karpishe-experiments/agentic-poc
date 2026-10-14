import type { Collection, Db } from "mongodb";
import type { MongoDocumentMap } from "@/db/documents";
import { boundedCollection } from "@/db/bounded-collection";

export type MongoCollections = { [Name in keyof MongoDocumentMap]: Collection<MongoDocumentMap[Name]> };

export function createCollectionHandles(database: Db): MongoCollections {
  const collections: MongoCollections = {
    experiment_campaigns: database.collection("experiment_campaigns"),
    experiment_runs: database.collection("experiment_runs"), experiment_operations: database.collection("experiment_operations"),
    experiment_delegations: database.collection("experiment_delegations"),
    booklets: database.collection("booklets"), artifacts: database.collection("artifacts"), artifact_versions: database.collection("artifact_versions"),
    artifact_dependencies: database.collection("artifact_dependencies"), messages: database.collection("messages"), cards: database.collection("cards"),
    card_responses: database.collection("card_responses"), assets: database.collection("assets"), style_catalog: database.collection("style_catalog"),
    generation_jobs: database.collection("generation_jobs"), generation_items: database.collection("generation_items"), model_calls: database.collection("model_calls"),
    agent_definitions: database.collection("agent_definitions"), agent_versions: database.collection("agent_versions"), agent_version_events: database.collection("agent_version_events"),
    quality_reviews: database.collection("quality_reviews"), approvals: database.collection("approvals"), exports: database.collection("exports"),
    execution_preferences: database.collection("execution_preferences"), execution_batches: database.collection("execution_batches"), execution_items: database.collection("execution_items"),
    deployment_control: database.collection("deployment_control"),
  };
  function bind<Name extends keyof MongoCollections>(name: Name) {
    // Each name keeps its original typed collection interface.
    const collection = database.collection<MongoDocumentMap[Name]>(name);
    Object.defineProperty(collections, name, { value: boundedCollection(collection,
      (timeoutMS) => database.collection<MongoDocumentMap[Name]>(name, { timeoutMS })), enumerable: true });
  }
  for (const name of Object.keys(collections) as (keyof MongoCollections)[]) bind(name);
  return collections;
}
