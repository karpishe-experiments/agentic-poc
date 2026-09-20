import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Schema = Record<string, unknown>;

describe("Dify experiment OpenAPI contract", () => {
  it("inlines the draft Story request without drifting from the canonical component", () => {
    const document = JSON.parse(readFileSync("docs/accepted/2026-09-16_agent-platform-decision/tools.openapi.json", "utf8")) as {
      paths: Record<string, { post: { requestBody: { content: { "application/json": { schema: { properties: Record<string, Schema> } } } } } }>;
      components: { schemas: Record<string, Schema> };
    };

    const story = document.paths["/api/experiments/dify/tools/draft"]!.post.requestBody.content["application/json"].schema.properties.story!;
    expect(story).not.toHaveProperty("$ref");
    expect({ ...story, description: document.components.schemas.Story!.description }).toEqual(document.components.schemas.Story);
  });
});
