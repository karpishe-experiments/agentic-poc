import { describe, expect, it } from "vitest";
import { storedManuscriptSchema } from "@/lib/contracts/experiment-runner";
import { materializePageLayout } from "@/db/experiment-pages";
import { simulatePaginationProposal } from "@/lib/experiment-runner/pagination-fixtures";
import { simulatePageBibleProposal } from "@/lib/experiment-runner/page-bible-fixtures";
import { id, paginationSources } from "@/tests/helpers/pagination-fixtures";

describe("model-free Page Bible fixtures", () => {
  for (const persona of ["playful_kid", "enthusiast_parent", "professional_creator"] as const) {
    it(`preserves ${persona} narration/dialogue once across physical pages`, () => {
      const sources = paginationSources(persona);
      const manuscript = storedManuscriptSchema.parse(sources.find((item) => item.taskId === "J05")!.content);
      manuscript.units.forEach((unit, index) => {
        unit.narration = `  Narration ${index}\n`;
        unit.dialogue = [{ speakerId: id(10), text: ` Dialogue ${index}  ` }];
      });
      sources.find((item) => item.taskId === "J05")!.content = manuscript;
      const proposal = simulatePaginationProposal({ persona, sources });
      if (proposal.kind !== "proposal") throw new Error("Expected layout.");
      let next = 100;
      const layout = materializePageLayout(persona, proposal.content, null, () => id(next++));
      sources.push({ taskId: "J11", id: id(90), content: layout });
      const outputs = layout.pages.map((page) => {
        const result = simulatePageBibleProposal({ persona, pageId: page.pageId, sources });
        if (result.kind !== "proposal") throw new Error("Expected Page Bible.");
        return result.content;
      });
      const lettering = outputs.flatMap((page) => page.panels.flatMap((panel) => panel.lettering));
      expect(lettering.filter((line) => line.kind === "title").map((line) => line.text)).toEqual([layout.title]);
      expect(lettering.filter((line) => line.kind === "narration").map((line) => line.text)).toEqual(manuscript.units.map((unit) => unit.narration));
      expect(lettering.filter((line) => line.kind === "speech").map((line) => line.text)).toEqual(manuscript.units.flatMap((unit) => unit.dialogue.map((line) => line.text)));
      expect(outputs.map((page) => page.pageId)).toEqual(layout.pages.map((page) => page.pageId));
      const current = outputs[1];
      const revised = simulatePageBibleProposal({ persona, pageId: current.pageId, sources, currentContent: current, revision: "Move the focal action left." });
      if (revised.kind !== "proposal") throw new Error("Expected revised Page Bible.");
      expect(revised.content.panels.map((panel) => panel.lettering)).toEqual(current.panels.map((panel) => panel.lettering));
      expect(revised.content.panels[0].composition).toContain("Move the focal action left.");
      expect(simulatePageBibleProposal({ persona, pageId: current.pageId, sources, materialQuestion: "Which focal action?" }))
        .toEqual({ kind: "clarification", question: "Which focal action?" });
      expect(simulatePageBibleProposal({ persona, pageId: current.pageId, sources, materialQuestion: "Which focal action?", answers: ["Which focal action?: The rescue."] }).kind).toBe("proposal");
      expect(() => simulatePageBibleProposal({ persona, pageId: id(999), sources })).toThrow("missing");
      expect(() => simulatePageBibleProposal({ persona, pageId: current.pageId, sources: sources.filter((item) => item.taskId !== "J05") })).toThrow("J05");
    });
  }
});
