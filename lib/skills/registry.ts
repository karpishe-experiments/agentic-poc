import { z } from "zod";
import { artifactTypeSchema } from "@/lib/contracts/domain";
import { skillIdSchema, type SkillContext, type SkillId } from "@/lib/contracts/skills";

export type SkillDefinition<TInput = unknown, TOutput = unknown> = {
  id: SkillId;
  description: string;
  stages: z.infer<typeof artifactTypeSchema>[];
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  run(input: TInput, context: SkillContext): Promise<TOutput>;
};

export class SkillRegistry {
  private readonly definitions = new Map<SkillId, SkillDefinition>();

  public register(definition: SkillDefinition) {
    skillIdSchema.parse(definition.id);
    if (!definition.description || definition.stages.length === 0) throw new Error(`Skill ${definition.id} must declare a description and at least one stage.`);
    if (this.definitions.has(definition.id)) throw new Error(`Duplicate skill registration: ${definition.id}`);
    this.definitions.set(definition.id, definition);
  }

  public getAllowed(stage: z.infer<typeof artifactTypeSchema>): SkillDefinition[] {
    return [...this.definitions.values()].filter((definition) => definition.stages.includes(stage));
  }

  public get(id: SkillId): SkillDefinition {
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`Skill ${id} is not registered.`);
    return definition;
  }
}
