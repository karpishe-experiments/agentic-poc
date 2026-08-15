import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { pagePackageSchema, pagePlanSchema, storyCharacterSchema, storyPlanSchema, storySettingSchema } from "@/lib/contracts/artifacts";

const clientKeySchema = z.string().trim().min(1).max(120);

const existingCharacterChangeSchema = storyCharacterSchema.extend({ kind: z.literal("existing") });
const newCharacterChangeSchema = storyCharacterSchema.omit({ entityId: true }).extend({ kind: z.literal("new"), clientKey: clientKeySchema });
export const storyCharacterChangeSchema = z.discriminatedUnion("kind", [existingCharacterChangeSchema, newCharacterChangeSchema]);

const existingSettingChangeSchema = storySettingSchema.extend({ kind: z.literal("existing") });
const newSettingChangeSchema = storySettingSchema.omit({ entityId: true }).extend({ kind: z.literal("new"), clientKey: clientKeySchema });
export const storySettingChangeSchema = z.discriminatedUnion("kind", [existingSettingChangeSchema, newSettingChangeSchema]);

export const storyPlanDraftSchema = z.object({ ...storyPlanSchema.shape,
  characters: z.array(storyCharacterChangeSchema).max(12),
  settings: z.array(storySettingChangeSchema).max(12),
});

export const pagePackageDraftSchema = z.object(pagePackageSchema.shape).omit({ pageId: true });
export const pagePlanDraftSchema = z.object({ ...pagePlanSchema.shape,
  pages: z.array(pagePackageDraftSchema).min(4).max(9),
});

export type StoryPlanDraft = z.infer<typeof storyPlanDraftSchema>;
export type PagePlanDraft = z.infer<typeof pagePlanDraftSchema>;

export function storyPlanAsExistingChanges(plan: z.infer<typeof storyPlanSchema>): StoryPlanDraft {
  return {
    ...plan,
    characters: plan.characters.map((character) => ({ ...character, kind: "existing" as const })),
    settings: plan.settings.map((setting) => ({ ...setting, kind: "existing" as const })),
  };
}

export function persistentStoryPlanToDraft(content: unknown, current: z.infer<typeof storyPlanSchema> | null): StoryPlanDraft | null {
  const parsed = storyPlanSchema.safeParse(content);
  if (!parsed.success) return null;
  if (!current) {
    return {
      ...parsed.data,
      characters: parsed.data.characters.map((character, index) => {
        const draft = { ...character };
        delete (draft as { entityId?: unknown }).entityId;
        return { ...draft, kind: "new" as const, clientKey: `character-${index + 1}` };
      }),
      settings: parsed.data.settings.map((setting, index) => {
        const draft = { ...setting };
        delete (draft as { entityId?: unknown }).entityId;
        return { ...draft, kind: "new" as const, clientKey: `setting-${index + 1}` };
      }),
    };
  }
  const characterIds = new Set(current.characters.map((character) => character.entityId));
  const settingIds = new Set(current.settings.map((setting) => setting.entityId));
  if (parsed.data.characters.some((character) => !characterIds.has(character.entityId)) || parsed.data.settings.some((setting) => !settingIds.has(setting.entityId))) return null;
  return storyPlanAsExistingChanges(parsed.data);
}

export function persistentPagePlanToDraft(content: unknown, current: z.infer<typeof pagePlanSchema> | null): PagePlanDraft | null {
  const parsed = pagePlanSchema.safeParse(content);
  if (!parsed.success || !current) return null;
  const pageIds = new Set(current.pages.map((page) => page.pageId));
  if (parsed.data.pages.some((page) => !pageIds.has(page.pageId))) return null;
  return {
    ...parsed.data,
    pages: parsed.data.pages.map((page) => {
      const draft = { ...page };
      delete (draft as { pageId?: unknown }).pageId;
      return draft;
    }),
  };
}

export { opaqueIdSchema };
