import type { Collection, Db } from "mongodb";
import type { MongoDocumentMap } from "@/db/documents";

export type MongoCollections = { [Name in keyof MongoDocumentMap]: Collection<MongoDocumentMap[Name]> };

export function createCollectionHandles(database: Db): MongoCollections {
  return {
    booklets: database.collection("booklets"), artifacts: database.collection("artifacts"), artifact_versions: database.collection("artifact_versions"),
    artifact_dependencies: database.collection("artifact_dependencies"), messages: database.collection("messages"), cards: database.collection("cards"),
    card_responses: database.collection("card_responses"), assets: database.collection("assets"), style_catalog: database.collection("style_catalog"),
    generation_jobs: database.collection("generation_jobs"), generation_items: database.collection("generation_items"), model_calls: database.collection("model_calls"),
    agent_definitions: database.collection("agent_definitions"), agent_versions: database.collection("agent_versions"), agent_version_events: database.collection("agent_version_events"),
    quality_reviews: database.collection("quality_reviews"), approvals: database.collection("approvals"), exports: database.collection("exports"),
    execution_preferences: database.collection("execution_preferences"), execution_batches: database.collection("execution_batches"), execution_items: database.collection("execution_items"),
    deployment_control: database.collection("deployment_control"),
  };
}
