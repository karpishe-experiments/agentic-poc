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
    expect(story).toMatchObject({ type: "object", description: expect.stringContaining("valid JSON text") });
    expect({ ...story, description: document.components.schemas.Story!.description }).toEqual(document.components.schemas.Story);
    expect(document.paths).not.toHaveProperty("/api/experiments/dify/tools/image");
  });

  it("keeps the illustration DSL sanitized and pins the approved plugin", () => {
    const dsl = readFileSync("docs/accepted/2026-09-16_agent-platform-decision/illustrate-panel.yml", "utf8");
    expect(dsl).toContain("langgenius/openai_tool:0.2.1@1a646f99f1ccbb3b5903704f5845d1f3ac7e4cfb6947087f28557a033976a039");
    expect(dsl).toContain("provider plugin can retry internally");
    expect(dsl).toContain("valid: {type: boolean, children: null}");
    expect(dsl).toContain("file: [generate_image, files]");
    expect(dsl).not.toContain("image: {type: file, children: null}");
    expect(dsl).not.toMatch(/key: expected_revision, type: number/);
    expect(dsl).toContain("value_type: secret");
    expect(dsl).toContain("value: ''");
    expect(dsl).not.toMatch(/sk-[A-Za-z0-9_-]{16,}/);
    expect(dsl).not.toContain("credential_id:");
  });
});
