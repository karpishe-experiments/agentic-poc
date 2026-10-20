import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it } from "vitest";

it("proves the reviewed optional recovery annotation does not change emitted document runtime code", () => {
  const current = readFileSync("db/documents.ts", "utf8").replaceAll("\r\n", "\n");
  const metadata = "  m4CompletionRecovery?: { reference: string; evidenceDigest: string; requestDigest: string; recoveredAtMs: number };\n";
  expect(current.split(metadata)).toHaveLength(2);
  const prior = current.replace(metadata, "");
  const emit = (input: string) => ts.transpileModule(input, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  expect(emit(current)).toBe(emit(prior));
});
