import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { assembledCharacterSheetSchema, assembledLocationSheetSchema } from "@/lib/contracts/experiment-references";

const sourcesSchema = z.array(z.object({ id: opaqueIdSchema, taskId: z.string(), content: z.unknown(),
  subjectKind: z.string().optional(), subjectId: opaqueIdSchema.optional() }));

// Only server-saved approved sources supply version and image identities. This
// runs before preparation is saved and again when its output is interpreted.
export function m4LayoutCatalog(raw: unknown) {
  const catalog = new Map<string, { subjectKind: "character" | "location"; subjectId: string; artifactVersionId: string; assetId: string }>();
  const assets = new Set<string>();
  for (const row of sourcesSchema.parse(raw).filter(row => row.taskId === "J09" || row.taskId === "J10")) {
    const character = row.taskId === "J09";
    const sheet = character ? assembledCharacterSheetSchema.parse(row.content) : assembledLocationSheetSchema.parse(row.content);
    const subjectKind = character ? "character" as const : "location" as const;
    const subjectId = character ? (sheet as { characterId: string }).characterId : (sheet as { locationId: string }).locationId;
    const key = `${subjectKind}:${subjectId}`;
    if (row.subjectKind !== subjectKind || row.subjectId !== subjectId || catalog.has(key) || assets.has(sheet.build.assetId)) {
      throw new Error("M4 prepared sheet catalog is inconsistent or ambiguous.");
    }
    assets.add(sheet.build.assetId);
    catalog.set(key, { subjectKind, subjectId, artifactVersionId: row.id, assetId: sheet.build.assetId });
  }
  if (!catalog.size) throw new Error("M4 prepared sheet catalog is empty.");
  return catalog;
}
