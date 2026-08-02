import { randomUUID } from "node:crypto";
import { pagePlanSchema, storyPlanSchema } from "@/lib/contracts/artifacts";
import type { PagePlanDraft, StoryPlanDraft } from "@/lib/contracts/drafts";

type StoryPlan = ReturnType<typeof storyPlanSchema.parse>;
type PagePlan = ReturnType<typeof pagePlanSchema.parse>;
type NewId = () => string;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function materializeStoryPlan(draft: StoryPlanDraft, previous: StoryPlan | null, newId: NewId = randomUUID): StoryPlan {
  const previousCharacters = new Set(previous?.characters.map((entity) => entity.entityId) ?? []);
  const previousSettings = new Set(previous?.settings.map((entity) => entity.entityId) ?? []);
  const usedIds = new Set<string>();
  const clientKeys = new Set<string>();
  const resolve = <T extends { kind: "existing" | "new"; entityId?: string; clientKey?: string }>(entity: T, allowed: Set<string>) => {
    if (entity.kind === "existing") {
      assert(entity.entityId && allowed.has(entity.entityId), "A model may reference only an existing entity ID in the same Story Plan collection.");
      assert(!usedIds.has(entity.entityId), "An existing Story Plan entity may be referenced only once.");
      usedIds.add(entity.entityId);
      const persistent = { ...entity };
      delete (persistent as { kind?: unknown }).kind;
      return persistent;
    }
    assert(entity.clientKey && !clientKeys.has(entity.clientKey), "Each new Story Plan entity needs a unique clientKey.");
    clientKeys.add(entity.clientKey);
    const persistent = { ...entity };
    delete (persistent as { kind?: unknown }).kind;
    delete (persistent as { clientKey?: unknown }).clientKey;
    const entityId = newId();
    assert(!usedIds.has(entityId), "The application ID generator returned a duplicate entity ID.");
    usedIds.add(entityId);
    return { ...persistent, entityId };
  };
  return storyPlanSchema.parse({
    ...draft,
    characters: draft.characters.map((entity) => resolve(entity, previousCharacters)),
    settings: draft.settings.map((entity) => resolve(entity, previousSettings)),
  });
}

export function materializePagePlan(draft: PagePlanDraft, previous: PagePlan | null, newId: NewId = randomUUID): PagePlan {
  const previousByPosition = new Map((previous?.pages ?? []).map((page) => [`${page.pageIndex}:${page.kind}`, page.pageId]));
  const usedIds = new Set<string>();
  return pagePlanSchema.parse({
    ...draft,
    pages: draft.pages.map((page) => {
      const pageId = previousByPosition.get(`${page.pageIndex}:${page.kind}`) ?? newId();
      assert(!usedIds.has(pageId), "The application ID generator returned a duplicate page ID.");
      usedIds.add(pageId);
      return { ...page, pageId };
    }),
  });
}
